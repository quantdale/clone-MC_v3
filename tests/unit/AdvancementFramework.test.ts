import { describe, it, expect } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  ADVANCEMENT_PROGRESS_VERSION,
  advancementCriteriaRemaining,
  advancementIsComplete,
  applyAdvancementTrigger,
  createAdvancementProgress,
  deserializeAdvancementProgress,
  serializeAdvancementProgress,
  type AdvancementCriterion,
  type AdvancementDefinition,
  type AdvancementProgress,
} from '../../src/simulation/AdvancementFramework';
import {
  startBossFight,
  damageBoss,
} from '../../src/simulation/BossFramework';
import { ENDER_DRAGON_DEFINITION } from '../../src/simulation/EnderDragon';
import { markDragonDefeated } from '../../src/simulation/EndExitProgression';

function def(
  key: string,
  criteria: AdvancementCriterion[],
  title = `Advancement ${key}`,
): AdvancementDefinition {
  return {
    id: createResourceId('minecraft', key),
    key,
    title,
    criteria,
    reward: { kind: 'none' },
  };
}

const DRAGON_ADVANCEMENT = def('kill_the_dragon', [
  { type: 'boss_defeat', bossKey: 'ender_dragon' },
  { type: 'dimension_enter', dimensionKey: 'minecraft:the_end' },
]);

describe('progress lifecycle', () => {
  it('starts unachieved with no criteria met', () => {
    const progress = createAdvancementProgress(DRAGON_ADVANCEMENT);
    expect(progress.achieved).toBe(false);
    expect(progress.achievedTick).toBeNull();
    expect(progress.criteriaAchieved).toEqual([false, false]);
    expect(advancementIsComplete(progress)).toBe(false);
    expect(advancementCriteriaRemaining(DRAGON_ADVANCEMENT, progress)).toBe(2);
  });

  it('marks only the matching criterion on a trigger', () => {
    let progress = createAdvancementProgress(DRAGON_ADVANCEMENT);
    progress = applyAdvancementTrigger(
      progress,
      DRAGON_ADVANCEMENT,
      { type: 'dimension_enter', dimensionKey: 'minecraft:the_end' },
      100,
    );
    expect(progress.criteriaAchieved).toEqual([false, true]);
    expect(progress.achieved).toBe(false);
    expect(advancementCriteriaRemaining(DRAGON_ADVANCEMENT, progress)).toBe(1);
  });

  it('completes exactly when the last criterion fires, recording the tick', () => {
    let progress = createAdvancementProgress(DRAGON_ADVANCEMENT);
    progress = applyAdvancementTrigger(
      progress,
      DRAGON_ADVANCEMENT,
      { type: 'dimension_enter', dimensionKey: 'minecraft:the_end' },
      100,
    );
    progress = applyAdvancementTrigger(
      progress,
      DRAGON_ADVANCEMENT,
      { type: 'boss_defeat', bossKey: 'ender_dragon' },
      5000,
    );
    expect(progress.achieved).toBe(true);
    expect(progress.achievedTick).toBe(5000);
    expect(advancementCriteriaRemaining(DRAGON_ADVANCEMENT, progress)).toBe(0);

    // An achieved advancement ignores further triggers (same object, unchanged).
    const after = applyAdvancementTrigger(
      progress,
      DRAGON_ADVANCEMENT,
      { type: 'boss_defeat', bossKey: 'ender_dragon' },
      6000,
    );
    expect(after).toBe(progress);
  });

  it('a non-matching trigger is a no-op returning the identical object', () => {
    const progress = createAdvancementProgress(DRAGON_ADVANCEMENT);
    const after = applyAdvancementTrigger(
      progress,
      DRAGON_ADVANCEMENT,
      { type: 'kill_mob', mobKey: 'zombie' },
      10,
    );
    expect(after).toBe(progress);
  });
});

describe('184 integration: boss completion drives the boss_defeat trigger', () => {
  it('a defeated dragon record completes the dragon advancement', () => {
    let boss = startBossFight(ENDER_DRAGON_DEFINITION);
    boss = damageBoss(boss, ENDER_DRAGON_DEFINITION, 200).state;
    const record = markDragonDefeated(boss, 5000);
    expect(record).not.toBeNull();

    let progress = createAdvancementProgress(DRAGON_ADVANCEMENT);
    progress = applyAdvancementTrigger(
      progress,
      DRAGON_ADVANCEMENT,
      { type: 'dimension_enter', dimensionKey: 'minecraft:the_end' },
      100,
    );
    progress = applyAdvancementTrigger(
      progress,
      DRAGON_ADVANCEMENT,
      { type: 'boss_defeat', bossKey: 'ender_dragon' },
      record!.defeatedTick,
    );
    expect(progress.achieved).toBe(true);
    expect(progress.achievedTick).toBe(5000);
  });
});

describe('persistence', () => {
  it('serializes and deserializes round-trip', () => {
    let progress: AdvancementProgress = createAdvancementProgress(DRAGON_ADVANCEMENT);
    progress = applyAdvancementTrigger(
      progress,
      DRAGON_ADVANCEMENT,
      { type: 'boss_defeat', bossKey: 'ender_dragon' },
      42,
    );
    const serialized = serializeAdvancementProgress(progress);
    expect(serialized.version).toBe(ADVANCEMENT_PROGRESS_VERSION);
    expect(deserializeAdvancementProgress(serialized)).toEqual(progress);
  });

  it('rejects malformed payloads', () => {
    expect(() => deserializeAdvancementProgress(null)).toThrow();
    expect(() => deserializeAdvancementProgress({ version: 2 })).toThrow(/unsupported version/);
    expect(() =>
      deserializeAdvancementProgress({
        version: 1,
        advancementKey: '',
        achieved: false,
        achievedTick: null,
        criteriaAchieved: [false],
      }),
    ).toThrow();
    expect(() =>
      deserializeAdvancementProgress({
        version: 1,
        advancementKey: 'x',
        achieved: 'yes',
        achievedTick: null,
        criteriaAchieved: [],
      }),
    ).toThrow();
    expect(() =>
      deserializeAdvancementProgress({
        version: 1,
        advancementKey: 'x',
        achieved: false,
        achievedTick: -3,
        criteriaAchieved: [],
      }),
    ).toThrow();
    expect(() =>
      deserializeAdvancementProgress({
        version: 1,
        advancementKey: 'x',
        achieved: false,
        achievedTick: null,
        criteriaAchieved: ['yes'],
      }),
    ).toThrow();
  });
});
