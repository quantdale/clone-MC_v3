import { test, expect, type Page } from '@playwright/test';

/**
 * Pillager patrols (291): a fresh world is too young for natural patrols;
 * a forced patrol has 2–4 pillagers with exactly one captain and fights the
 * player; only the captain's death grants Bad Omen (+1, cap 5) and never
 * touches raid state; raid wave kills never grant omen; reload clears the
 * transient patrol and the ephemeral (285) Bad Omen.
 */

type Decision = { kind: string; reason?: string; members?: Array<{ captain: boolean }> };
type PatrolView = {
  generation: number;
  memberIds: number[];
  captainId: number | null;
  anchor: { x: number; y: number; z: number } | null;
  cooldownTicks: number;
  lastDecision: Decision | null;
  lastApplyOk: boolean | null;
};
type RaidStateView = { status: string; raidersRemaining: number } | null;

type GameHandle = {
  getPatrolState(): PatrolView;
  debugRunPatrolAttempt(): Decision | null;
  debugSpawnPatrol(): PatrolView | null;
  debugDamagePatrolEntity(id: number, amount: number): boolean;
  debugTickPatrols(n: number): PatrolView | null;
  debugGetPatrolEntityPosition(id: number): { x: number; y: number; z: number } | null;
  getBadOmenLevel(): number;
  grantBadOmen(amount?: number): void;
  clearBadOmen(): void;
  getRaidState(): RaidStateView;
  debugStartRaid(badOmenLevel?: number): RaidStateView;
  getRaidWaveEntityIds(): number[];
  debugDamageRaidEntity(id: number, amount: number): boolean;
  setVillageQuery(q: (() => null) | null): void;
  survival: { health: number };
  player: { position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void } };
  persistence?: { flush?: () => Promise<void> };
};

async function waitForGame(page: Page): Promise<void> {
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 120_000 });
  await page.waitForFunction(
    () => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame != null,
    null,
    { timeout: 120_000 },
  );
}

/** Force a patrol, retrying while nearby columns are still streaming in. */
async function spawnPatrol(page: Page, minMembers = 1): Promise<PatrolView> {
  let last: PatrolView | null = null;
  for (let i = 0; i < 30; i++) {
    last = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return g.debugSpawnPatrol();
    });
    if (last && last.memberIds.length >= minMembers) return last;
    await page.waitForTimeout(500);
  }
  throw new Error(`could not force a patrol: ${JSON.stringify(last)}`);
}

test.describe('pillager patrol → Bad Omen (291)', () => {
  test('rules, captain omen, cap, raid isolation', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await waitForGame(page);

    // Fixture: no village near spawn so the 285 trigger stays idle.
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setVillageQuery(() => null);
      g.clearBadOmen();
    });

    // Natural attempt on a fresh world: too young (persisted time_played < 60000).
    const natural = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return { decision: g.debugRunPatrolAttempt(), state: g.getPatrolState() };
    });
    expect(natural.decision).toEqual({ kind: 'SKIP', reason: 'WORLD_TOO_YOUNG' });
    expect(natural.state.memberIds).toEqual([]);
    expect(natural.state.cooldownTicks).toBeGreaterThanOrEqual(6000);
    expect(natural.state.cooldownTicks).toBeLessThan(6600);

    // Forced patrol: 2..4 planned pillagers with exactly one captain.
    const patrol = await spawnPatrol(page, 2);
    expect(patrol.lastApplyOk).toBe(true);
    const planned = patrol.lastDecision?.members ?? [];
    expect(planned.length).toBeGreaterThanOrEqual(2);
    expect(planned.length).toBeLessThanOrEqual(4);
    expect(planned.filter((m) => m.captain)).toHaveLength(1);
    expect(patrol.captainId).toBe(patrol.memberIds[0]);

    // Patrol pillagers fight: stand 6 blocks from the captain and tick combat.
    const combat = await page.evaluate((captainId) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const pos = g.debugGetPatrolEntityPosition(captainId)!;
      const before = g.survival.health;
      g.player.position.set(pos.x + 6, pos.y, pos.z);
      for (let i = 0; i < 20; i++) {
        g.debugTickPatrols(20);
        if (g.survival.health < before) break;
        g.player.position.set(pos.x + 6, pos.y, pos.z);
      }
      return { before, after: g.survival.health };
    }, patrol.captainId!);
    expect(combat.after).toBeLessThan(combat.before);

    // Non-captain kill keeps omen at 0; captain kill → 1; raid state untouched.
    const kills = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const s = g.getPatrolState();
      const raidBefore = g.getRaidState();
      const captain = s.captainId!;
      const other = s.memberIds.find((id) => id !== captain);
      let afterOther = -1;
      if (other !== undefined) {
        g.debugDamagePatrolEntity(other, 10_000);
        afterOther = g.getBadOmenLevel();
      }
      const died = g.debugDamagePatrolEntity(captain, 10_000);
      const again = g.debugDamagePatrolEntity(captain, 10_000);
      return {
        afterOther,
        died,
        again,
        omen: g.getBadOmenLevel(),
        raidBefore,
        raidAfter: g.getRaidState(),
        captainAfter: g.getPatrolState().captainId,
      };
    });
    expect(kills.afterOther).toBe(0);
    expect(kills.died).toBe(true);
    expect(kills.again).toBe(false);
    expect(kills.omen).toBe(1);
    expect(kills.captainAfter).toBeNull();
    expect(kills.raidBefore).toBeNull();
    expect(kills.raidAfter).toBeNull();

    // Cap at 5.
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.grantBadOmen(4);
    });
    const capped = await spawnPatrol(page, 1);
    const capOmen = await page.evaluate((captainId) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const before = g.getBadOmenLevel();
      g.debugDamagePatrolEntity(captainId, 10_000);
      return { before, after: g.getBadOmenLevel() };
    }, capped.captainId!);
    expect(capOmen.before).toBe(5);
    expect(capOmen.after).toBe(5);

    // Raid isolation: raid start dismisses a live patrol; raid kills never grant.
    await spawnPatrol(page, 1);
    const raid = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.clearBadOmen();
      const state = g.debugStartRaid(1);
      const patrolAfterStart = g.getPatrolState().memberIds.length;
      const natural = g.debugRunPatrolAttempt();
      const ids = [...g.getRaidWaveEntityIds()];
      let killed = 0;
      for (const id of ids) if (g.debugDamageRaidEntity(id, 10_000)) killed++;
      return {
        status: state?.status,
        patrolAfterStart,
        natural,
        killed,
        omen: g.getBadOmenLevel(),
      };
    });
    expect(raid.status).toBe('ACTIVE');
    expect(raid.patrolAfterStart).toBe(0);
    expect(raid.natural).toEqual({ kind: 'SKIP', reason: 'RAID_ACTIVE' });
    expect(raid.killed).toBeGreaterThan(0);
    expect(raid.omen).toBe(0);
  });

  test('reload clears the transient patrol and ephemeral Bad Omen', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await waitForGame(page);
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setVillageQuery(() => null);
      g.clearBadOmen();
    });
    const patrol = await spawnPatrol(page, 2);
    const before = await page.evaluate((captainId) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.debugDamagePatrolEntity(captainId, 10_000);
      return { omen: g.getBadOmenLevel(), members: g.getPatrolState().memberIds.length };
    }, patrol.captainId!);
    expect(before.omen).toBe(1);
    expect(before.members).toBeGreaterThan(0);

    await page.evaluate(async () => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      if (g.persistence?.flush) await g.persistence.flush();
    });
    await page.waitForTimeout(800);
    await page.reload();
    await waitForGame(page);
    const after = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return { omen: g.getBadOmenLevel(), patrol: g.getPatrolState() };
    });
    expect(after.patrol.memberIds).toEqual([]);
    expect(after.patrol.captainId).toBeNull();
    expect(after.omen).toBe(0);
  });
});
