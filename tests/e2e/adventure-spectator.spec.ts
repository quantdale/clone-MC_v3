import { test, expect, type Page } from '@playwright/test';
import { ItemId } from '../../src/inventory/ItemRegistry';

/**
 * Live adventure + spectator integration (266) over the VERIFIED headless
 * AdventureModeRules (194) and SpectatorFramework (195), alongside the
 * VERIFIED 265 creative wiring.
 *
 * Drives the REAL production artifact: adventure break/place denied without
 * held declarations then allowed via direct and tag declarations; spectator
 * noclip hover + descend-through-ground with no break/place/use/panel/pickup;
 * survival contrast unaffected; reload persisting both modes. The
 * `__voxelGame` handle is used only for mode seams, inventory setup, and
 * read-only observation — every place/break goes through real mouse input and
 * every mode switch through the text seam or the real HUD select.
 */

type CatalogRow = {
  id: number;
  key: string;
  name: string;
  blockId: number | null;
  stackSize: number;
};

type GameHandle = {
  getGameMode(): string;
  setGameMode(mode: string): boolean;
  setGameModeFromText(text: string): boolean;
  isCreativeOpen(): boolean;
  getCreativeItems(): CatalogRow[];
  getPlayerPosition(): [number, number, number];
  setHeldAdventurePermissions(canDestroy: string[], canPlaceOn: string[]): boolean;
  inventory?: {
    addItem(id: number, amount: number): number;
    removeItem(id: number, amount: number): boolean;
    getItemCount(id: number): number;
    slots: Array<{ id: number; count: number } | null>;
    storage: Array<{ id: number; count: number } | null>;
  };
  itemEntities?: {
    size: number;
    spawnLootStacks(
      stacks: Array<{ item: number; count: number }>,
      x: number,
      y: number,
      z: number,
    ): unknown;
  };
};

type Pos = { x: number; y: number; z: number };
type TargetFace = Pos & { nx: number; ny: number; nz: number };

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
}

async function gameMode(page: Page): Promise<string> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame handle');
    return g.getGameMode();
  });
}

async function itemCount(page: Page, id: number): Promise<number> {
  return page.evaluate((item) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    return g?.inventory?.getItemCount(item) ?? -1;
  }, id);
}

async function drainInventory(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    const inv = g?.inventory;
    if (!inv) return;
    for (const stack of [...inv.slots, ...inv.storage]) {
      if (stack && stack.count > 0) inv.removeItem(stack.id, stack.count);
    }
  });
}

async function enterPointerLock(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await page.waitForFunction(() => document.pointerLockElement !== null, { timeout: 5000 });
  await page.waitForFunction(
    () =>
      (window as unknown as { __voxelGame?: { inputHandle?: { isLocked(): boolean } } })
        .__voxelGame?.inputHandle?.isLocked?.() === true,
    { timeout: 5000 },
  );
}

function rightClick(page: Page): void {
  void page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
  });
}

function holdBreak(page: Page): void {
  void page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  });
}

function releaseBreak(page: Page): void {
  void page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
  });
}

/** Sweep the view until the interaction raycast hits any block (world-ready gate). */
async function waitForWorldTarget(page: Page, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  let yaw = 0;
  for (;;) {
    const hit = await page.evaluate((y) => {
      const g = (window as unknown as {
        __voxelGame?: {
          player?: { yaw: number; pitch: number };
          interaction?: { getTargetFace(): unknown | null };
        };
      }).__voxelGame;
      if (g?.player) {
        g.player.yaw = y;
        g.player.pitch = -0.5;
      }
      return g?.interaction?.getTargetFace() != null;
    }, yaw);
    if (hit) return;
    if (Date.now() - start > timeoutMs) throw new Error('world never yielded an interaction target');
    yaw += 0.4;
    await page.waitForTimeout(500);
  }
}

async function acquireTarget(page: Page, pitch = -0.5): Promise<TargetFace> {
  const yaws = [0, 0.35, -0.35, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, Math.PI];
  const pitches = [pitch, pitch + 0.2, -0.1];
  const poses = yaws.flatMap((yaw) => pitches.map((p) => ({ yaw, pitch: p })));
  // (Broad sweep: spawns can sit in water, so cover the full compass until a
  // target with an air-adjacent placement cell appears.)
  for (const pose of poses) {
    await page.evaluate((p) => {
      const g = (window as unknown as { __voxelGame?: { player?: { yaw: number; pitch: number } } })
        .__voxelGame;
      if (g?.player) {
        g.player.yaw = p.yaw;
        g.player.pitch = p.pitch;
      }
    }, pose);
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(100);
      const t = await page.evaluate(() => {
        const g = (window as unknown as {
          __voxelGame?: {
            interaction?: {
              getTargetFace(): {
                blockX: number;
                blockY: number;
                blockZ: number;
                nx: number;
                ny: number;
                nz: number;
              } | null;
            };
            world?: { getBlock(x: number, y: number, z: number): number };
          };
        }).__voxelGame;
        const target = g?.interaction?.getTargetFace();
        if (!g || !target || !g.world) return null;
        const cell = {
          x: Math.floor(target.blockX + target.nx),
          y: Math.floor(target.blockY + target.ny),
          z: Math.floor(target.blockZ + target.nz),
        };
        if (g.world.getBlock(cell.x, cell.y, cell.z) !== 0) return null;
        return { x: target.blockX, y: target.blockY, z: target.blockZ, nx: target.nx, ny: target.ny, nz: target.nz };
      });
      if (t) return t;
    }
  }
  throw new Error('no interaction target acquired');
}

async function waitForBlockAt(page: Page, pos: Pos, id: number, timeout = 8000): Promise<void> {
  await page.waitForFunction(
    (p) => {
      const g = (window as unknown as {
        __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } };
      }).__voxelGame;
      return (g?.world?.getBlock(p.x, p.y, p.z) ?? -1) === p.id;
    },
    { ...pos, id },
    { timeout },
  );
}

async function blockAt(page: Page, pos: Pos): Promise<number> {
  return page.evaluate((p) => {
    const g = (window as unknown as {
      __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } };
    }).__voxelGame;
    return g?.world?.getBlock(p.x, p.y, p.z) ?? -1;
  }, pos);
}

async function waitForTargetAt(page: Page, pos: Pos, timeout = 10_000): Promise<void> {
  await page.evaluate((p) => {
    const g = (window as unknown as {
      __voxelGame?: {
        player?: {
          position: { x: number; y: number; z: number };
          eyePosition: { x: number; y: number; z: number };
          yaw: number;
          pitch: number;
        };
      };
    }).__voxelGame;
    const player = g?.player;
    if (!player) return;
    const dx = p.x + 0.5 - player.eyePosition.x;
    const dy = p.y + 0.5 - player.eyePosition.y;
    const dz = p.z + 0.5 - player.eyePosition.z;
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, pos);
  await page.waitForFunction(
    (p) => {
      const g = (window as unknown as {
        __voxelGame?: {
          interaction?: { getTarget(): { blockX: number; blockY: number; blockZ: number } | null };
        };
      }).__voxelGame;
      const t = g?.interaction?.getTarget();
      return !!t && t.blockX === p.x && t.blockY === p.y && t.blockZ === p.z;
    },
    pos,
    { timeout },
  );
}

/** Catalog dirt row (key form is the short registry key) + apple item id.
 * Apple is food, not placeable, so it is absent from the creative catalog;
 * its numeric id comes from the item registry directly (e2e src-import
 * precedent: void-world-recovery.spec.ts). */
async function dirtAndApple(page: Page): Promise<{ dirt: CatalogRow; appleId: number }> {
  const rows = await page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    return g?.getCreativeItems() ?? [];
  });
  const dirt = rows.find((r) => r.key === 'dirt');
  if (!dirt || dirt.blockId === null) throw new Error('catalog missing dirt');
  return { dirt, appleId: ItemId.Apple };
}

async function selectSlotWith(page: Page, id: number): Promise<void> {
  const slot = await page.evaluate((item) => {
    const g = (window as unknown as {
      __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } };
    }).__voxelGame;
    return g?.inventory?.slots.findIndex((s) => s && s.id === item && s.count > 0) ?? -1;
  }, id);
  expect(slot).toBeGreaterThanOrEqual(0);
  await page.keyboard.press(`Digit${slot + 1}`);
}

test.describe('live adventure allow-list (266)', () => {
  test('blocked without declarations → allowed via direct ids → allowed via tag', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);
    await drainInventory(page);
    expect(await gameMode(page)).toBe('survival');
    const { dirt } = await dirtAndApple(page);

    // ── Stage dirt in survival, then enter adventure through the HUD select ──
    await page.evaluate((id) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.inventory?.addItem(id, 10);
    }, dirt.id);
    await enterPointerLock(page);
    await selectSlotWith(page, dirt.id);
    await waitForWorldTarget(page);
    const ground = await acquireTarget(page);
    const cell = {
      x: Math.floor(ground.x + ground.nx),
      y: Math.floor(ground.y + ground.ny),
      z: Math.floor(ground.z + ground.nz),
    };
    rightClick(page);
    await waitForBlockAt(page, cell, dirt.blockId!);
    expect(await itemCount(page, dirt.id)).toBe(9);

    await page.selectOption('#gamemode-select', 'adventure');
    expect(await gameMode(page)).toBe('adventure');
    await expect(page.locator('#gamemode-toggle')).toContainText('Mode: Adventure');

    // ── No declarations: place AND break are denied, counts untouched ──
    await waitForTargetAt(page, cell);
    const other = await acquireTarget(page);
    const otherCell = {
      x: Math.floor(other.x + other.nx),
      y: Math.floor(other.y + other.ny),
      z: Math.floor(other.z + other.nz),
    };
    rightClick(page);
    await page.waitForTimeout(2000);
    expect(await blockAt(page, otherCell)).toBe(0);
    expect(await itemCount(page, dirt.id)).toBe(9);
    holdBreak(page);
    await page.waitForTimeout(4000);
    releaseBreak(page);
    expect(await blockAt(page, cell)).toBe(dirt.blockId);
    expect(await itemCount(page, dirt.id)).toBe(9);

    // ── Direct declarations: place consumes exactly 1, break completes ──
    const attached = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.setHeldAdventurePermissions(['minecraft:dirt'], ['minecraft:dirt']);
    });
    expect(attached).toBe(true);
    rightClick(page);
    await waitForBlockAt(page, otherCell, dirt.blockId!);
    expect(await itemCount(page, dirt.id)).toBe(8);
    await waitForTargetAt(page, otherCell);
    holdBreak(page);
    await waitForBlockAt(page, otherCell, 0, 30_000);
    releaseBreak(page);

    // ── Tag declarations: place + break through #mineable/shovel ──
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.setHeldAdventurePermissions(['#minecraft:mineable/shovel'], ['minecraft:dirt']);
    });
    const tag = await acquireTarget(page);
    const tagCell = {
      x: Math.floor(tag.x + tag.nx),
      y: Math.floor(tag.y + tag.ny),
      z: Math.floor(tag.z + tag.nz),
    };
    rightClick(page);
    await waitForBlockAt(page, tagCell, dirt.blockId!);
    expect(await itemCount(page, dirt.id)).toBe(7);
    await waitForTargetAt(page, tagCell);
    holdBreak(page);
    await waitForBlockAt(page, tagCell, 0, 30_000);
    releaseBreak(page);

    // ── Survival contrast: the declared stack still places and breaks ──
    await page.selectOption('#gamemode-select', 'survival');
    expect(await gameMode(page)).toBe('survival');
    const back = await acquireTarget(page);
    const backCell = {
      x: Math.floor(back.x + back.nx),
      y: Math.floor(back.y + back.ny),
      z: Math.floor(back.z + back.nz),
    };
    rightClick(page);
    await waitForBlockAt(page, backCell, dirt.blockId!);
    expect(await itemCount(page, dirt.id)).toBe(6);
    await waitForTargetAt(page, backCell);
    holdBreak(page);
    await waitForBlockAt(page, backCell, 0, 30_000);
    releaseBreak(page);
  });
});

test.describe('live spectator non-interaction (266)', () => {
  test('hover + noclip descend, no break/place/panels/pickup, survival contrast', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);
    await drainInventory(page);
    expect(await gameMode(page)).toBe('survival');
    const { dirt, appleId } = await dirtAndApple(page);

    await page.evaluate(
      ({ dirtId, appleId }) => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        g?.inventory?.addItem(dirtId, 5);
        g?.inventory?.addItem(appleId, 3);
      },
      { dirtId: dirt.id, appleId },
    );
    await enterPointerLock(page);
    const groundPos = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.getPlayerPosition() ?? [0, 0, 0];
    });
    const groundY = groundPos[1];

    // ── Enter spectator through the HUD select ──
    await page.selectOption('#gamemode-select', 'spectator');
    expect(await gameMode(page)).toBe('spectator');
    await expect(page.locator('#gamemode-toggle')).toContainText('Mode: Spectator');

    // ── Hover holds altitude: no gravity ──
    await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { player?: { position: { y: number }; velocity: { y: number } } };
      }).__voxelGame;
      if (g?.player) {
        g.player.position.y += 8;
        g.player.velocity.y = 0;
      }
    });
    await page.waitForTimeout(1500);
    const hovered = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.getPlayerPosition() ?? [0, 0, 0];
    });
    expect(Math.abs(hovered[1]! - groundY! - 8)).toBeLessThan(0.75);

    // ── Sneak-descend phases through the ground: noclip, no collision ──
    await page.keyboard.down('Shift');
    await page.waitForTimeout(3000);
    await page.keyboard.up('Shift');
    const phased = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.getPlayerPosition() ?? [0, 0, 0];
    });
    expect(phased[1]!).toBeLessThan(groundY! - 2);
    // Restore above ground for the interaction steps.
    await page.evaluate((y) => {
      const g = (window as unknown as {
        __voxelGame?: {
          player?: { position: { y: number }; velocity: { x: number; y: number; z: number } };
        };
      }).__voxelGame;
      if (g?.player) {
        g.player.position.y = y + 0.5;
        g.player.velocity.x = 0;
        g.player.velocity.y = 0;
        g.player.velocity.z = 0;
      }
    }, groundY!);
    await page.waitForTimeout(500);

    // ── Break and place are refused: world and counts unchanged ──
    await selectSlotWith(page, dirt.id);
    await waitForWorldTarget(page);
    const ground = await acquireTarget(page);
    const cell = {
      x: Math.floor(ground.x + ground.nx),
      y: Math.floor(ground.y + ground.ny),
      z: Math.floor(ground.z + ground.nz),
    };
    rightClick(page);
    await page.waitForTimeout(2000);
    expect(await blockAt(page, cell)).toBe(0);
    expect(await itemCount(page, dirt.id)).toBe(5);
    // Break-refusal on the live target (no re-aim: the camera is untouched).
    const breakTarget = await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: {
          interaction?: { getTarget(): { blockX: number; blockY: number; blockZ: number } | null };
        };
      }).__voxelGame;
      return g?.interaction?.getTarget() ?? null;
    });
    expect(breakTarget).not.toBeNull();
    const breakPos = { x: breakTarget!.blockX, y: breakTarget!.blockY, z: breakTarget!.blockZ };
    const targetBefore = await blockAt(page, breakPos);
    expect(targetBefore).not.toBe(0);
    holdBreak(page);
    await page.waitForTimeout(4000);
    releaseBreak(page);
    expect(await blockAt(page, breakPos)).toBe(targetBefore);
    expect(await itemCount(page, dirt.id)).toBe(5);

    // ── Container screens refuse to open ──
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: { isCreativeOpen(): boolean } })
          .__voxelGame;
        return g?.isCreativeOpen();
      }),
    ).toBe(false);
    await page.keyboard.press('KeyC');
    await page.waitForTimeout(300);
    await expect(page.locator('#crafting.hidden')).toBeAttached();

    // ── Survival contrast FIRST (stray drops spawned below must not pollute
    // it): placing works again with the same stack ──
    await page.selectOption('#gamemode-select', 'survival');
    expect(await gameMode(page)).toBe('survival');
    await selectSlotWith(page, dirt.id);
    const back = await acquireTarget(page);
    const backCell = {
      x: Math.floor(back.x + back.nx),
      y: Math.floor(back.y + back.ny),
      z: Math.floor(back.z + back.nz),
    };
    rightClick(page);
    await waitForBlockAt(page, backCell, dirt.blockId!);
    expect(await itemCount(page, dirt.id)).toBe(4);
    await page.selectOption('#gamemode-select', 'spectator');
    expect(await gameMode(page)).toBe('spectator');

    // ── Drops at the feet are not picked up ──
    const dropsBefore = await itemCount(page, dirt.id);
    await page.evaluate((id) => {
      const g = (window as unknown as {
        __voxelGame?: {
          getPlayerPosition(): [number, number, number];
          itemEntities?: {
            spawnLootStacks(
              stacks: Array<{ item: number; count: number }>,
              x: number,
              y: number,
              z: number,
            ): unknown;
          };
        };
      }).__voxelGame;
      const pos = g?.getPlayerPosition() ?? [0, 0, 0];
      g?.itemEntities?.spawnLootStacks([{ item: id, count: 2 }], pos[0], pos[1] + 0.5, pos[2]);
    }, dirt.id);
    await page.waitForTimeout(4000);
    expect(await itemCount(page, dirt.id)).toBe(dropsBefore);

    // ── Eating is refused: hunger and counts unchanged ──
    await selectSlotWith(page, appleId);
    await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { survival?: { hunger: number } };
      }).__voxelGame;
      if (g?.survival) g.survival.hunger = 10;
    });
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(1000);
    expect(await itemCount(page, appleId)).toBe(3);
    const hungerAfter = await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { survival?: { hunger: number } };
      }).__voxelGame;
      return g?.survival?.hunger ?? -1;
    });
    expect(hungerAfter).toBe(10);
  });
});

test.describe('mode persistence across reload (266)', () => {
  test('adventure then spectator survive pagehide + reload with rules live', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);
    expect(await gameMode(page)).toBe('survival');

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      g?.setGameModeFromText('adventure');
    });
    expect(await gameMode(page)).toBe('adventure');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForGame(page);
    expect(await gameMode(page)).toBe('adventure');
    await expect(page.locator('#gamemode-toggle')).toContainText('Mode: Adventure');
    await expect(page.locator('#gamemode-select')).toHaveValue('adventure');

    await enterPointerLock(page);
    await page.selectOption('#gamemode-select', 'spectator');
    expect(await gameMode(page)).toBe('spectator');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForGame(page);
    expect(await gameMode(page)).toBe('spectator');
    await expect(page.locator('#gamemode-toggle')).toContainText('Mode: Spectator');
    await expect(page.locator('#gamemode-select')).toHaveValue('spectator');

    // Rules are live after reload: spectator hover holds altitude.
    await enterPointerLock(page);
    const base = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.getPlayerPosition() ?? [0, 0, 0];
    });
    await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: { player?: { position: { y: number }; velocity: { y: number } } };
      }).__voxelGame;
      if (g?.player) {
        g.player.position.y += 6;
        g.player.velocity.y = 0;
      }
    });
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.getPlayerPosition() ?? [0, 0, 0];
    });
    expect(Math.abs(after[1]! - base[1]! - 6)).toBeLessThan(0.75);
  });
});
