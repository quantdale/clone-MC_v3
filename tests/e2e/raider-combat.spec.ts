import { test, expect, type Page } from '@playwright/test';

/**
 * Raider combat (288): start a raid, observe raiders damage the player via
 * debugTickRaid combat ticks, kill raiders via debugDamageRaidEntity toward
 * VICTORY, and prove player death yields DEFEAT.
 */

type RaidStateView = {
  status: string;
  raidersRemaining: number;
  waveIndex: number;
  totalWaves: number;
};

type GameHandle = {
  getRaidState(): RaidStateView | null;
  debugStartRaid(badOmenLevel?: number): RaidStateView;
  debugTickRaid(): RaidStateView | null;
  getRaidWaveEntityIds(): number[];
  debugDamageRaidEntity(entityId: number, amount: number): boolean;
  debugKillPlayer(): void;
  survival: { health: number };
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

test.describe('raider combat (288)', () => {
  test('raiders damage player; killing them reaches VICTORY', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    const started = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const beforeHp = g.survival.health;
      const raid = g.debugStartRaid(1);
      return {
        beforeHp,
        status: raid.status,
        remaining: raid.raidersRemaining,
        ids: [...g.getRaidWaveEntityIds()],
      };
    });
    expect(started.status).toBe('ACTIVE');
    expect(started.ids.length).toBeGreaterThan(0);
    expect(started.remaining).toBeGreaterThan(0);

    // Deterministic combat ticks (each debugTickRaid runs tickRaiderCombat).
    const afterCombat = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      for (let i = 0; i < 60; i++) g.debugTickRaid();
      return {
        hp: g.survival.health,
        remaining: g.getRaidState()?.raidersRemaining ?? -1,
        ids: [...g.getRaidWaveEntityIds()],
      };
    });
    expect(afterCombat.hp).toBeLessThan(started.beforeHp);

    const outcome = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      let guard = 0;
      while (guard++ < 500) {
        const state = g.getRaidState();
        if (!state || state.status === 'VICTORY' || state.status === 'DEFEAT') {
          return { status: state?.status ?? 'NONE', guard };
        }
        const ids = g.getRaidWaveEntityIds();
        if (ids.length === 0) {
          g.debugTickRaid();
          continue;
        }
        for (const id of ids) {
          g.debugDamageRaidEntity(id, 10_000);
        }
        g.debugTickRaid();
      }
      return { status: g.getRaidState()?.status ?? 'TIMEOUT', guard };
    });

    expect(outcome.status).toBe('VICTORY');
  });

  test('player death during ACTIVE raid yields DEFEAT', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.debugStartRaid(1);
      const before = g.getRaidState();
      g.debugKillPlayer();
      const after = g.getRaidState();
      return {
        before: before?.status ?? null,
        after: after?.status ?? null,
        ids: [...g.getRaidWaveEntityIds()],
      };
    });
    expect(result.before).toBe('ACTIVE');
    expect(result.after).toBe('DEFEAT');
    expect(result.ids).toEqual([]);
  });
});
