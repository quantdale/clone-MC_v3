import { test, expect, type Page } from '@playwright/test';

/**
 * Player status-effect persistence (292): Hero of the Village (amplifier +
 * remaining duration) and Bad Omen (level + remaining duration) survive
 * pagehide + reload through the 289 durable player-state path, durations
 * resume (never reset to full), and a restored omen inside a village starts a
 * raid on the next tick like live omen — dismissing any patrol (291) and
 * consuming the omen durably so a further reload cannot replay it.
 */

type RaidStateView = { status: string; badOmenLevel: number; raidersRemaining: number } | null;
type EffectView = { typeId: string; duration: number; amplifier: number };
type VillageView = { centerX: number; centerY: number; centerZ: number; containsPlayer: boolean };
type PatrolView = { memberIds: number[]; captainId: number | null };

type GameHandle = {
  getRaidState(): RaidStateView;
  debugStartRaid(badOmenLevel?: number): RaidStateView;
  debugClearRaidWave(): RaidStateView;
  getHeroOfTheVillageAmplifier(): number | null;
  getBadOmenLevel(): number;
  getBadOmenRemainingSeconds(): number;
  grantBadOmen(amount?: number): void;
  clearBadOmen(): void;
  debugTickStatusEffects(seconds: number): void;
  getStatusEffectRestoreReport(): { status: string; dropped: number; effects: number; badOmenLevel: number };
  setVillageQuery(q: (() => VillageView | null) | null): void;
  debugSpawnPatrol(): PatrolView | null;
  getPatrolState(): PatrolView;
  evaluateBadOmenVillageTrigger(): { kind: string; badOmenLevel?: number; reason?: string };
  playerEffects: { serialize(): EffectView[] };
  player: { position: { x: number; y: number; z: number } };
  persistence?: { flush?: () => Promise<unknown> };
};

async function waitForGame(page: Page): Promise<void> {
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 120_000 });
  await page.waitForFunction(
    () => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame != null,
    null,
    { timeout: 120_000 },
  );
}

/** Real pagehide path (no dispose) + facade flush, then a browser reload. */
async function pagehideAndReload(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    if (g.persistence?.flush) await g.persistence.flush();
  });
  await page.waitForTimeout(800);
  await page.reload();
  await waitForGame(page);
}

test.describe('player status-effect persistence (292)', () => {
  test('HOTV and Bad Omen survive pagehide + reload with resumed durations', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await waitForGame(page);

    // Fresh world: nothing restored (no payload yet or an empty one).
    const fresh = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return {
        effects: g.playerEffects.serialize(),
        omen: g.getBadOmenLevel(),
        remaining: g.getBadOmenRemainingSeconds(),
        report: g.getStatusEffectRestoreReport(),
      };
    });
    expect(fresh.effects).toEqual([]);
    expect(fresh.omen).toBe(0);
    expect(fresh.remaining).toBe(0);
    expect(['not-run', 'absent', 'ok']).toContain(fresh.report.status);

    const before = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setVillageQuery(() => null); // no village: omen must not start a raid
      g.debugStartRaid(3);
      let guard = 0;
      while (g.getRaidState()?.status === 'ACTIVE' && guard++ < 20) g.debugClearRaidWave();
      g.grantBadOmen(2);
      // Age both by 100 s as unpaused play would (proves resume, not reset).
      g.debugTickStatusEffects(100);
      const hero = g.playerEffects.serialize().find((e) => e.typeId.includes('hero_of_the_village'));
      return {
        status: g.getRaidState()?.status,
        amp: g.getHeroOfTheVillageAmplifier(),
        heroDuration: hero?.duration ?? -1,
        omen: g.getBadOmenLevel(),
        omenRemaining: g.getBadOmenRemainingSeconds(),
      };
    });
    expect(before.status).toBe('VICTORY');
    expect(before.amp).toBe(2); // omen 3 → HOTV III (amplifier 2)
    expect(before.heroDuration).toBeGreaterThan(0);
    expect(before.heroDuration).toBeLessThanOrEqual(2400 - 100);
    expect(before.omen).toBe(2);
    expect(before.omenRemaining).toBeLessThanOrEqual(6000 - 100);
    expect(before.omenRemaining).toBeGreaterThan(6000 - 200);

    await pagehideAndReload(page);

    const after = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const hero = g.playerEffects.serialize().find((e) => e.typeId.includes('hero_of_the_village'));
      return {
        status: g.getRaidState()?.status,
        amp: g.getHeroOfTheVillageAmplifier(),
        heroDuration: hero?.duration ?? -1,
        heroCount: g.playerEffects.serialize().filter((e) => e.typeId.includes('hero_of_the_village')).length,
        omen: g.getBadOmenLevel(),
        omenRemaining: g.getBadOmenRemainingSeconds(),
        report: g.getStatusEffectRestoreReport(),
      };
    });
    expect(after.report.status).toBe('ok');
    expect(after.status).toBe('VICTORY'); // 283 raid record; no re-grant on hydrate
    expect(after.amp).toBe(2);
    expect(after.heroCount).toBe(1);
    // Resumed: never longer than before the reload, never reset to 2400.
    expect(after.heroDuration).toBeLessThanOrEqual(before.heroDuration);
    expect(after.heroDuration).toBeGreaterThan(before.heroDuration - 120);
    expect(after.omen).toBe(2);
    expect(after.omenRemaining).toBeLessThanOrEqual(before.omenRemaining);
    expect(after.omenRemaining).toBeGreaterThan(before.omenRemaining - 120);
  });

  test('restored Bad Omen inside a village raids on the next unpaused tick, dismisses patrol, stays consumed', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await waitForGame(page);
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setVillageQuery(() => null);
      g.clearBadOmen();
      g.grantBadOmen(1);
    });
    await pagehideAndReload(page);

    const restored = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return { omen: g.getBadOmenLevel(), remaining: g.getBadOmenRemainingSeconds(), raid: g.getRaidState() };
    });
    expect(restored.omen).toBe(1);
    expect(restored.remaining).toBeGreaterThan(0);
    expect(restored.remaining).toBeLessThanOrEqual(6000);
    expect(restored.raid).toBeNull();

    // A live patrol exists (forced; retry while columns stream), then the
    // player turns out to be inside a village: the live fixed tick must start
    // the raid, dismiss the patrol and consume the restored omen.
    let patrol: PatrolView | null = null;
    for (let i = 0; i < 30 && !(patrol && patrol.memberIds.length > 0); i++) {
      patrol = await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
        g.setVillageQuery(() => null);
        return g.debugSpawnPatrol();
      });
      if (!(patrol && patrol.memberIds.length > 0)) await page.waitForTimeout(500);
    }
    expect(patrol?.memberIds.length ?? 0).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.getBadOmenLevel())).toBe(1);

    // The headless session sits on the "Click to play" pause overlay, so the
    // fixed tick is not running: a paused game must NOT consume the restored
    // omen (285 pause freeze). The next unpaused fixed tick runs exactly
    // `evaluateBadOmenVillageTrigger()` (tick step 5.8), invoked here directly.
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const p = g.player.position;
      g.setVillageQuery(() => ({ centerX: p.x, centerY: p.y, centerZ: p.z, containsPlayer: true }));
    });
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.getBadOmenLevel())).toBe(1);
    const decision = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return g.evaluateBadOmenVillageTrigger();
    });
    expect(decision.kind).toBe('START_RAID');
    expect(decision.badOmenLevel).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.getBadOmenLevel())).toBe(0);
    const raided = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return { raid: g.getRaidState(), patrol: g.getPatrolState(), remaining: g.getBadOmenRemainingSeconds() };
    });
    expect(raided.raid?.status).toBe('ACTIVE');
    expect(raided.raid?.badOmenLevel).toBe(1);
    expect(raided.patrol.memberIds).toEqual([]);
    expect(raided.patrol.captainId).toBeNull();
    expect(raided.remaining).toBe(0);

    await pagehideAndReload(page);
    const again = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return { omen: g.getBadOmenLevel(), raid: g.getRaidState() };
    });
    expect(again.omen).toBe(0); // consumed omen is durable — no replay
    expect(again.raid?.status).toBe('ACTIVE'); // 283 restores the raid it started
    expect(again.raid?.badOmenLevel).toBe(1);
  });
});
