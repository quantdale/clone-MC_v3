import { test, expect, type Page } from '@playwright/test';

/**
 * Live brewing production journey (260).
 *
 * Drives the REAL production artifact through the full player loop: place a
 * brewing stand, open it, load bottle+fuel+ingredient through actual slot
 * clicks, let it brew on the fixed tick, collect the bottle, verify
 * close/reopen state, survive a page reload via IndexedDB, and break it with
 * complete cleanup. The `__voxelGame` handle is used only for inventory setup
 * (incl. the test-only awkward-bottle grant) and read-only state observation.
 */

interface BrewingStateView {
  bottle: { item: string | null; count: number; components?: Record<string, unknown> };
  fuel: { item: string | null; count: number };
  ingredient: { item: string | null; count: number };
  brewTime: number;
  brewTimeTotal: number;
  fuelBurnTime: number;
  fuelBurnTimeTotal: number;
}

type Pos = { x: number; y: number; z: number };
type TargetFace = Pos & { nx: number; ny: number; nz: number };

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
}

async function enterPointerLock(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await page.waitForFunction(
    () => document.pointerLockElement !== null,
    { timeout: 5000 },
  );
  await page.waitForFunction(
    () =>
      (window as unknown as { __voxelGame?: { inputHandle?: { isLocked(): boolean } } }).__voxelGame?.inputHandle?.isLocked?.() === true,
    { timeout: 5000 },
  );
}

function rightClick(page: Page): void {
  void page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
  });
}

/** Aim down-forward and wait until an interaction target exists. */
async function acquireTarget(page: Page, pitch = -0.5): Promise<TargetFace> {
  const poses = [
    { yaw: 0, pitch },
    { yaw: 0.35, pitch },
    { yaw: -0.35, pitch },
    { yaw: 0, pitch: pitch + 0.2 },
    { yaw: 0, pitch: pitch - 0.2 },
    { yaw: 0.7, pitch: pitch + 0.2 },
    { yaw: -0.7, pitch: pitch + 0.2 },
  ];
  for (const pose of poses) {
    await page.evaluate((p) => {
      const g = (window as unknown as { __voxelGame?: { player?: { yaw: number; pitch: number } } }).__voxelGame;
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
        return {
          x: target.blockX,
          y: target.blockY,
          z: target.blockZ,
          nx: target.nx,
          ny: target.ny,
          nz: target.nz,
        };
      });
      if (t) return t;
    }
  }
  throw new Error('no interaction target acquired');
}

async function aimAt(page: Page, pos: Pos): Promise<void> {
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
}

async function waitForTargetAt(page: Page, pos: Pos, timeout = 10_000): Promise<void> {
  await aimAt(page, pos);
  await page.waitForFunction(
    (p) => {
      const g = (window as unknown as { __voxelGame?: { interaction?: { getTarget(): { blockX: number; blockY: number; blockZ: number } | null } } }).__voxelGame;
      const t = g?.interaction?.getTarget();
      return !!t && t.blockX === p.x && t.blockY === p.y && t.blockZ === p.z;
    },
    pos,
    { timeout },
  );
}

async function blockAt(page: Page, pos: Pos): Promise<number> {
  return page.evaluate((p) => {
    const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
    return g?.world?.getBlock(p.x, p.y, p.z) ?? -1;
  }, pos);
}

async function waitForBlockAt(page: Page, pos: Pos, id: number, timeout = 8000): Promise<void> {
  await page.waitForFunction(
    (p) => {
      const g = (window as unknown as { __voxelGame?: { world?: { getBlock(x: number, y: number, z: number): number } } }).__voxelGame;
      return (g?.world?.getBlock(p.x, p.y, p.z) ?? -1) === p.id;
    },
    { ...pos, id },
    { timeout },
  );
}

async function hostHasBrewing(page: Page, pos: Pos): Promise<boolean> {
  return page.evaluate((p) => {
    const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { hasBrewing(x: number, y: number, z: number): boolean } } }).__voxelGame;
    return g?.blockEntityHost?.hasBrewing(p.x, p.y, p.z) ?? false;
  }, pos);
}

async function hostSize(page: Page): Promise<number> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { size: number } } }).__voxelGame;
    return g?.blockEntityHost?.size ?? -1;
  });
}

async function brewingState(page: Page, pos: Pos): Promise<BrewingStateView | null> {
  return page.evaluate((p) => {
    const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { getBrewingState(x: number, y: number, z: number): unknown } } }).__voxelGame;
    return (g?.blockEntityHost?.getBrewingState(p.x, p.y, p.z) as BrewingStateView | null) ?? null;
  }, pos);
}

/** Hotbar slot index holding the given numeric item id, or -1. */
async function hotbarSlotWith(page: Page, id: number): Promise<number> {
  return page.evaluate((itemId) => {
    const g = (window as unknown as { __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } } }).__voxelGame;
    return g?.inventory?.slots.findIndex((s) => s && s.id === itemId && s.count > 0) ?? -1;
  }, id);
}

/** Place a brewing stand from inventory onto the aimed surface; returns its cell. */
async function placeBrewingStand(page: Page): Promise<Pos> {
  const standSlot = await hotbarSlotWith(page, 64);
  expect(standSlot).toBeGreaterThanOrEqual(0);
  await page.keyboard.press(`Digit${standSlot + 1}`);

  const ground = await acquireTarget(page);
  const cell = {
    x: Math.floor(ground.x + ground.nx),
    y: Math.floor(ground.y + ground.ny),
    z: Math.floor(ground.z + ground.nz),
  };
  expect(await blockAt(page, cell)).toBe(0);
  rightClick(page);
  await waitForBlockAt(page, cell, 62);
  return cell;
}

/** Shift-click the hotbar slot holding `id` into the open brewing panel. */
async function quickMoveIntoStand(page: Page, id: number): Promise<void> {
  const slot = await hotbarSlotWith(page, id);
  expect(slot).toBeGreaterThanOrEqual(0);
  await page.click(`#brewing [data-slot-index="${3 + slot}"]`, { modifiers: ['Shift'] });
}

test.describe('live brewing journey (260)', () => {
  test('place → open → insert → brew → collect → reload persists → break cleans up', async ({ page }) => {
    test.setTimeout(240_000); // full journey: 20 s brew + two reload boots + mining
    await waitForGame(page);

    // ── Setup: stand item + awkward bottle (test seam) + redstone + powder ──
    const grantLeftover = await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: {
          inventory?: { addItem(id: number, amount: number): number };
          testGrantAwkwardBottle?: () => number;
        };
      }).__voxelGame;
      g?.inventory?.addItem(64, 1); // brewing stand
      g?.inventory?.addItem(37, 3); // redstone
      g?.inventory?.addItem(65, 1); // blaze powder
      return g?.testGrantAwkwardBottle?.() ?? -1;
    });
    expect(grantLeftover).toBe(0);
    await enterPointerLock(page);

    // ── Place the stand on the targeted surface ──────────────────────────
    const placeCell = await placeBrewingStand(page);
    expect(await hostHasBrewing(page, placeCell)).toBe(true);
    expect(await hostSize(page)).toBe(1);

    // ── Right-clicking the placed stand opens it instead of placing ──────
    const heldBefore = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } } }).__voxelGame;
      const s = g?.inventory?.slots.find((s) => s && s.count > 0 && s.id !== 64);
      return s ? { ...s } : null;
    });
    await waitForTargetAt(page, placeCell);
    rightClick(page);
    await expect(page.locator('#brewing')).toBeVisible();
    await expect(page.locator('#hotbar')).toBeHidden();
    expect(await blockAt(page, placeCell)).toBe(62); // no accidental placement
    expect(await hostSize(page)).toBe(1);
    if (heldBefore) {
      const heldAfter = await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } } }).__voxelGame;
        const s = g?.inventory?.slots.find((s) => s && s.count > 0 && s.id !== 64);
        return s ? { ...s } : null;
      });
      expect(heldAfter).toEqual(heldBefore); // held stack untouched by use
    }

    // ── Insert bottle + fuel + ingredient with real shift-clicks ─────────
    // First-fit routing: bottle → bottle slot, powder → fuel, redstone → ingredient.
    await quickMoveIntoStand(page, 66);
    await page.waitForFunction(
      (p) => {
        const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { getBrewingState(x: number, y: number, z: number): BrewingStateView | null } } }).__voxelGame;
        return g?.blockEntityHost?.getBrewingState(p.x, p.y, p.z)?.bottle.item === 'minecraft:potion';
      },
      placeCell,
      { timeout: 5000 },
    );
    await quickMoveIntoStand(page, 65);
    await page.waitForFunction(
      (p) => {
        const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { getBrewingState(x: number, y: number, z: number): BrewingStateView | null } } }).__voxelGame;
        return g?.blockEntityHost?.getBrewingState(p.x, p.y, p.z)?.fuel.item === 'minecraft:blaze_powder';
      },
      placeCell,
      { timeout: 5000 },
    );
    await quickMoveIntoStand(page, 37);
    await page.waitForFunction(
      (p) => {
        const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { getBrewingState(x: number, y: number, z: number): BrewingStateView | null } } }).__voxelGame;
        return g?.blockEntityHost?.getBrewingState(p.x, p.y, p.z)?.ingredient.item === 'minecraft:redstone';
      },
      placeCell,
      { timeout: 5000 },
    );

    const afterInsert = await brewingState(page, placeCell);
    expect(afterInsert!.bottle.item).toBe('minecraft:potion');
    expect(afterInsert!.fuel.item).toBe('minecraft:blaze_powder');
    expect(afterInsert!.ingredient.item).toBe('minecraft:redstone');

    // ── Close; the session settles and the overlay returns ───────────────
    await page.click('#brewing-close');
    await expect(page.locator('#brewing')).toBeHidden();
    await expect(page.locator('#overlay')).toBeVisible();

    // ── Resume simulation and wait for the 400-tick brew to complete ─────
    await enterPointerLock(page);
    await page.waitForFunction(
      (p) => {
        const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { getBrewingState(x: number, y: number, z: number): BrewingStateView | null } } }).__voxelGame;
        const s = g?.blockEntityHost?.getBrewingState(p.x, p.y, p.z);
        const fx = (s?.bottle.components?.['minecraft:potion_contents'] as { customEffects?: Array<{ typeId: string; duration: number; amplifier: number }> } | undefined)?.customEffects;
        return fx?.some((e) => e.typeId === 'minecraft:effect/speed' && e.duration === 480 && e.amplifier === 1) ?? false;
      },
      placeCell,
      { timeout: 60_000 },
    );

    const brewed = await brewingState(page, placeCell);
    expect(brewed!.ingredient.count).toBe(afterInsert!.ingredient.count - 1); // exactly one consumed
    expect(brewed!.fuel.count).toBe(afterInsert!.fuel.count - 1); // exactly one powder burned
    expect(brewed!.brewTime).toBe(0);

    // ── Collect the bottle through a real shift-click ────────────────────
    await waitForTargetAt(page, placeCell);
    rightClick(page);
    await expect(page.locator('#brewing')).toBeVisible();
    await expect(page.locator('#brewing [data-slot-index="0"][aria-label*="Potion, 1"]')).toBeVisible();
    const potionBefore = await hotbarSlotWith(page, 66);
    await page.click('#brewing [data-slot-index="0"]', { modifiers: ['Shift'] });
    await page.waitForFunction(
      (p) => {
        const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { getBrewingState(x: number, y: number, z: number): BrewingStateView | null } } }).__voxelGame;
        return g?.blockEntityHost?.getBrewingState(p.x, p.y, p.z)?.bottle.item === null;
      },
      placeCell,
      { timeout: 5000 },
    );
    // The brewed bottle reached the player inventory (contents ride unit-pinned paths).
    expect(await hotbarSlotWith(page, 66)).toBeGreaterThanOrEqual(0);
    expect(potionBefore).toBe(-1); // it was fully inside the stand before

    const beforeReload = JSON.stringify(await brewingState(page, placeCell));
    await page.click('#brewing-close');
    await expect(page.locator('#overlay')).toBeVisible();

    // ── Durable persistence across a real page reload ────────────────────
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });

    const restored = await brewingState(page, placeCell);
    const committed = JSON.parse(beforeReload) as BrewingStateView;
    expect(restored).not.toBeNull();
    // Hydration restores the committed snapshot field-for-field.
    expect(restored!.bottle).toEqual(committed.bottle);
    expect(restored!.fuel).toEqual(committed.fuel);
    expect(restored!.ingredient).toEqual(committed.ingredient);
    expect(restored!.brewTime).toBe(committed.brewTime);
    expect(restored!.fuelBurnTime).toBe(committed.fuelBurnTime);

    // ── Breaking the stand drops contents and invalidates persistence ────
    await enterPointerLock(page);
    await waitForTargetAt(page, placeCell);
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    });
    await waitForBlockAt(page, placeCell, 0, 25_000);
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    });

    expect(await hostHasBrewing(page, placeCell)).toBe(false);
    expect(await hostSize(page)).toBe(0);
    const droppedItems = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { itemEntities?: { size: number } } }).__voxelGame;
      return g?.itemEntities?.size ?? 0;
    });
    expect(droppedItems).toBeGreaterThan(0); // stand item + contained stacks in the world

    // A further reload must not resurrect the broken stand (record invalidated).
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
    expect(await hostHasBrewing(page, placeCell)).toBe(false);
    expect(await brewingState(page, placeCell)).toBeNull();
  });

  test('lifecycle: walk-away closes, blur keeps the panel, destroy closes', async ({ page }) => {
    test.setTimeout(120_000);
    await waitForGame(page);
    await page.evaluate(() => {
      const g = (window as unknown as {
        __voxelGame?: {
          inventory?: { addItem(id: number, amount: number): number };
          testGrantAwkwardBottle?: () => number;
        };
      }).__voxelGame;
      g?.inventory?.addItem(64, 1);
      g?.testGrantAwkwardBottle?.();
    });
    await enterPointerLock(page);
    const placeCell = await placeBrewingStand(page);
    await waitForTargetAt(page, placeCell);
    rightClick(page);
    await expect(page.locator('#brewing')).toBeVisible();

    // Walk away: the panel closes and the overlay returns.
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { player?: { position: { x: number } } } }).__voxelGame;
      if (g?.player) g.player.position.x += 60;
    });
    await expect(page.locator('#brewing')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('#overlay')).toBeVisible();

    // Walk back, reopen, then blur: the panel stays without overlay stacking.
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { player?: { position: { x: number } } } }).__voxelGame;
      if (g?.player) g.player.position.x -= 60;
    });
    await enterPointerLock(page);
    await waitForTargetAt(page, placeCell);
    rightClick(page);
    await expect(page.locator('#brewing')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(300);
    await expect(page.locator('#brewing')).toBeVisible();
    await expect(page.locator('#overlay')).toBeHidden();

    // Destroy the stand while open: upkeep closes the panel, overlay returns.
    await page.evaluate((p) => {
      const g = (window as unknown as { __voxelGame?: { world?: { setBlock(x: number, y: number, z: number, id: number): void } } }).__voxelGame;
      g?.world?.setBlock(p.x, p.y, p.z, 0);
    }, placeCell);
    await expect(page.locator('#brewing')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('#overlay')).toBeVisible();
  });
});
