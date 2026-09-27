import { test, expect, type Page } from '@playwright/test';

/**
 * Throwable splash potions (295): the player throws a held splash potion at
 * their feet (effect applied with a distance-scaled duration, potion consumed;
 * creative keeps it), the in-flight potion renders as a bottle, and a raid
 * witch's real splash potion applies its effect to the player.
 */

type AffectedView = {
  kind: string;
  entityId: number;
  intensity: number;
  direct: boolean;
  damage: number;
  heal: number;
  effects: { typeId: string; durationSeconds: number; amplifier: number }[];
};
type SplashState = {
  potions: { id: number; thrower: string; x: number; y: number; z: number; vy: number; effects: string[] }[];
  shatters: { potionId: number; thrower: string; cause: string; affected: AffectedView[] }[];
  witchThrows: { ownerId: number; choice: string; accepted: boolean }[];
  meshes: { key: string; tint: string; inScene: boolean; childCount: number }[];
};
type GameHandle = {
  testGrantSplashPotion(effectKey: string, durationSeconds?: number, amplifier?: number): number;
  debugThrowSplashPotion(yaw?: number, pitch?: number): boolean;
  debugTickSplashPotions(n?: number): number;
  getSplashPotionState(): SplashState;
  getPlayerEffect(key: string): { duration: number; amplifier: number } | null;
  setGameMode(mode: string): boolean;
  inventory: { getSelectedStack(): { id: number; count: number } | null };
  survival: { health: number };
  debugStartRaid(badOmenLevel?: number): { status: string };
  debugTickRaid(): { status: string } | null;
  getRaiderRenderState(): { expected: { kind: string; entityId: number }[] };
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

test.describe('throwable splash potions (295)', () => {
  test('player throws a poison splash at their feet: renders, shatters, applies scaled poison, consumes', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);

    const thrown = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const slot = g.testGrantSplashPotion('poison', 45, 0);
      const before = g.inventory.getSelectedStack()?.count ?? -1;
      const ok = g.debugThrowSplashPotion(0, -Math.PI / 2);
      const after = g.inventory.getSelectedStack()?.count ?? -1;
      return { slot, before, ok, after, state: g.getSplashPotionState(), poison: g.getPlayerEffect('poison') };
    });
    expect(thrown.slot).toBeGreaterThanOrEqual(0);
    expect(thrown.before).toBe(1);
    expect(thrown.ok).toBe(true);
    expect(thrown.after).toBe(0); // survival consumes one
    expect(thrown.state.potions).toHaveLength(1);
    expect(thrown.state.potions[0]!.thrower).toBe('player');
    expect(thrown.state.potions[0]!.effects).toEqual(['minecraft:effect/poison']);
    expect(thrown.poison).toBeNull();

    // The in-flight bottle is drawn by the render loop (runs while paused).
    await page.waitForFunction(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const m = g.getSplashPotionState().meshes;
      return m.length === 1 && m[0]!.inScene && m[0]!.tint === 'poison' && m[0]!.childCount === 2;
    }, null, { timeout: 30_000 });

    const landed = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const left = g.debugTickSplashPotions(40);
      return { left, state: g.getSplashPotionState(), poison: g.getPlayerEffect('poison') };
    });
    expect(landed.left).toBe(0);
    const shatter = landed.state.shatters.at(-1)!;
    expect(shatter.thrower).toBe('player');
    expect(shatter.cause).toBe('block');
    const self = shatter.affected.find((a) => a.kind === 'player')!;
    expect(self.intensity).toBeGreaterThan(0.5);
    expect(self.intensity).toBeLessThanOrEqual(1);
    expect(landed.poison).not.toBeNull();
    expect(landed.poison!.duration).toBeGreaterThan(1);
    expect(landed.poison!.duration).toBeLessThanOrEqual(45);
    expect(landed.poison!.duration).toBeCloseTo(self.effects[0]!.durationSeconds, 6);

    await page.waitForFunction(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return g.getSplashPotionState().meshes.length === 0;
    }, null, { timeout: 30_000 });
  });

  test('harming splash hurts a survival player; creative keeps the potion and takes no damage', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const hp0 = g.survival.health;
      g.testGrantSplashPotion('instant_damage', 0, 0);
      const ok1 = g.debugThrowSplashPotion(0, -Math.PI / 2);
      g.debugTickSplashPotions(40);
      const hp1 = g.survival.health;
      const survivalShatter = g.getSplashPotionState().shatters.at(-1)!;
      g.setGameMode('creative');
      g.testGrantSplashPotion('instant_damage', 0, 0);
      const ok2 = g.debugThrowSplashPotion(0, -Math.PI / 2);
      const creativeCount = g.inventory.getSelectedStack()?.count ?? -1;
      g.debugTickSplashPotions(40);
      return { hp0, hp1, ok1, ok2, creativeCount, hp2: g.survival.health, survivalShatter };
    });
    expect(result.ok1).toBe(true);
    const dmg = result.survivalShatter.affected.find((a) => a.kind === 'player')!.damage;
    expect(dmg).toBeGreaterThanOrEqual(5);
    expect(dmg).toBeLessThanOrEqual(6);
    expect(result.hp1).toBe(result.hp0 - dmg);
    expect(result.ok2).toBe(true);
    expect(result.creativeCount).toBe(1);
    expect(result.hp2).toBe(result.hp1);
  });

  test("a raid witch's splash potion applies its effect to the player", async ({ page }) => {
    test.setTimeout(240_000);
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const raid = g.debugStartRaid(3); // omen ≥ 3 rolls a witch into the wave
      const witches = g.getRaiderRenderState().expected.filter((e) => e.kind === 'witch').map((e) => e.entityId);
      let guard = 0;
      while (g.getSplashPotionState().witchThrows.length === 0 && guard++ < 20) g.debugTickRaid();
      const throws = g.getSplashPotionState().witchThrows;
      const inFlight = g.getSplashPotionState().potions.filter((p) => p.thrower === 'witch').length;
      g.debugTickSplashPotions(60);
      const state = g.getSplashPotionState();
      const effects: Record<string, { duration: number; amplifier: number } | null> = {};
      for (const k of ['poison', 'slowness', 'weakness']) effects[k] = g.getPlayerEffect(k);
      return { status: raid.status, witches, throws, inFlight, state, effects };
    });
    expect(result.status).toBe('ACTIVE');
    expect(result.witches.length).toBeGreaterThan(0);
    expect(result.throws.length).toBeGreaterThan(0);
    const first = result.throws[0]!;
    expect(result.witches).toContain(first.ownerId);
    expect(first.accepted).toBe(true);
    expect(result.inFlight).toBeGreaterThan(0);
    const witchShatter = result.state.shatters.find((s) => s.thrower === 'witch');
    expect(witchShatter).toBeDefined();
    const onPlayer = witchShatter!.affected.find((a) => a.kind === 'player');
    expect(onPlayer).toBeDefined();
    expect(witchShatter!.affected.every((a) => a.kind === 'player')).toBe(true);
    if (first.choice === 'harming') {
      expect(onPlayer!.damage).toBeGreaterThan(0);
    } else {
      const eff = result.effects[first.choice];
      expect(eff).not.toBeNull();
      expect(eff!.duration).toBeGreaterThan(1);
      expect(onPlayer!.effects[0]!.typeId).toBe(`minecraft:effect/${first.choice}`);
    }
  });
});
