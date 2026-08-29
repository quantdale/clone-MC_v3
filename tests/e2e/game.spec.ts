import { test, expect, type Page } from '@playwright/test';

/**
 * Playwright browser tests for the voxel game.
 *
 * These run against a production build served by `vite preview` (see
 * playwright.config.ts). The dedicated E2E build flag exposes
 * `window.__voxelGame` for test hooks without enabling it in normal releases.
 */

/** Wait for the game to boot and the loading indicator to clear. */
async function waitForGame(page: Page): Promise<void> {
  // The E2E build exposes window.__voxelGame for test hooks (see src/main.ts).
  await page.goto('/');
  // The loading panel is visible on boot; wait for it to be hidden (world ready).
  // `#loading` becomes `display:none` via the `hidden` class, so use the 'hidden'
  // state rather than 'visible'. Overworld is now 6×64 slabs (384 blocks, 24
  // sections) so initial generation is ~6× the legacy single-slab cost; allow
  // 60s for software WebGL at ~5 FPS in headless CI.
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60_000 });
}

/** Enter pointer lock by clicking the canvas. */
async function enterPointerLock(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await page.waitForFunction(() => document.pointerLockElement !== null, { timeout: 5000 });
  // Also wait for the game's async pointer-lock flag so the next
  // mouse event is not raced out by the `pointerlockchange` handler
  // (software WebGL at ~5 FPS on CI can lag one frame behind the DOM).
  await page.waitForFunction(
    () =>
      (window as unknown as { __voxelGame?: { inputHandle?: { isLocked(): boolean } } }).__voxelGame?.inputHandle?.isLocked?.() === true,
    { timeout: 5000 },
  );
}

test.describe('voxel game', () => {
  test('initializes without fatal console errors and renders the canvas', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await waitForGame(page);

    // The canvas exists and is rendering.
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
    const hasWebGL = await page.evaluate(() => {
      const c = document.getElementById('game-canvas') as HTMLCanvasElement;
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      return gl !== null;
    });
    expect(errors).toEqual([]);
    expect(hasWebGL).toBeTruthy();
  });

  test('shows the start overlay and hides it on pointer lock', async ({ page }) => {
    await waitForGame(page);
    await expect(page.locator('#overlay')).toBeVisible();
    await enterPointerLock(page);
    await expect(page.locator('#overlay')).toBeHidden();

    // Explicitly release the lock as a deterministic equivalent of pressing
    // Escape in headless Chromium, then verify the pause overlay and relock
    // path both remain functional.
    await page.evaluate(() => document.exitPointerLock());
    await expect(page.locator('#overlay')).toBeVisible();
    await expect(page.locator('#hotbar')).toBeHidden();
    await enterPointerLock(page);
    await expect(page.locator('#overlay')).toBeHidden();
    await expect(page.locator('#hotbar')).toBeVisible();
  });

  test('keeps pointer-lock failures recoverable', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
    await expect(page.locator('#overlay')).toBeVisible();
    await expect(page.locator('#error')).toBeHidden();
    await expect(page.locator('#overlay-message')).toContainText('Pointer lock failed');
  });

  test('clears movement when the page loses focus', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await page.keyboard.down('KeyW');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const movement = await page.evaluate(() => {
      const game = (window as unknown as { __voxelGame?: { input?: { moveForward?: boolean } } }).__voxelGame;
      return game?.input?.moveForward ?? true;
    });
    expect(movement).toBe(false);
    await expect(page.locator('#overlay')).toBeVisible();
    await page.keyboard.up('KeyW');
  });

  test('crosshair and hotbar are visible once the world is ready', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await expect(page.locator('#hotbar')).toBeVisible();
    // At least one hotbar slot is rendered.
    await expect(page.locator('.hotbar-slot')).toHaveCount(9);
    await expect(page.locator('#crosshair')).toBeVisible();
  });

  test('hotbar selection changes with number keys', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    // Default slot is 0. Press 3 to select slot index 2.
    await page.keyboard.press('Digit3');
    const selected = page.locator('.hotbar-slot.selected');
    await expect(selected).toHaveAttribute('data-index', '2');
  });

  test('hotbar selection wraps with the mouse wheel', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    // Number keys select absolute slots (Digit9 → slot 8, the last one).
    await page.keyboard.press('Digit9');
    await expect(page.locator('.hotbar-slot.selected')).toHaveAttribute('data-index', '8');
    // A single wheel-down tick cycles +1, wrapping from the last slot to 0.
    await page.mouse.wheel(0, 300);
    await expect(page.locator('.hotbar-slot.selected')).toHaveAttribute('data-index', '0');
    // The selected-block-name chip reflects the wrapped selection.
    await expect(page.locator('#selected-block-name')).not.toBeEmpty();
  });

  test('opens the inventory and crafts from the recipe book', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await page.keyboard.press('KeyC');

    await expect(page.locator('#crafting')).toBeVisible();
    await expect(page.locator('#hotbar')).toBeHidden();
    await expect(page.locator('#crafting .inventory-cell')).toHaveCount(36);
    await expect(page.locator('.crafting-recipe')).toHaveCount(9);
    await expect(page.locator('.crafting-recipe[data-recipe="planks"]')).toBeDisabled();

    // Supply one log through the test-only game handle, then use the same DOM
    // recipe button a player would use after gathering a tree.
    await page.evaluate(() => {
      const game = (window as unknown as {
        __voxelGame?: {
          inventory: { addItem(id: number, amount: number): number };
          craftingPanel: { render(registry: unknown): void };
          registry: unknown;
        };
      }).__voxelGame;
      if (!game) throw new Error('test game handle missing');
      game.inventory.addItem(7, 1);
      game.craftingPanel.render(game.registry);
    });
    await expect(page.locator('.crafting-recipe[data-recipe="planks"]')).toBeEnabled();
    await page.locator('.crafting-recipe[data-recipe="planks"]').click();
    const planks = await page.evaluate(() => {
      const game = (window as unknown as { __voxelGame?: { inventory: { getItemCount(id: number): number } } }).__voxelGame;
      return game?.inventory.getItemCount(12) ?? 0;
    });
    expect(planks).toBe(4);

    // Continue the material chain into a usable tool and verify the crafted
    // item is placed into the player's quick-access inventory.
    await page.evaluate(() => {
      const game = (window as unknown as {
        __voxelGame?: {
          inventory: { addItem(id: number, amount: number): number };
          craftingPanel: { render(registry: unknown): void };
          registry: unknown;
        };
      }).__voxelGame;
      if (!game) throw new Error('test game handle missing');
      game.inventory.addItem(7, 2);
      game.craftingPanel.render(game.registry);
    });
    await page.locator('.crafting-recipe[data-recipe="planks"]').click();
    await page.locator('.crafting-recipe[data-recipe="sticks"]').click();
    await page.locator('.crafting-recipe[data-recipe="wooden_pickaxe"]').click();
    const tool = await page.evaluate(() => {
      const game = (window as unknown as { __voxelGame?: { inventory: { getItemCount(id: number): number } } }).__voxelGame;
      return game?.inventory.getItemCount(20) ?? 0;
    });
    expect(tool).toBe(1);
    await page.locator('#crafting-close').click();
    await enterPointerLock(page);
    await expect(page.locator('.hotbar-slot')).toHaveCount(9);
    await expect(page.locator('.hotbar-slot[aria-label*="Wooden Pickaxe"]')).toHaveCount(1);
    await expect(page.locator('.hotbar-slot[aria-label*="Wooden Pickaxe"] .slot-durability.visible')).toHaveCount(1);
  });

  test('shows survival status and food in the hotbar', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await expect(page.locator('#survival-status')).toBeVisible();
    await expect(page.locator('#world-time')).toHaveText(/[☀☾] \d{2}:\d{2}/);
    await expect(page.locator('#health-status')).toHaveText('♥ 20');
    await expect(page.locator('#hunger-status')).toHaveText('🍗 20');
    await expect(page.locator('.hotbar-slot')).toHaveCount(9);
    await expect(page.locator('.hotbar-slot').nth(8)).toHaveAttribute('aria-label', /Apple/);

    await page.evaluate(() => {
      const game = (window as unknown as {
        __voxelGame?: {
          survival: { hunger: number; saturation: number };
          inventory: {
            addItem(id: number, amount: number): number;
            setSelectedStack(stack: { id: number; count: number }): void;
          };
          hotbar: { render(): void };
        };
      }).__voxelGame;
      if (!game) throw new Error('test game handle missing');
      game.survival.hunger = 10;
      game.survival.saturation = 0;
      // Eating consumes the selected hotbar item (change 124): put an apple in the
      // selected slot, then press the eat key.
      game.inventory.setSelectedStack({ id: 13, count: 1 });
      game.hotbar.render();
    });
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(150);
    const foodState = await page.evaluate(() => {
      const game = (window as unknown as {
        __voxelGame?: {
          survival: { hunger: number };
          inventory: { getItemCount(id: number): number };
        };
      }).__voxelGame;
      return {
        hunger: game?.survival.hunger ?? 0,
        apples: game?.inventory.getItemCount(13) ?? -1,
      };
    });
    expect(foodState.hunger).toBe(14);
    expect(foodState.apples).toBe(0);
  });

  test('spawns deterministic passive world life near the player', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    const critters = await page.evaluate(() => {
      const game = (window as unknown as {
        __voxelGame?: { renderer: { scene: { children: Array<{ name: string }> } } };
      }).__voxelGame;
      return game?.renderer.scene.children.filter((child) => child.name === 'passive-critter').length ?? 0;
    });
    expect(critters).toBe(8);
  });

  test('spawns a live, simulated pig entity near the player', async ({ page }) => {
    test.setTimeout(90_000);
    await waitForGame(page);
    await enterPointerLock(page);
    // Passive mob baseline (145): the spawn-cycle sweep is throttled to every
    // SPAWN_CYCLE_INTERVAL_TICKS (100) simulated frames, so give it a generous window.
    await page.waitForFunction(
      () => {
        const game = (window as unknown as {
          __voxelGame?: { renderer: { scene: { children: Array<{ name: string }> } } };
        }).__voxelGame;
        return (game?.renderer.scene.children.filter((child) => child.name === 'passive-mob-pig').length ?? 0) > 0;
      },
      { timeout: 60_000 },
    );
  });

  test('FPS counter updates over time', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    // The counter starts at "0 FPS"; wait for the first real frame-rate sample.
    await page.waitForFunction(() => {
      const text = document.getElementById('fps-counter')?.textContent ?? '';
      const m = /(\d+) FPS/.exec(text);
      return m !== null && Number(m[1]) > 0;
    }, { timeout: 15_000 });
    const fpsText = await page.locator('#fps-counter').textContent();
    const m = fpsText?.match(/(\d+) FPS/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
  });

  test('debug overlay toggles with F3', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await expect(page.locator('#debug-overlay')).toBeHidden();
    await page.keyboard.press('F3');
    await expect(page.locator('#debug-overlay')).toBeVisible();
    await page.keyboard.press('F3');
    await expect(page.locator('#debug-overlay')).toBeHidden();
  });

  test('player moves when WASD is held', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    // Read the debug position by enabling the overlay.
    await page.keyboard.press('F3');
    const readPos = async () => {
      const t = await page.locator('#debug-overlay').innerText();
      const m = t.match(/pos: ([-\d.]+) ([-\d.]+)/);
      return m ? { x: Number(m[1]), z: Number(m[2]) } : null;
    };
    const before = await readPos();
    expect(before).not.toBeNull();
    // The spawn may face a wall, so try each WASD direction until the player
    // actually moves (at least one direction is clear).
    let moved = false;
    for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
      await page.keyboard.down(key);
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(250);
        const now = await readPos();
        if (now && (Math.abs(now.x - before!.x) > 0.5 || Math.abs(now.z - before!.z) > 0.5)) {
          moved = true;
          break;
        }
      }
      await page.keyboard.up(key);
      if (moved) break;
    }
    expect(moved).toBe(true);
  });

  test('player can jump and gravity returns them to the ground', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await page.keyboard.press('F3');

    // Read the player's elevation from the debug overlay ('pos: X Y Z').
    const readY = async (): Promise<number | null> => {
      const text = await page.locator('#debug-overlay').innerText();
      const m = text.match(/pos: [-\d.]+ ([-\d.]+)/);
      return m ? Number(m[1]) : null;
    };

    const before = await readY();
    expect(before).not.toBeNull();

    // Hold jump and sample the elevation across the jump arc.
    await page.keyboard.down('Space');
    let maxY = before!;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(100);
      const y = await readY();
      if (y !== null) {
        maxY = Math.max(maxY, y);
      }
    }
    await page.keyboard.up('Space');
    // The jump must have carried the player visibly off the ground.
    expect(maxY).toBeGreaterThan(before! + 0.5);

    // Gravity must bring the player back near their original elevation.
    let landed = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(100);
      const y = await readY();
      if (y !== null && Math.abs(y - before!) < 1.0) {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
    // The game is still alive and running (no crash).
    await expect(page.locator('#error')).toBeHidden();
  });

  test('chunks stream as the player explores', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    // Walk forward long enough to cross at least one chunk boundary and prove
    // streaming actually WORKED: new generation jobs were observed and drained
    // (hardening 2026-08-23 — `after >= before` could not fail even if
    // streaming never loaded another chunk).
    const before = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { world?: { getStats(): { loadedChunks: number } } } }).__voxelGame;
      return g?.world?.getStats().loadedChunks ?? -1;
    });
    expect(before).toBeGreaterThan(0);
    let sawGeneration = false;
    await page.keyboard.down('KeyW');
    try {
      // Sample queue depth while moving; software WebGL still runs fixed ticks,
      // so crossing a ring boundary enqueues generation within ~2s of walking.
      const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        const pendingGen = await page.evaluate(() => {
          const g = (window as unknown as { __voxelGame?: { world?: { getStats(): { pendingGeneration: number } } } }).__voxelGame;
          return g?.world?.getStats().pendingGeneration ?? -1;
        });
        if (pendingGen > 0) {
          sawGeneration = true;
          break;
        }
        await page.waitForTimeout(100);
      }
    } finally {
      await page.keyboard.up('KeyW');
    }
    expect(sawGeneration).toBe(true);
    // Queues must fully drain afterwards: streamed chunks become real chunks.
    await page.waitForFunction((b) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getStats(): { loadedChunks: number; pendingGeneration: number } } } }).__voxelGame;
      const stats = g?.world?.getStats();
      return !!stats && stats.pendingGeneration === 0 && stats.loadedChunks >= b;
    }, before, { timeout: 15000 });
  });

  test('production build loads without fatal errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await waitForGame(page);
    expect(errors).toEqual([]);
  });

  test('player can target and break a block', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    // Aim the camera down-forward at the terrain surface.
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { player: { pitch: number } } }).__voxelGame;
      if (g) g.player.pitch = -1.0;
    });
    // Wait for a target to appear (the interaction raycast hits the surface).
    let target: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(100);
      target = await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: { interaction?: { getTarget(): { blockX: number; blockY: number; blockZ: number } | null } } }).__voxelGame;
        const t = g?.interaction?.getTarget();
        return t ? { x: t.blockX, y: t.blockY, z: t.blockZ } : null;
      });
      if (target) break;
    }
    expect(target).not.toBeNull();
    // The targeted block is solid before breaking.
    const before = await page.evaluate((t) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return g?.world?.getBlock(t.x, t.y, t.z) ?? -1;
    }, target!);
    expect(before).not.toBe(0); // not air
    // Break it by HOLDING the left button until the block turns to air
    // (hardening 2026-08-23: mining completion is owned by break-duration
    // progress, so a click can no longer pop a hard block instantly). Polling
    // keeps the assertion robust to low frame rates (software WebGL in CI
    // renders at only a few FPS); 5s covers stone's barehand 1.5s duration.
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    });
    await page.waitForFunction((t) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return (g?.world?.getBlock(t.x, t.y, t.z) ?? -1) === 0;
    }, target!, { timeout: 8000 });
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    });
    const after = await page.evaluate((t) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return g?.world?.getBlock(t.x, t.y, t.z) ?? -1;
    }, target!);
    expect(after).toBe(0); // now air
  });

  test('breaking a block spawns a world item entity', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { player: { pitch: number } } }).__voxelGame;
      if (g) g.player.pitch = -1.0;
    });
    let target: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(100);
      target = await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: { interaction?: { getTarget(): { blockX: number; blockY: number; blockZ: number } | null } } }).__voxelGame;
        const t = g?.interaction?.getTarget();
        return t ? { x: t.blockX, y: t.blockY, z: t.blockZ } : null;
      });
      if (target) break;
    }
    expect(target).not.toBeNull();
    // Hold-mine (see the break test above for the hardness rationale).
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    });
    await page.waitForFunction((t) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return (g?.world?.getBlock(t.x, t.y, t.z) ?? -1) === 0;
    }, target!, { timeout: 8000 });
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    });
    // The mined block's drops now exist as world item entities (111), not in the
    // inventory directly.
    const entityCount = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { itemEntities?: { size: number } } }).__voxelGame;
      return g?.itemEntities?.size ?? 0;
    });
    expect(entityCount).toBeGreaterThan(0);
  });

  test('breaking a block drops an item the player collects', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { player: { pitch: number } } }).__voxelGame;
      if (g) g.player.pitch = -1.0;
    });
    let target: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(100);
      target = await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: { interaction?: { getTarget(): { blockX: number; blockY: number; blockZ: number } | null } } }).__voxelGame;
        const t = g?.interaction?.getTarget();
        return t ? { x: t.blockX, y: t.blockY, z: t.blockZ } : null;
      });
      if (target) break;
    }
    expect(target).not.toBeNull();
    // The mined block's drop starts in the world (111), then the 112 pickup path
    // collects it into the inventory after the 0.5s pickup delay elapses.
    const totalCount = () => {
      const g = (window as unknown as { __voxelGame?: { inventory?: { slots: { count: number }[]; storage: { count: number }[] } } }).__voxelGame;
      if (!g?.inventory) return 0;
      return [...g.inventory.slots, ...g.inventory.storage].reduce(
        (a: number, s: { count: number }) => a + (s?.count ?? 0),
        0,
      );
    };
    const before = await page.evaluate(totalCount);
    // Hold-mine (see the break test above for the hardness rationale).
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    });
    await page.waitForFunction((t) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return (g?.world?.getBlock(t.x, t.y, t.z) ?? -1) === 0;
    }, target!, { timeout: 8000 });
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    });
    // Poll for the drop to be collected (pickup requires ageTicks >= 10 ~ 0.5s).
    await page.waitForFunction((b) => {
      const g = (window as unknown as { __voxelGame?: { inventory?: { slots: { count: number }[]; storage: { count: number }[] } } }).__voxelGame;
      if (!g?.inventory) return false;
      const now = [...g.inventory.slots, ...g.inventory.storage].reduce(
        (a: number, s: { count: number }) => a + (s?.count ?? 0),
        0,
      );
      return now > b;
    }, before, { timeout: 6000 });
    const after = await page.evaluate(totalCount);
    expect(after).toBeGreaterThan(before);
  });

  test('player can place a block from the hotbar', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    // Select Stone (slot index 2 → Digit3).
    await page.keyboard.press('Digit3');
    // Aim down-forward at a shallow angle so the ray hits a surface block
    // clearly ahead of the player (not the block directly below the feet).
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { player: { pitch: number } } }).__voxelGame;
      if (g) g.player.pitch = -0.5;
    });
    // Scan a small deterministic pose set until the visible face has an empty
    // adjacent placement cell; the production path rejects occupied cells.
    const poses = [
      { yaw: 0, pitch: -0.5 },
      { yaw: 0.35, pitch: -0.5 },
      { yaw: -0.35, pitch: -0.5 },
      { yaw: 0, pitch: -0.3 },
      { yaw: 0, pitch: -0.7 },
      { yaw: 0.7, pitch: -0.3 },
      { yaw: -0.7, pitch: -0.3 },
    ];
    let target: { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null = null;
    for (const pose of poses) {
      await page.evaluate((p) => {
        const g = (window as unknown as { __voxelGame?: { player: { yaw: number; pitch: number } } }).__voxelGame;
        if (g) {
          g.player.yaw = p.yaw;
          g.player.pitch = p.pitch;
        }
      }, pose);
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(100);
        target = await page.evaluate(() => {
          const g = (window as unknown as {
            __voxelGame?: {
              interaction?: {
                getTargetFace(): { blockX: number; blockY: number; blockZ: number; nx: number; ny: number; nz: number } | null;
              };
              world?: { getBlock(x: number, y: number, z: number): number };
            };
          }).__voxelGame;
          const t = g?.interaction?.getTargetFace();
          if (!g || !t || !g.world) return null;
          const cell = {
            x: Math.floor(t.blockX + t.nx),
            y: Math.floor(t.blockY + t.ny),
            z: Math.floor(t.blockZ + t.nz),
          };
          if (g.world.getBlock(cell.x, cell.y, cell.z) !== 0) return null;
          return { x: t.blockX, y: t.blockY, z: t.blockZ, nx: t.nx, ny: t.ny, nz: t.nz };
        });
        if (target) break;
      }
      if (target) break;
    }
    expect(target).not.toBeNull();
    // The placement cell is the face-adjacent cell selected by the ray.
    const px = Math.floor(target!.x + target!.nx);
    const py = Math.floor(target!.y + target!.ny);
    const pz = Math.floor(target!.z + target!.nz);
    const before = await page.evaluate((p) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return g?.world?.getBlock(p.x, p.y, p.z) ?? -1;
    }, { x: px, y: py, z: pz });
    expect(before).toBe(0); // empty before placing
    // Place with a right click. Poll for the placed block rather than a fixed
    // delay so the assertion is robust to low frame rates (software WebGL in CI
    // renders at only a few FPS).
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
    });
    await page.waitForFunction((p) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return (g?.world?.getBlock(p.x, p.y, p.z) ?? -1) === 3;
    }, { x: px, y: py, z: pz }, { timeout: 5000 });
    const after = await page.evaluate((p) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return g?.world?.getBlock(p.x, p.y, p.z) ?? -1;
    }, { x: px, y: py, z: pz });
    expect(after).toBe(3); // Stone (BlockId.Stone)
  });

  test('renders textured terrain (non-background pixels)', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    const { PNG } = await import('pngjs');
    // Under parallel headless load the world can render slowly, so sample
    // repeatedly until terrain pixels appear (or a timeout elapses).
    let grass = 0;
    let stone = 0;
    let sky = 0;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(500);
      const shot = await page.screenshot();
      const png = PNG.sync.read(shot);
      const { width, height, data } = png;
      grass = 0;
      stone = 0;
      sky = 0;
      for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
          const i = (y * width + x) * 4;
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          // Grass green-ish (procedural grass tiles).
          if (r > 60 && r < 150 && g > 120 && g < 200 && b < 120) grass++;
          // Stone gray-ish.
          if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r > 60 && r < 200) stone++;
          // Sky blue (scene background / fog color).
          if (b > 170 && g > 130 && r > 90 && r < 180) sky++;
        }
      }
      if (grass + stone > 30 && sky > 30) {
        break;
      }
    }
    // Confident terrain rendering: some grass/stone pixels and a visible sky.
    expect(grass + stone).toBeGreaterThan(30);
    expect(sky).toBeGreaterThan(30);
  });
});

/**
 * Survival-progression foundation (change 242 browser E2E seam).
 *
 * The headless `ProgressionHarness` is the authoritative driver for the full
 * chain (tools → food → shelter → Nether → End → boss). The running game does
 * NOT wire Nether/End/boss, so the browser seam is limited to the survival
 * foundation stages the game already reaches: fresh-spawn survival state, a
 * crafted tool with durability, food consumption, and a placed-block shelter.
 * These assertions complement the harness, they do not replace it.
 */
test.describe('survival-progression foundation (242 e2e seam)', () => {
  test('fresh spawn shows the full survival baseline (20 hearts / 20 hunger)', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await expect(page.locator('#survival-status')).toBeVisible();
    await expect(page.locator('#health-status')).toHaveText('♥ 20');
    await expect(page.locator('#hunger-status')).toHaveText('🍗 20');
    // The hotbar shows a full 9-slot quick-access bar.
    await expect(page.locator('.hotbar-slot')).toHaveCount(9);
  });

  test('crafting a Wooden Pickaxe places it in the hotbar with a visible durability bar', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await page.keyboard.press('KeyC');
    await expect(page.locator('#crafting')).toBeVisible();
    await page.evaluate(() => {
      const game = (window as unknown as {
        __voxelGame?: {
          inventory: { addItem(id: number, amount: number): number };
          craftingPanel: { render(registry: unknown): void };
          registry: unknown;
        };
      }).__voxelGame;
      if (!game) throw new Error('test game handle missing');
      game.inventory.addItem(7, 1); // log
      game.craftingPanel.render(game.registry);
    });
    await page.locator('.crafting-recipe[data-recipe="planks"]').click();
    await page.evaluate(() => {
      const game = (window as unknown as {
        __voxelGame?: {
          inventory: { addItem(id: number, amount: number): number };
          craftingPanel: { render(registry: unknown): void };
          registry: unknown;
        };
      }).__voxelGame;
      if (!game) throw new Error('test game handle missing');
      game.inventory.addItem(7, 2); // more logs
      game.craftingPanel.render(game.registry);
    });
    await page.locator('.crafting-recipe[data-recipe="planks"]').click();
    await page.locator('.crafting-recipe[data-recipe="sticks"]').click();
    await page.locator('.crafting-recipe[data-recipe="wooden_pickaxe"]').click();
    await expect(page.locator('.hotbar-slot[aria-label*="Wooden Pickaxe"]')).toHaveCount(1);
    await expect(page.locator('.hotbar-slot[aria-label*="Wooden Pickaxe"] .slot-durability.visible')).toHaveCount(1);
    await page.locator('#crafting-close').click();
    await enterPointerLock(page);
  });

  test('eating an apple changes the hunger value', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await page.evaluate(() => {
      const game = (window as unknown as {
        __voxelGame?: {
          survival: { hunger: number; saturation: number };
          inventory: {
            addItem(id: number, amount: number): number;
            setSelectedStack(stack: { id: number; count: number }): void;
          };
          hotbar: { render(): void };
        };
      }).__voxelGame;
      if (!game) throw new Error('test game handle missing');
      game.survival.hunger = 10;
      game.survival.saturation = 0;
      game.inventory.addItem(13, 1); // apple
      game.inventory.setSelectedStack({ id: 13, count: 1 });
      game.hotbar.render();
    });
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(150);
    const hunger = await page.evaluate(() => {
      const game = (window as unknown as { __voxelGame?: { survival: { hunger: number } } }).__voxelGame;
      return game?.survival.hunger ?? 0;
    });
    expect(hunger).toBe(14); // apple foodHunger = 4
  });

  test('placing a block from the hotbar builds a shelter cell', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await page.keyboard.press('Digit3'); // select Stone
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { player: { pitch: number } } }).__voxelGame;
      if (g) g.player.pitch = -0.5;
    });
    const poses = [
      { yaw: 0, pitch: -0.5 },
      { yaw: 0.35, pitch: -0.5 },
      { yaw: -0.35, pitch: -0.5 },
      { yaw: 0, pitch: -0.3 },
      { yaw: 0, pitch: -0.7 },
      { yaw: 0.7, pitch: -0.3 },
      { yaw: -0.7, pitch: -0.3 },
    ];
    let target: { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null = null;
    for (const pose of poses) {
      await page.evaluate((p) => {
        const g = (window as unknown as { __voxelGame?: { player: { yaw: number; pitch: number } } }).__voxelGame;
        if (g) {
          g.player.yaw = p.yaw;
          g.player.pitch = p.pitch;
        }
      }, pose);
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(100);
        target = await page.evaluate(() => {
          const g = (window as unknown as {
            __voxelGame?: {
              interaction?: {
                getTargetFace(): { blockX: number; blockY: number; blockZ: number; nx: number; ny: number; nz: number } | null;
              };
              world?: { getBlock(x: number, y: number, z: number): number };
            };
          }).__voxelGame;
          const t = g?.interaction?.getTargetFace();
          if (!g || !t || !g.world) return null;
          const cell = {
            x: Math.floor(t.blockX + t.nx),
            y: Math.floor(t.blockY + t.ny),
            z: Math.floor(t.blockZ + t.nz),
          };
          if (g.world.getBlock(cell.x, cell.y, cell.z) !== 0) return null;
          return { x: t.blockX, y: t.blockY, z: t.blockZ, nx: t.nx, ny: t.ny, nz: t.nz };
        });
        if (target) break;
      }
      if (target) break;
    }
    expect(target).not.toBeNull();
    const px = Math.floor(target!.x + target!.nx);
    const py = Math.floor(target!.y + target!.ny);
    const pz = Math.floor(target!.z + target!.nz);
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
    });
    await page.waitForFunction((p) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return (g?.world?.getBlock(p.x, p.y, p.z) ?? -1) === 3;
    }, { x: px, y: py, z: pz }, { timeout: 5000 });
    const placed = await page.evaluate((p) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return g?.world?.getBlock(p.x, p.y, p.z) ?? -1;
    }, { x: px, y: py, z: pz });
    expect(placed).toBe(3); // Stone
  });
});

/**
 * Device input matrix (246 e2e seam).
 *
 * Drives the four-device input wiring through the `__voxelGame.resolvedInputView()`
 * observability hook: gamepad lock-free play, touch lock-free play, focus-loss
 * clearing, and paused-frame inactivity.
 */

/** Minimal shape of the 246 resolved-input view used for assertions. */
interface ResolvedInputView {
  active: boolean;
  actions: string[];
  move: { x: number; y: number };
  look: { x: number; y: number };
}

function readResolvedInput(page: Page): Promise<ResolvedInputView | undefined> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __voxelGame?: { resolvedInputView(): ResolvedInputView };
      }
    ).__voxelGame?.resolvedInputView(),
  );
}

test.describe('device input matrix (246 e2e seam)', () => {
  test('simulated gamepad drives movement without pointer lock', async ({ page }) => {
    // Stub the Gamepad API before any page script runs: left stick fully
    // deflected up (= forward), everything else neutral.
    await page.addInitScript(() => {
      const pad = {
        connected: true,
        id: 'test-pad',
        index: 0,
        mapping: 'standard',
        axes: [0, -1, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      };
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => [pad, null, null, null],
      });
    });
    await waitForGame(page);

    // Lock-free play: controller activity dismisses the start overlay and the
    // resolved frame becomes active with the gamepad's movement vector.
    await page.waitForFunction(
      () => {
        const view = (
          window as unknown as {
            __voxelGame?: { resolvedInputView(): ResolvedInputView };
          }
        ).__voxelGame?.resolvedInputView();
        return view?.active === true && view.move.y === -1;
      },
      { timeout: 15_000 },
    );
    await expect(page.locator('#overlay')).toBeHidden();

    // The player actually moves (poll generously: software WebGL is slow).
    const before = await page.evaluate(() => {
      const g = (
        window as unknown as {
          __voxelGame?: { player: { position: { x: number; z: number } } };
        }
      ).__voxelGame;
      return { x: g?.player.position.x ?? 0, z: g?.player.position.z ?? 0 };
    });
    await page.waitForFunction(
      (b) => {
        const g = (
          window as unknown as {
            __voxelGame?: { player: { position: { x: number; z: number } } };
          }
        ).__voxelGame;
        if (!g) return false;
        return Math.abs(g.player.position.x - b.x) > 0.5 || Math.abs(g.player.position.z - b.z) > 0.5;
      },
      before,
      { timeout: 20_000 },
    );
  });

  test('simulated touch drives movement without pointer lock', async ({ page }) => {
    await waitForGame(page);
    const box = await page.locator('#game-canvas').boundingBox();
    expect(box).not.toBeNull();
    const fireTouch = (type: string, fx: number, fy: number) =>
      page.evaluate(
        ([type, fx, fy]) => {
          const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
          const rect = canvas.getBoundingClientRect();
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerType: 'touch',
              pointerId: 7,
              isPrimary: true,
              clientX: rect.left + rect.width * fx,
              clientY: rect.top + rect.height * fy,
              bubbles: true,
            }),
          );
        },
        [type, fx, fy] as [string, number, number],
      );

    // Drag inside the left-half move zone: (0.2, 0.5) → (0.3, 0.5). The 210
    // drag math scales by 4, so the expected move vector is ≈ { x: 0.4, y: 0 }.
    await fireTouch('pointerdown', 0.2, 0.5);
    await fireTouch('pointermove', 0.3, 0.5);

    await page.waitForFunction(
      () => {
        const view = (
          window as unknown as {
            __voxelGame?: { resolvedInputView(): ResolvedInputView };
          }
        ).__voxelGame?.resolvedInputView();
        return view?.active === true && Math.abs(view.move.x - 0.4) < 0.01 && Math.abs(view.move.y) < 0.01;
      },
      { timeout: 15_000 },
    );
    // Touch activity also plays lock-free: the overlay is dismissed.
    await expect(page.locator('#overlay')).toBeHidden();
    await fireTouch('pointerup', 0.3, 0.5);
  });

  test('blur during a held key zeroes the resolved input', async ({ page }) => {
    await waitForGame(page);
    await enterPointerLock(page);
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => {
        const view = (
          window as unknown as {
            __voxelGame?: { resolvedInputView(): ResolvedInputView };
          }
        ).__voxelGame?.resolvedInputView();
        return view?.active === true && view.actions.includes('forward');
      },
      { timeout: 10_000 },
    );

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForFunction(
      () => {
        const view = (
          window as unknown as {
            __voxelGame?: { resolvedInputView(): ResolvedInputView };
          }
        ).__voxelGame?.resolvedInputView();
        return (
          view?.active === false &&
          view.actions.length === 0 &&
          view.move.x === 0 &&
          view.move.y === 0
        );
      },
      { timeout: 10_000 },
    );
    // The pause overlay appears for the keyboard/mouse path, as today.
    await expect(page.locator('#overlay')).toBeVisible();
    await page.keyboard.up('KeyW');
  });

  test('paused start overlay delivers no input', async ({ page }) => {
    await waitForGame(page);
    // Never clicked: the start overlay is up, so the frame must be inactive
    // regardless of what devices report.
    await expect(page.locator('#overlay')).toBeVisible();
    const view = await readResolvedInput(page);
    expect(view).toBeDefined();
    expect(view!.active).toBe(false);
    expect(view!.actions).toEqual([]);
    expect(view!.move).toEqual({ x: 0, y: 0 });
  });
});

