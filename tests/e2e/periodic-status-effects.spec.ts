import { test, expect, type Page } from '@playwright/test';

/**
 * Periodic status effects (296): a player's own poison splash lowers health
 * over fixed ticks on the vanilla 25-tick schedule and stops at 1 HP;
 * regeneration heals back to max; wither can kill and opens the death screen
 * with cause "Wither"; a paused game (no pointer lock) applies nothing.
 */

type GameHandle = {
  testGrantSplashPotion(effectKey: string, durationSeconds?: number, amplifier?: number): number;
  debugThrowSplashPotion(yaw?: number, pitch?: number): boolean;
  debugTickSplashPotions(n?: number): number;
  debugAddPlayerEffect(key: string, seconds: number, amplifier?: number): boolean;
  debugTickPeriodicStatusEffects(ticks: number): number;
  getPlayerEffect(key: string): { duration: number; amplifier: number } | null;
  getDeathPresentationState(): { open: boolean; cause: string; outcome: string | null };
  getGameMode(): string;
  setGameMode(mode: string): boolean;
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

test.describe('periodic status effects (296)', () => {
  test('splash poison lowers health over ticks, stops at 1 HP; regeneration heals; pause applies nothing', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);

    const splashed = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.testGrantSplashPotion('poison', 45, 0);
      const ok = g.debugThrowSplashPotion(0, -Math.PI / 2);
      g.debugTickSplashPotions(40);
      return { ok, mode: g.getGameMode(), hp: g.survival.health, poison: g.getPlayerEffect('poison') };
    });
    expect(splashed.ok).toBe(true);
    expect(splashed.mode).toBe('survival');
    expect(splashed.hp).toBe(20);
    expect(splashed.poison).not.toBeNull();
    expect(splashed.poison!.duration).toBeGreaterThan(30);

    // Paused: the page has no pointer lock, so the real fixed-tick driver emits
    // no ticks — real time passing must not apply poison or count it down.
    const pausedBefore = splashed.poison!.duration;
    await page.waitForTimeout(1500);
    const paused = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return { hp: g.survival.health, poison: g.getPlayerEffect('poison') };
    });
    expect(paused.hp).toBe(20);
    expect(paused.poison!.duration).toBe(pausedBefore);

    const ticked = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const samples: number[] = [];
      for (let i = 0; i < 10; i++) {
        g.debugTickPeriodicStatusEffects(100);
        samples.push(g.survival.health);
      }
      return { samples, poison: g.getPlayerEffect('poison'), death: g.getDeathPresentationState() };
    });
    // Health falls over time (1 HP per 25 ticks → 4 per 100 ticks at first)…
    expect(ticked.samples[0]).toBe(16);
    for (let i = 1; i < ticked.samples.length; i++) {
      expect(ticked.samples[i]!).toBeLessThanOrEqual(ticked.samples[i - 1]!);
    }
    // …and poison never takes the last half heart.
    expect(Math.min(...ticked.samples)).toBe(1);
    expect(ticked.samples.at(-1)).toBe(1);
    expect(ticked.poison).toBeNull();
    expect(ticked.death.open).toBe(false);

    const healed = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const added = g.debugAddPlayerEffect('regeneration', 45, 1); // heal 1 per 25 ticks
      g.debugTickPeriodicStatusEffects(1);
      const afterOne = g.survival.health;
      g.debugTickPeriodicStatusEffects(250);
      const mid = g.survival.health;
      g.debugTickPeriodicStatusEffects(400);
      return { added, afterOne, mid, end: g.survival.health };
    });
    expect(healed.added).toBe(true);
    expect(healed.afterOne).toBe(2); // 900 % 25 = 0 → heals on the first tick
    expect(healed.mid).toBe(12);
    expect(healed.end).toBe(20); // capped at max health
  });

  test('wither can kill: real death with the death screen, effects cleared', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const added = g.debugAddPlayerEffect('wither', 60, 1); // 1 HP per 20 ticks
      const before = g.getDeathPresentationState();
      let ticks = 0;
      while (!g.getDeathPresentationState().open && ticks < 1200) {
        ticks += g.debugTickPeriodicStatusEffects(20);
      }
      return {
        added,
        before,
        ticks,
        death: g.getDeathPresentationState(),
        hp: g.survival.health,
        wither: g.getPlayerEffect('wither'),
      };
    });
    expect(result.added).toBe(true);
    expect(result.before.open).toBe(false);
    // 20 hits at 20-tick spacing: the lethal hit lands on tick 381.
    expect(result.ticks).toBe(400);
    expect(result.death.open).toBe(true);
    expect(result.death.cause).toBe('Wither');
    expect(result.death.outcome).toBe('respawned');
    expect(result.hp).toBe(20);
    expect(result.wither).toBeNull();

    // Creative is invulnerable to the same effect.
    const creative = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setGameMode('creative');
      g.debugAddPlayerEffect('wither', 30, 2);
      g.debugTickPeriodicStatusEffects(400);
      return { hp: g.survival.health, wither: g.getPlayerEffect('wither') };
    });
    expect(creative.hp).toBe(20);
    expect(creative.wither!.duration).toBeCloseTo(10, 5);
  });
});
