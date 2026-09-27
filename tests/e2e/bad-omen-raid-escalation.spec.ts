import { test, expect, type Page } from '@playwright/test';

/**
 * Bad Omen raid escalation + death parity (294): an omen trigger inside a
 * village that already has an ACTIVE raid escalates that raid in place
 * (level + omen, cap 5; wave total per the 152 table) instead of replacing
 * it, dismisses any patrol (291 rule) and consumes the omen together with the
 * raid save, so a reload keeps the escalated raid and omen 0; winning the
 * escalated raid grants HOTV at the escalated level. Death clears Bad Omen
 * durably (vanilla), so a reload after death shows omen 0.
 */

type RaidView = {
  status: string;
  badOmenLevel: number;
  totalWaves: number;
  waveIndex: number;
  raidersRemaining: number;
  centerX: number;
  centerY: number;
  centerZ: number;
} | null;
type VillageView = { centerX: number; centerY: number; centerZ: number; containsPlayer: boolean };
type PatrolView = { memberIds: number[]; captainId: number | null } | null;
type Action = {
  kind: string;
  reason?: string;
  badOmenLevel?: number;
  raidLevelBefore?: number;
  raidLevelAfter?: number;
  totalWavesBefore?: number;
  totalWavesAfter?: number;
};

type GameHandle = {
  getRaidState(): RaidView;
  debugStartRaid(level?: number): RaidView;
  debugClearRaidWave(): RaidView;
  getRaidWaveEntityIds(): number[];
  getBadOmenLevel(): number;
  getBadOmenRemainingSeconds(): number;
  grantBadOmen(amount?: number): void;
  clearBadOmen(): void;
  setVillageQuery(q: (() => VillageView | null) | null): void;
  evaluateBadOmenVillageTrigger(): Action;
  debugSpawnPatrol(): PatrolView;
  getPatrolState(): PatrolView;
  getHeroOfTheVillageAmplifier(): number | null;
  debugKillPlayer(): void;
  dismissDeathScreen(): boolean;
  getDeathPresentationState(): { open: boolean };
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

/** Fixture village centered on the player's current position. */
async function villageAtPlayer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
    const p = g.player.position;
    const c = { centerX: p.x, centerY: p.y, centerZ: p.z, containsPlayer: true };
    g.setVillageQuery(() => c);
  });
}

async function spawnPatrol(page: Page): Promise<NonNullable<PatrolView>> {
  let last: PatrolView = null;
  for (let i = 0; i < 30; i++) {
    last = await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.debugSpawnPatrol());
    if (last && last.memberIds.length > 0) return last;
    await page.waitForTimeout(500);
  }
  throw new Error(`could not force a patrol: ${JSON.stringify(last)}`);
}

test.describe('Bad Omen raid escalation + death parity (294)', () => {
  test('omen during an ACTIVE raid escalates it in place, survives reload, and escalated victory grants HOTV III', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await waitForGame(page);
    await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.clearBadOmen());
    await villageAtPlayer(page);

    // Omen 1 inside the village starts a level-1 raid (285 path unchanged).
    const started = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
      g.grantBadOmen(1);
      const action = g.evaluateBadOmenVillageTrigger();
      return { action, raid: g.getRaidState(), wave: g.getRaidWaveEntityIds(), omen: g.getBadOmenLevel() };
    });
    expect(started.action.kind).toBe('START_RAID');
    expect(started.raid).toMatchObject({ status: 'ACTIVE', badOmenLevel: 1, totalWaves: 3, waveIndex: 1 });
    expect(started.wave.length).toBeGreaterThan(0);
    expect(started.omen).toBe(0);

    // A patrol appears during the raid (forced), then the player gains omen 2.
    const patrol = await spawnPatrol(page);
    expect(patrol.memberIds.length).toBeGreaterThan(0);

    const escalated = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
      g.grantBadOmen(2);
      const omenBefore = g.getBadOmenLevel();
      const action = g.evaluateBadOmenVillageTrigger();
      const omenEl = document.getElementById('raid-bar-omen') as HTMLElement | null;
      return {
        omenBefore,
        action,
        raid: g.getRaidState(),
        wave: g.getRaidWaveEntityIds(),
        patrol: g.getPatrolState(),
        omen: g.getBadOmenLevel(),
        remaining: g.getBadOmenRemainingSeconds(),
        badge: omenEl && !omenEl.hidden ? omenEl.textContent : null,
      };
    });
    expect(escalated.omenBefore).toBe(2);
    expect(escalated.action).toMatchObject({
      kind: 'ESCALATE_RAID',
      badOmenLevel: 2,
      raidLevelBefore: 1,
      raidLevelAfter: 3,
      totalWavesBefore: 3,
      totalWavesAfter: 5,
    });
    // Same raid: wave progress, remaining raiders, center and wave entities carry over.
    expect(escalated.raid).toMatchObject({
      status: 'ACTIVE',
      badOmenLevel: 3,
      totalWaves: 5,
      waveIndex: 1,
      raidersRemaining: started.raid!.raidersRemaining,
      centerX: started.raid!.centerX,
      centerZ: started.raid!.centerZ,
    });
    expect([...escalated.wave].sort()).toEqual([...started.wave].sort());
    expect(escalated.patrol?.memberIds ?? []).toEqual([]);
    expect(escalated.omen).toBe(0);
    expect(escalated.remaining).toBe(0);
    expect(escalated.badge).toBe('Bad Omen 3');

    // Reload: the escalated raid and the consumed omen were saved together.
    await pagehideAndReload(page);
    const reloaded = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
      return { raid: g.getRaidState(), omen: g.getBadOmenLevel(), remaining: g.getBadOmenRemainingSeconds() };
    });
    expect(reloaded.raid).toMatchObject({ status: 'ACTIVE', badOmenLevel: 3, totalWaves: 5, waveIndex: 1 });
    expect(reloaded.omen).toBe(0);
    expect(reloaded.remaining).toBe(0);

    // Win the escalated raid: all 5 waves, HOTV amplifier 2 (Hero III).
    const won = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
      let maxWave = g.getRaidState()?.waveIndex ?? 0;
      let status = g.getRaidState()?.status ?? 'NONE';
      for (let i = 0; i < 20 && status === 'ACTIVE'; i++) {
        const r = g.debugClearRaidWave();
        status = r?.status ?? 'NONE';
        maxWave = Math.max(maxWave, r?.waveIndex ?? 0);
      }
      return { status, maxWave, amp: g.getHeroOfTheVillageAmplifier() };
    });
    expect(won.status).toBe('VICTORY');
    expect(won.maxWave).toBe(5);
    expect(won.amp).toBe(2);
  });

  test('cap escalation consumes the omen; a finished raid is restarted, not escalated', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await waitForGame(page);
    await page.evaluate(() => (window as unknown as { __voxelGame: GameHandle }).__voxelGame.clearBadOmen());
    await villageAtPlayer(page);
    const result = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
      g.debugStartRaid(5); // centered on the player = inside the fixture village
      g.grantBadOmen(3);
      const cap = g.evaluateBadOmenVillageTrigger();
      const capRaid = g.getRaidState();
      const capOmen = g.getBadOmenLevel();
      for (let i = 0; i < 20 && g.getRaidState()?.status === 'ACTIVE'; i++) g.debugClearRaidWave();
      const ended = g.getRaidState()?.status;
      g.grantBadOmen(2);
      const restart = g.evaluateBadOmenVillageTrigger();
      return { cap, capRaid, capOmen, ended, restart, raid: g.getRaidState(), omen: g.getBadOmenLevel() };
    });
    expect(result.cap).toMatchObject({ kind: 'ESCALATE_RAID', raidLevelBefore: 5, raidLevelAfter: 5, totalWavesBefore: 7, totalWavesAfter: 7 });
    expect(result.capRaid).toMatchObject({ status: 'ACTIVE', badOmenLevel: 5, totalWaves: 7 });
    expect(result.capOmen).toBe(0);
    expect(result.ended).toBe('VICTORY');
    expect(result.restart.kind).toBe('START_RAID');
    expect(result.raid).toMatchObject({ status: 'ACTIVE', badOmenLevel: 2, totalWaves: 4, waveIndex: 1 });
    expect(result.omen).toBe(0);
  });

  test('death clears Bad Omen durably: reload after death shows omen 0', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await waitForGame(page);
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
      g.setVillageQuery(() => null);
      g.clearBadOmen();
      g.grantBadOmen(3);
    });

    // Control: without a death the omen persists across reload (292).
    await pagehideAndReload(page);
    const kept = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
      return { omen: g.getBadOmenLevel(), remaining: g.getBadOmenRemainingSeconds() };
    });
    expect(kept.omen).toBe(3);
    expect(kept.remaining).toBeGreaterThan(0);

    const died = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
      g.setVillageQuery(() => null);
      g.debugKillPlayer();
      const open = g.getDeathPresentationState().open;
      g.dismissDeathScreen();
      return { open, omen: g.getBadOmenLevel(), remaining: g.getBadOmenRemainingSeconds() };
    });
    expect(died.open).toBe(true);
    expect(died.omen).toBe(0);
    expect(died.remaining).toBe(0);

    // Reload straight after death (the respawn save is durable on its own).
    await page.waitForTimeout(800);
    await page.reload();
    await waitForGame(page);
    const after = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame: GameHandle }).__voxelGame;
      return { omen: g.getBadOmenLevel(), remaining: g.getBadOmenRemainingSeconds() };
    });
    expect(after.omen).toBe(0);
    expect(after.remaining).toBe(0);
  });
});
