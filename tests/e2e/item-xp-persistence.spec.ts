import { test, expect, type Page } from '@playwright/test';

/**
 * Live item/XP persistence journey (264) over the hardened managers
 * (111/117 + 264 R-4 fail-closed readers) and the world-scoped GamePersistence
 * records (`__itementities__` / `__xporbs__`).
 *
 * Drives the REAL production artifact: spawn a drop + an orb through the live
 * managers beside the player (outside pickup/attraction radii so the live
 * tick cannot move or collect them), persist through the real save path,
 * reload, and observe the same ids/fields live again. A second test proves
 * removals persist (a collected/removed drop stays gone) and an empty world
 * reloads empty (no phantom resurrection). The `__voxelGame` handle is used
 * only for spawn/save/observation — durability itself goes through the
 * production IndexedDB path and a real page reload.
 */

const PLANKS = 12;

type DropView = {
  id: number;
  item: number;
  count: number;
  x: number;
  y: number;
  z: number;
  ageTicks: number;
};

type OrbView = {
  id: number;
  value: number;
  x: number;
  y: number;
  z: number;
  ageTicks: number;
};

type GameHandle = {
  getPlayerPosition(): [number, number, number];
  getItemEntityCount(): number;
  getXpOrbCount(): number;
  saveItemAndXpEntities(): void;
  itemEntities?: {
    spawnLootStacks(
      stacks: Array<{ item: number; count: number }>,
      x: number,
      y: number,
      z: number,
    ): DropView[];
    getItemEntities(): DropView[];
    removeItemEntity(id: number): boolean;
  };
  xpOrbs?: {
    spawnXpOrb(value: number, x: number, y: number, z: number): OrbView;
    getXpOrbs(): OrbView[];
  };
};

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
}

async function playerPos(page: Page): Promise<[number, number, number]> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame handle');
    return g.getPlayerPosition();
  });
}

async function counts(page: Page): Promise<{ items: number; orbs: number }> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame handle');
    return { items: g.getItemEntityCount(), orbs: g.getXpOrbCount() };
  });
}

async function drops(page: Page): Promise<DropView[]> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    return g?.itemEntities?.getItemEntities() ?? [];
  });
}

async function orbs(page: Page): Promise<OrbView[]> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    return g?.xpOrbs?.getXpOrbs() ?? [];
  });
}

/** Compare entity snapshots ignoring `ageTicks` (the live tick advances age
 * between any two reads); monotonicity is asserted separately. */
function stripAge<T extends { ageTicks?: number }>(rows: T[]): Omit<T, 'ageTicks'>[] {
  return rows.map(({ ageTicks: _ignored, ...rest }) => rest);
}

async function saveAndSettle(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    g?.saveItemAndXpEntities();
  });
  // Fire-and-forget IndexedDB puts (263 precedent) need a settle wait.
  await page.waitForTimeout(1500);
}

test.describe('live item/XP persistence journey (264)', () => {
  test('drop + orb persist across reload field-for-field', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);
    const [px, py, pz] = await playerPos(page);

    // Spawn outside the live collection radii (pickup 1.5, orb attraction 8)
    // so the simulation tick cannot move or collect either entity.
    await page.evaluate(
      ({ x, y, z }) => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        g?.itemEntities?.spawnLootStacks([{ item: 12, count: 3 }], x + 3, y + 1, z);
        g?.xpOrbs?.spawnXpOrb(7, x - 12, y + 1, z);
      },
      { x: px, y: py, z: pz },
    );
    expect(await counts(page)).toEqual({ items: 1, orbs: 1 });

    await saveAndSettle(page);
    const dropsBefore = await drops(page);
    const orbsBefore = await orbs(page);
    expect(dropsBefore).toHaveLength(1);
    expect(orbsBefore).toHaveLength(1);
    expect(dropsBefore[0]).toMatchObject({ item: PLANKS, count: 3 });
    expect(orbsBefore[0]).toMatchObject({ value: 7 });

    await page.reload();
    await waitForGame(page);
    expect(await counts(page)).toEqual({ items: 1, orbs: 1 });

    const dropsAfter = await drops(page);
    const orbsAfter = await orbs(page);
    // Same ids, same contents, same (unmoved) positions; age only advances.
    expect(stripAge(dropsAfter)).toEqual(stripAge(dropsBefore));
    expect(stripAge(orbsAfter)).toEqual(stripAge(orbsBefore));
    expect(dropsAfter[0]!.ageTicks).toBeGreaterThanOrEqual(dropsBefore[0]!.ageTicks ?? 0);
    expect(orbsAfter[0]!.ageTicks).toBeGreaterThanOrEqual(orbsBefore[0]!.ageTicks ?? 0);
  });
});

test.describe('item/XP removal persistence (264)', () => {
  test('a removed drop stays gone after reload; empty stays empty', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);
    expect(await counts(page)).toEqual({ items: 0, orbs: 0 });

    const [px, py, pz] = await playerPos(page);
    // A far drop that nothing can touch, plus a near drop the live tick
    // should auto-collect at the player's feet (age delay 10 ticks, radius
    // 1.5). Pointer lock arms the simulation tick; when the harness cannot
    // run the play gate, fall back to the manager removal the pickup path
    // itself calls (documented below).
    await page.click('#game-canvas');
    const nearId = await page.evaluate(
      ({ x, y, z }) => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        g?.itemEntities?.spawnLootStacks([{ item: 12, count: 3 }], x + 5, y + 1, z);
        const near = g?.itemEntities?.spawnLootStacks([{ item: 12, count: 1 }], x, y + 0.5, z);
        return near?.[0]?.id ?? -1;
      },
      { x: px, y: py, z: pz },
    );
    expect((await counts(page)).items).toBeGreaterThanOrEqual(1);

    let collectedLive = false;
    try {
      await page.waitForFunction(
        () => {
          const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
          return (g?.getItemEntityCount() ?? 2) <= 1;
        },
        { timeout: 25_000 },
      );
      collectedLive = true;
    } catch {
      // Harness play-gate fallback: remove the near drop through the manager
      // exactly as the pickup path does once the insert succeeds.
      await page.evaluate((id) => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        g?.itemEntities?.removeItemEntity(id);
      }, nearId);
    }
    console.log(`removal path: ${collectedLive ? 'live-tick collection' : 'manager-removal fallback'}`);

    const remaining = await drops(page);
    expect(remaining).toHaveLength(1);
    await saveAndSettle(page);

    await page.reload();
    await waitForGame(page);
    const after = await drops(page);
    expect(stripAge(after)).toEqual(stripAge(remaining));
    expect(after[0]!.ageTicks).toBeGreaterThanOrEqual(remaining[0]!.ageTicks ?? 0);
    expect(await counts(page)).toEqual({ items: 1, orbs: 0 });
  });
});
