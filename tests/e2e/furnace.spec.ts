import { test, expect, type Page } from '@playwright/test';

/**
 * Live furnace production journey (251).
 *
 * Drives the REAL production artifact through the full player loop: place a
 * furnace, open it, load input+fuel through actual slot clicks, let it smelt,
 * collect the output, verify close/reopen state, survive a page reload via
 * IndexedDB, and break it with complete cleanup. The `__voxelGame` handle is
 * used only for inventory setup and read-only state observation.
 */

interface FurnaceStateView {
  input: { item: string | null; count: number };
  fuel: { item: string | null; count: number };
  output: { item: string | null; count: number };
  burnTime: number;
  burnTimeTotal: number;
  smeltTime: number;
  smeltTimeTotal: number;
  xp: number;
}

type Pos = { x: number; y: number; z: number };

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
async function acquireTarget(page: Page, pitch = -0.5): Promise<Pos> {
  await page.evaluate((p) => {
    const g = (window as unknown as { __voxelGame?: { player?: { pitch: number } } }).__voxelGame;
    if (g?.player) g.player.pitch = p;
  }, pitch);
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100);
    const t = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { interaction?: { getTarget(): { blockX: number; blockY: number; blockZ: number } | null } } }).__voxelGame;
      const target = g?.interaction?.getTarget();
      return target ? { x: target.blockX, y: target.blockY, z: target.blockZ } : null;
    });
    if (t) return t;
  }
  throw new Error('no interaction target acquired');
}

async function waitForTargetAt(page: Page, pos: Pos, timeout = 10_000): Promise<void> {
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

async function hostHas(page: Page, pos: Pos): Promise<boolean> {
  return page.evaluate((p) => {
    const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { has(x: number, y: number, z: number): boolean } } }).__voxelGame;
    return g?.blockEntityHost?.has(p.x, p.y, p.z) ?? false;
  }, pos);
}

async function hostSize(page: Page): Promise<number> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { size: number } } }).__voxelGame;
    return g?.blockEntityHost?.size ?? -1;
  });
}

async function furnaceState(page: Page, pos: Pos): Promise<FurnaceStateView | null> {
  return page.evaluate((p) => {
    const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { getFurnaceState(x: number, y: number, z: number): FurnaceStateView | null } } }).__voxelGame;
    return g?.blockEntityHost?.getFurnaceState(p.x, p.y, p.z) ?? null;
  }, pos);
}

/** Place a furnace from inventory onto the aimed surface; returns its cell. */
async function placeFurnace(page: Page): Promise<Pos> {
  // Select the hotbar slot holding the furnace item before placing.
  const furnaceSlot = await page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } } }).__voxelGame;
    return g?.inventory?.slots.findIndex((s) => s && s.id === 26 && s.count > 0) ?? -1;
  });
  expect(furnaceSlot).toBeGreaterThanOrEqual(0);
  await page.keyboard.press(`Digit${furnaceSlot + 1}`);

  const ground = await acquireTarget(page);
  const cell = { x: ground.x, y: ground.y + 1, z: ground.z };
  expect(await blockAt(page, cell)).toBe(0);
  rightClick(page);
  await waitForBlockAt(page, cell, 20);
  return cell;
}

test.describe('live furnace journey (251)', () => {
  test('place → open → insert → smelt → collect → reload persists → break cleans up', async ({ page }) => {
    test.setTimeout(180_000); // full journey: 10 s cook + two reload boots + mining
    await waitForGame(page);

    // ── Setup: give the player a furnace block, sand, and coal ──────────────
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { inventory?: { addItem(id: number, amount: number): number } } }).__voxelGame;
      g?.inventory?.addItem(26, 1); // furnace
      g?.inventory?.addItem(4, 12); // sand
      g?.inventory?.addItem(23, 3); // coal
    });
    await enterPointerLock(page);

    // ── Place the furnace on the targeted surface ───────────────────────────
    const placeCell = await placeFurnace(page);
    expect(await hostHas(page, placeCell)).toBe(true);
    expect(await hostSize(page)).toBe(1);

    // ── Right-clicking the placed furnace opens it instead of placing ───────
    const heldBefore = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } } }).__voxelGame;
      const s = g?.inventory?.slots.find((s) => s && s.count > 0 && s.id !== 26);
      return s ? { ...s } : null;
    });
    await waitForTargetAt(page, placeCell);
    rightClick(page);
    await expect(page.locator('#furnace')).toBeVisible();
    await expect(page.locator('#hotbar')).toBeHidden();
    expect(await blockAt(page, placeCell)).toBe(20); // no accidental placement replaced anything
    expect(await hostSize(page)).toBe(1);
    if (heldBefore) {
      const heldAfter = await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } } }).__voxelGame;
        const s = g?.inventory?.slots.find((s) => s && s.count > 0 && s.id !== 26);
        return s ? { ...s } : null;
      });
      expect(heldAfter).toEqual(heldBefore); // held stack untouched by the use action
    }

    // ── Insert input + fuel with real slot clicks ────────────────────────────
    const sandSlot = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } } }).__voxelGame;
      return g?.inventory?.slots.findIndex((s) => s && s.id === 4 && s.count > 0) ?? -1;
    });
    expect(sandSlot).toBeGreaterThanOrEqual(0);
    await page.click(`#furnace [data-slot-index="${3 + sandSlot}"]`, { modifiers: ['Shift'] }); // quick-move sand → input
    await page.waitForFunction(
      (p) => {
        const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { getFurnaceState(x: number, y: number, z: number): FurnaceStateView | null } } }).__voxelGame;
        return g?.blockEntityHost?.getFurnaceState(p.x, p.y, p.z)?.input.item === 'minecraft:sand';
      },
      placeCell,
      { timeout: 5000 },
    );

    const coalSlot = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { inventory?: { slots: Array<{ id: number; count: number } | null> } } }).__voxelGame;
      return g?.inventory?.slots.findIndex((s) => s && s.id === 23 && s.count > 0) ?? -1;
    });
    expect(coalSlot).toBeGreaterThanOrEqual(0);
    await page.click(`#furnace [data-slot-index="${3 + coalSlot}"]`, { modifiers: ['Shift'] }); // quick-move coal → fuel slot
    await page.waitForFunction(
      (p) => {
        const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { getFurnaceState(x: number, y: number, z: number): FurnaceStateView | null } } }).__voxelGame;
        return g?.blockEntityHost?.getFurnaceState(p.x, p.y, p.z)?.fuel.item === 'minecraft:coal';
      },
      placeCell,
      { timeout: 5000 },
    );

    const afterInsert = await furnaceState(page, placeCell);
    expect(afterInsert!.input.item).toBe('minecraft:sand');
    expect(afterInsert!.fuel.item).toBe('minecraft:coal');

    // ── Close; the session settles and the overlay returns ──────────────────
    await page.click('#furnace-close');
    await expect(page.locator('#furnace')).toBeHidden();
    await expect(page.locator('#overlay')).toBeVisible();

    // ── Resume simulation and wait for ≥1 completed smelt (200 ticks @20 TPS)
    await enterPointerLock(page);
    await page.waitForFunction(
      (p) => {
        const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { getFurnaceState(x: number, y: number, z: number): FurnaceStateView | null } } }).__voxelGame;
        return (g?.blockEntityHost?.getFurnaceState(p.x, p.y, p.z)?.output.count ?? 0) >= 1;
      },
      placeCell,
      { timeout: 25_000 },
    );

    const cooked = await furnaceState(page, placeCell);
    expect(cooked!.input.count).toBe(afterInsert!.input.count - 1); // exactly one smelted
    expect(cooked!.fuel.count).toBe(afterInsert!.fuel.count - 1); // exactly one coal burned
    expect(cooked!.output.item).toBe('minecraft:glass');
    expect(cooked!.output.count).toBeGreaterThanOrEqual(1);

    // ── Collect the output through the take-only output slot ────────────────
    await waitForTargetAt(page, placeCell);
    rightClick(page);
    await expect(page.locator('#furnace')).toBeVisible();
    await expect(page.locator('#furnace [data-slot-index="2"][aria-label*="Glass, 1"]')).toBeVisible();
    await page.click('#furnace [data-slot-index="2"]', { modifiers: ['Shift'] });
    await page.waitForFunction(
      (p) => {
        const g = (window as unknown as { __voxelGame?: { blockEntityHost?: { getFurnaceState(x: number, y: number, z: number): FurnaceStateView | null } } }).__voxelGame;
        return g?.blockEntityHost?.getFurnaceState(p.x, p.y, p.z)?.output.item === null;
      },
      placeCell,
      { timeout: 5000 },
    );

    const beforeReload = JSON.stringify(await furnaceState(page, placeCell));
    await page.click('#furnace-close');
    await expect(page.locator('#overlay')).toBeVisible();

    // ── Durable persistence across a real page reload ────────────────────────
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });

    const restored = await furnaceState(page, placeCell);
    const committed = JSON.parse(beforeReload) as FurnaceStateView;
    expect(restored).not.toBeNull();
    // Hydration restores the committed snapshot field-for-field.
    expect(restored!.input).toEqual(committed.input);
    expect(restored!.fuel).toEqual(committed.fuel);
    expect(restored!.output).toEqual(committed.output);
    expect(restored!.burnTime).toBe(committed.burnTime);
    expect(restored!.smeltTime).toBe(committed.smeltTime);

    // ── Breaking the furnace drops contents and invalidates persistence ──────
    await enterPointerLock(page);
    await waitForTargetAt(page, placeCell);
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    });
    await waitForBlockAt(page, placeCell, 0, 25_000);
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    });

    expect(await hostHas(page, placeCell)).toBe(false);
    expect(await hostSize(page)).toBe(0);
    const droppedItems = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { itemEntities?: { size: number } } }).__voxelGame;
      return g?.itemEntities?.size ?? 0;
    });
    expect(droppedItems).toBeGreaterThan(0); // furnace item + contained stacks in the world

    // A further reload must not resurrect the broken furnace (record invalidated).
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
    expect(await hostHas(page, placeCell)).toBe(false);
    expect(await hostSize(page)).toBe(0);
  });

  test('focus loss keeps the panel settled; re-locking closes the session', async ({ page }) => {
    await waitForGame(page);
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { inventory?: { addItem(id: number, amount: number): number } } }).__voxelGame;
      g?.inventory?.addItem(26, 1);
    });
    await enterPointerLock(page);

    const placeCell = await placeFurnace(page);
    await waitForTargetAt(page, placeCell);
    rightClick(page);
    await expect(page.locator('#furnace')).toBeVisible();

    // Focus loss while a container is open does NOT stack the pause overlay
    // above the panel (the panel itself represents the paused state).
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('#furnace')).toBeVisible();
    await expect(page.locator('#overlay')).toBeHidden();

    // C toggles closed instead of stacking a second container over the furnace.
    await page.keyboard.press('KeyC');
    await expect(page.locator('#furnace')).toBeHidden();
    await expect(page.locator('#overlay')).toBeVisible();

    // Resuming via the overlay leaves exactly the placed furnace behind.
    await enterPointerLock(page);
    await expect(page.locator('#furnace')).toBeHidden();
    await expect(page.locator('#overlay')).toBeHidden();
    expect(await hostSize(page)).toBe(1);
  });
});
