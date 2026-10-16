import { describe, it, expect } from 'vitest';
import {
  ProgressionHarness,
  fullSurvivalChain,
  type ProgressionAction,
} from '../support/ProgressionHarness';
import { BlockId } from '../../src/world/BlockRegistry';
import { startBossFight, damageBoss, healBoss, tickBossFight } from '../../src/simulation/BossFramework';
import { ENDER_DRAGON_DEFINITION, dragonDefeated } from '../../src/simulation/EnderDragon';
import {
  markDragonDefeated,
  serializeDragonCompletion,
  deserializeDragonCompletion,
  endExitPortalSpawns,
  endExitDestination,
  endExitPortalCells,
} from '../../src/simulation/EndExitProgression';
import { endPortalIsActivated, endSpawnPosition, END_OBSIDIAN_PLATFORM_Y } from '../../src/simulation/EndPortalProgression';

const END_CHAIN: ProgressionAction[] = [
  { kind: 'buildEndPortal', eyeCount: 12 },
  { kind: 'enterEnd' },
  { kind: 'startBoss' },
  { kind: 'damageBoss', amount: 200 },
  { kind: 'finishBoss' },
];

describe('end-progression: End portal activation and entry (Stage 5)', () => {
  it('fewer than 12 eyes does not activate and entering aborts atomically', () => {
    expect(endPortalIsActivated(11)).toBe(false);
    const h = new ProgressionHarness({ worldSeed: 4 });
    expect(() =>
      h.runScript([{ kind: 'buildEndPortal', eyeCount: 11 }, { kind: 'enterEnd' }]),
    ).toThrow(/not_enough_eyes_of_ender/);
    expect(h.isStageComplete('end')).toBe(false);
    expect(h.snapshot().playerDimension).toBe('minecraft:overworld');
  });

  it('12 eyes activate and entering lands on the obsidian platform in the_end', () => {
    const h = new ProgressionHarness({ worldSeed: 4 });
    h.runScript(END_CHAIN.slice(0, 2)); // build + enter
    expect(endPortalIsActivated(12)).toBe(true);
    expect(h.snapshot().playerDimension).toBe('minecraft:the_end');
    expect(h.snapshot().playerPosition).toEqual([...endSpawnPosition()] as [number, number, number]);
    expect(h.isStageComplete('end')).toBe(true);
    const adv = (h as unknown as { advancementProgress: Map<string, { achieved: boolean }> }).advancementProgress.get('minecraft:enter_the_end')!;
    expect(adv.achieved).toBe(true);
  });
});

describe('end-progression: dragon defeat (Stage 6, part a)', () => {
  it('damage through phases to defeat leaves the boss DEFEATED', () => {
    let state = startBossFight(ENDER_DRAGON_DEFINITION); // SPAWNING, 200
    expect(state.status).toBe('SPAWNING');
    // Promote past the 100-tick spawn window.
    for (let i = 0; i < 100; i++) state = tickBossFight(state);
    expect(state.status).toBe('ACTIVE');
    const result = damageBoss(state, ENDER_DRAGON_DEFINITION, 200);
    state = result.state;
    expect(state.status).toBe('DEFEATED');
    expect(dragonDefeated(state)).toBe(true);
  });

  it('a defeated boss cannot be re-damaged or revived (no-op)', () => {
    let state = startBossFight(ENDER_DRAGON_DEFINITION);
    state = damageBoss(state, ENDER_DRAGON_DEFINITION, 200).state; // DEFEATED
    const afterDamage = damageBoss(state, ENDER_DRAGON_DEFINITION, 50).state;
    const afterHeal = healBoss(state, ENDER_DRAGON_DEFINITION, 50);
    expect(afterDamage).toEqual(state);
    expect(afterHeal).toEqual(state);
  });
});

describe('end-progression: boss completion persistence', () => {
  it('the completion record round-trips through its versioned serializer and reloads', () => {
    let state = startBossFight(ENDER_DRAGON_DEFINITION);
    state = damageBoss(state, ENDER_DRAGON_DEFINITION, 200).state;
    const record = markDragonDefeated(state, 137);
    expect(record).not.toBeNull();
    expect(record!.defeated).toBe(true);
    expect(record!.defeatedTick).toBe(137);
    const serialized = serializeDragonCompletion(record!);
    const restored = deserializeDragonCompletion(serialized);
    expect(restored.defeated).toBe(true);
    expect(restored.defeatedTick).toBe(137);
  });

  it('the full chain reaches boss-complete and survives snapshot/restore', () => {
    const h = new ProgressionHarness({ worldSeed: 4 });
    h.runScript(END_CHAIN);
    expect(h.isStageComplete('boss-complete')).toBe(true);
    const snap = h.snapshot();
    const restored = new ProgressionHarness({ worldSeed: 4 });
    restored.reset();
    restored.restore(snap);
    expect(restored.isStageComplete('boss-complete')).toBe(true);
  });
});

describe('end-progression: exit portal and final end-state (Stage 6, part b)', () => {
  it('the exit portal spawns after defeat and returns the overworld spawn', () => {
    expect(endExitPortalSpawns(true)).toBe(true);
    const worldSpawn: [number, number, number] = [8, 65, 8];
    expect(endExitDestination(worldSpawn)).toEqual(worldSpawn);
    expect(endExitDestination([NaN, 65, 8])).toBeNull();
  });

  it('the harness places the 21 exit-portal cells and achieves free_the_end with +500 XP', () => {
    const h = new ProgressionHarness({ worldSeed: 4 });
    h.runScript(END_CHAIN);
    // 21 exit-portal cells present at the platform.
    const cells = endExitPortalCells(0, END_OBSIDIAN_PLATFORM_Y, 0);
    for (const [x, y, z] of cells) {
      expect(h.world.getBlock(x, y, z)).toBe(BlockId.NetherPortal);
    }
    const adv = (h as unknown as { advancementProgress: Map<string, { achieved: boolean }> }).advancementProgress.get('minecraft:free_the_end')!;
    expect(adv.achieved).toBe(true);
    expect(h.snapshot().experience.level).toBeGreaterThan(0); // +500 XP pushed past level 0
    expect(h.isChainComplete()).toBe(false); // focused End chain omits nether/shelter etc.
    expect(h.isStageComplete('boss-complete')).toBe(true);
  });
});

describe('end-progression: end-stage determinism', () => {
  it('same-seed full run matches (isChainComplete + stateHash)', () => {
    const a = new ProgressionHarness({ worldSeed: 42 });
    const b = new ProgressionHarness({ worldSeed: 42 });
    a.runScript(fullSurvivalChain());
    b.runScript(fullSurvivalChain());
    expect(a.isChainComplete()).toBe(true);
    expect(b.isChainComplete()).toBe(true);
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('different seeds are permitted to differ (no assertion of equality)', () => {
    const a = new ProgressionHarness({ worldSeed: 1 });
    const b = new ProgressionHarness({ worldSeed: 2 });
    a.runScript(fullSurvivalChain());
    b.runScript(fullSurvivalChain());
    expect(typeof a.stateHash()).toBe('string');
    expect(typeof b.stateHash()).toBe('string');
  });
});
