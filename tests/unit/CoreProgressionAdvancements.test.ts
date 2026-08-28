import { describe, it, expect } from 'vitest';
import {
  applyAdvancementTrigger,
  createAdvancementProgress,
  advancementIsComplete,
} from '../../src/simulation/AdvancementFramework';
import {
  coreProgressionAdvancements,
  finalCoreProgressionAdvancement,
  firstCoreProgressionAdvancement,
  getCoreProgressionAdvancement,
} from '../../src/simulation/CoreProgressionAdvancements';

describe('core progression catalog', () => {
  it('defines the chain in play order: survival -> Nether -> End', () => {
    const chain = coreProgressionAdvancements();
    expect(chain.length).toBe(7);
    expect(chain.map((a) => a.key)).toEqual([
      'minecraft:stone_age',
      'minecraft:acquire_hardware',
      'minecraft:iron_tools',
      'minecraft:diamonds',
      'minecraft:enter_the_nether',
      'minecraft:enter_the_end',
      'minecraft:free_the_end',
    ]);
    // The chain's arc: first is an item obtain, middle covers both dimensions, last is the dragon.
    expect(firstCoreProgressionAdvancement().criteria[0]!.type).toBe('obtain_item');
    expect(finalCoreProgressionAdvancement().criteria[0]!.type).toBe('boss_defeat');
    const dimensionKeys = chain
      .flatMap((a) => a.criteria)
      .filter((c) => c.type === 'dimension_enter')
      .map((c) => (c as { dimensionKey: string }).dimensionKey);
    expect(dimensionKeys).toContain('minecraft:the_nether');
    expect(dimensionKeys).toContain('minecraft:the_end');
  });

  it('every criterion uses only 185\'s typed criteria with non-empty payloads', () => {
    for (const a of coreProgressionAdvancements()) {
      expect(a.criteria.length).toBeGreaterThan(0);
      for (const c of a.criteria) {
        const payload = Object.values(c).filter((v) => typeof v === 'string')[1] as string | undefined;
        expect(payload).toBeDefined();
        expect(payload!.length).toBeGreaterThan(0);
      }
    }
  });

  it('looks up by key; unknown keys are undefined', () => {
    expect(getCoreProgressionAdvancement('minecraft:diamonds')?.title).toBe('Diamonds!');
    expect(getCoreProgressionAdvancement('minecraft:not_real')).toBeUndefined();
  });

  it('the dragon advancement carries the vanilla experience reward', () => {
    const freeTheEnd = getCoreProgressionAdvancement('minecraft:free_the_end')!;
    expect(freeTheEnd.reward).toEqual({ kind: 'experience', amount: 500 });
  });
});

describe('chain completes through 185\'s framework', () => {
  it('enter_the_nether completes when the dimension trigger fires', () => {
    const def = getCoreProgressionAdvancement('minecraft:enter_the_nether')!;
    let progress = createAdvancementProgress(def);
    expect(advancementIsComplete(progress)).toBe(false);
    progress = applyAdvancementTrigger(
      progress,
      def,
      { type: 'dimension_enter', dimensionKey: 'minecraft:the_nether' },
      1234,
    );
    expect(advancementIsComplete(progress)).toBe(true);
    expect(progress.achievedTick).toBe(1234);
  });

  it('free_the_end completes when the dragon-defeat trigger fires', () => {
    const def = finalCoreProgressionAdvancement();
    let progress = createAdvancementProgress(def);
    progress = applyAdvancementTrigger(
      progress,
      def,
      { type: 'boss_defeat', bossKey: 'ender_dragon' },
      9000,
    );
    expect(progress.achieved).toBe(true);
    expect(progress.achievedTick).toBe(9000);
  });

  it('a wrong-dimension trigger does not complete enter_the_nether', () => {
    const def = getCoreProgressionAdvancement('minecraft:enter_the_nether')!;
    const progress = createAdvancementProgress(def);
    const after = applyAdvancementTrigger(
      progress,
      def,
      { type: 'dimension_enter', dimensionKey: 'minecraft:the_end' },
      1,
    );
    expect(after).toBe(progress); // identity no-op
  });
});
