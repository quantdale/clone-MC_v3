import { test, expect, type Page } from '@playwright/test';

/**
 * Live village detection (287): place qualifying beds near the player, grant
 * Bad Omen, evaluate the village trigger without fixture VillageQuery, observe
 * raid start + omen clear; prove forced-null override does not start a raid.
 */

const BED_BLOCK_ID = 63;

type RaidStateView = {
  status: string;
  badOmenLevel: number;
};

type OmenDecisionView =
  | {
      kind: 'START_RAID';
      centerX: number;
      centerY: number;
      centerZ: number;
      badOmenLevel: number;
    }
  | { kind: 'NONE'; reason: string };

type VillageView = {
  centerX: number;
  centerY: number;
  centerZ: number;
  containsPlayer: boolean;
} | null;

type GameHandle = {
  getRaidState(): RaidStateView | null;
  getBadOmenLevel(): number;
  grantBadOmen(amount?: number): void;
  setVillageQuery(
    query: (() => {
      centerX: number;
      centerY: number;
      centerZ: number;
      containsPlayer: boolean;
    } | null) | null,
  ): void;
  evaluateBadOmenVillageTrigger(): OmenDecisionView;
  debugDetectVillage(): VillageView;
  getPlayerPosition(): [number, number, number];
  world: {
    setBlock(x: number, y: number, z: number, id: number): void;
    getBlock(x: number, y: number, z: number): number;
    getMotionBlockingHeight(x: number, z: number): number;
  };
};

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 120_000 });
  await page.waitForFunction(
    () => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame != null,
    null,
    { timeout: 120_000 },
  );
}

async function placeBedNearPlayer(page: Page): Promise<{ x: number; y: number; z: number }> {
  return page.evaluate((bedId) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
    const [px, , pz] = g.getPlayerPosition();
    const x = Math.floor(px);
    const z = Math.floor(pz);
    const surface = g.world.getMotionBlockingHeight(x, z);
    const y = Math.max(1, surface + 1);
    g.world.setBlock(x, y, z, bedId);
    return { x, y, z, placed: g.world.getBlock(x, y, z) };
  }, BED_BLOCK_ID);
}

test.describe('live village detection (287)', () => {
  test('place bed + omen starts raid without fixture query', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    const baseline = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setVillageQuery(null);
      return {
        omen: g.getBadOmenLevel(),
        raid: g.getRaidState(),
      };
    });
    expect(baseline.omen).toBe(0);
    expect(baseline.raid).toBeNull();

    const bed = await placeBedNearPlayer(page);
    expect(bed.y).toBeGreaterThan(0);

    const detected = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setVillageQuery(null); // clear cache + restore live
      return g.debugDetectVillage();
    });
    expect(detected).not.toBeNull();
    expect(detected!.containsPlayer).toBe(true);

    const triggered = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.grantBadOmen(2);
      const levelAfterGrant = g.getBadOmenLevel();
      const decision = g.evaluateBadOmenVillageTrigger();
      return {
        levelAfterGrant,
        decision,
        omen: g.getBadOmenLevel(),
        raid: g.getRaidState(),
      };
    });
    expect(triggered.levelAfterGrant).toBe(2);
    expect(triggered.decision.kind).toBe('START_RAID');
    expect(triggered.omen).toBe(0);
    expect(triggered.raid).not.toBeNull();
    expect(triggered.raid!.status).toBe('ACTIVE');

    const bar = await page.evaluate(() => {
      const el = document.getElementById('raid-feedback');
      return {
        present: !!el,
        hidden: el?.classList.contains('hidden') ?? true,
        status: el?.getAttribute('data-status') ?? null,
      };
    });
    expect(bar.present).toBe(true);
    expect(bar.hidden).toBe(false);
  });

  test('beds present but null override yields NO_VILLAGE and retains omen', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);
    await placeBedNearPlayer(page);
    const result = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      // Bypass live beds intentionally.
      g.setVillageQuery(() => null);
      g.grantBadOmen(1);
      const decision = g.evaluateBadOmenVillageTrigger();
      return { decision, omen: g.getBadOmenLevel(), raid: g.getRaidState() };
    });
    expect(result.decision).toEqual({ kind: 'NONE', reason: 'NO_VILLAGE' });
    expect(result.omen).toBe(1);
    expect(result.raid).toBeNull();
  });
});
