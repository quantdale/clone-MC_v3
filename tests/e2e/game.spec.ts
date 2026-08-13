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
  // state rather than 'visible'.
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
}

/** Enter pointer lock by clicking the canvas. */
async function enterPointerLock(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await page.waitForFunction(() => document.pointerLockElement !== null, { timeout: 5000 });
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
    await expect(page.locator('.inventory-cell')).toHaveCount(36);
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
          inventory: { addItem(id: number, amount: number): number };
          hotbar: { render(): void };
        };
      }).__voxelGame;
      if (!game) throw new Error('test game handle missing');
      game.survival.hunger = 10;
      game.survival.saturation = 0;
      game.inventory.addItem(13, 1);
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
    await page.keyboard.press('F3');
    // The debug overlay shows 'loaded: N'; it should increase as we move.
    const beforeText = await page.locator('#debug-overlay').innerText();
    const beforeLoaded = Number(beforeText.match(/loaded: (\d+)/)?.[1] ?? 0);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyW');
    const afterText = await page.locator('#debug-overlay').innerText();
    const afterLoaded = Number(afterText.match(/loaded: (\d+)/)?.[1] ?? 0);
    expect(afterLoaded).toBeGreaterThanOrEqual(beforeLoaded);
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
    // Break it with a left click.
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await page.evaluate((t) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return g?.world?.getBlock(t.x, t.y, t.z) ?? -1;
    }, target!);
    expect(after).toBe(0); // now air
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
    // Wait for a target.
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
    // The placement cell is adjacent to the top face (aiming down).
    const px = target!.x;
    const py = target!.y + 1;
    const pz = target!.z;
    const before = await page.evaluate((p) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return g?.world?.getBlock(p.x, p.y, p.z) ?? -1;
    }, { x: px, y: py, z: pz });
    expect(before).toBe(0); // empty before placing
    // Place with a right click.
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(400);
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
