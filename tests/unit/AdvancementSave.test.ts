import { describe, it, expect } from 'vitest';
import {
  ADVANCEMENT_SAVE_VERSION,
  applyTriggerToProgresses,
  createDefaultAdvancementProgresses,
  deserializeAdvancementSave,
  serializeAdvancementSave,
  type AdvancementCriterion,
} from '../../src/simulation/AdvancementSave';
import { coreProgressionAdvancements } from '../../src/simulation/CoreProgressionAdvancements';

const CATALOG = coreProgressionAdvancements();
const KEYS = CATALOG.map((d) => d.key);

function validEnvelope() {
  return {
    version: 1 as const,
    advancements: createDefaultAdvancementProgresses(CATALOG).map((p) => ({
      version: 1 as const,
      advancementKey: p.advancementKey,
      achieved: p.achieved,
      achievedTick: p.achievedTick,
      criteriaAchieved: [...p.criteriaAchieved],
    })),
  };
}

describe('defaults', () => {
  it('creates one unachieved progress per catalog definition, in order', () => {
    const defaults = createDefaultAdvancementProgresses(CATALOG);
    expect(defaults.map((p) => p.advancementKey)).toEqual(KEYS);
    for (const p of defaults) {
      expect(p.achieved).toBe(false);
      expect(p.achievedTick).toBeNull();
      expect(p.criteriaAchieved).toEqual([false]);
    }
    expect(ADVANCEMENT_SAVE_VERSION).toBe(1);
  });
});

describe('round-trip', () => {
  it('serializes and restores completions field-for-field', () => {
    let store = createDefaultAdvancementProgresses(CATALOG);
    const first = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'obtain_item', itemKey: 'wooden_pickaxe' },
      42,
    );
    store = first.progresses;
    const second = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'dimension_enter', dimensionKey: 'minecraft:the_nether' },
      5000,
    );
    store = second.progresses;
    const restored = deserializeAdvancementSave(serializeAdvancementSave(store), CATALOG);
    expect(restored).toEqual(store);
    expect(restored[0]).toEqual({
      advancementKey: 'minecraft:stone_age',
      achieved: true,
      achievedTick: 42,
      criteriaAchieved: [true],
    });
    expect(restored[4]).toEqual({
      advancementKey: 'minecraft:enter_the_nether',
      achieved: true,
      achievedTick: 5000,
      criteriaAchieved: [true],
    });
  });

  it('returns catalog order regardless of payload order and defaults missing keys', () => {
    const full = validEnvelope();
    const partial = {
      version: 1 as const,
      advancements: [full.advancements[4]!, full.advancements[0]!],
    };
    const restored = deserializeAdvancementSave(partial, CATALOG);
    expect(restored.map((p) => p.advancementKey)).toEqual(KEYS);
    expect(restored[0]!.criteriaAchieved).toEqual([false]);
    expect(restored[4]!.criteriaAchieved).toEqual([false]);
    expect(restored[1]!.criteriaAchieved).toEqual([false]);
  });
});

describe('fail-closed rejection', () => {
  const cases: Array<[string, unknown]> = [
    ['null input', null],
    ['string input', 'advancements'],
    ['missing version', { advancements: [] }],
    ['wrong version', { version: 2, advancements: [] }],
    ['non-array advancements', { version: 1, advancements: {} }],
    [
      'duplicate key',
      (() => {
        const v = validEnvelope();
        return { ...v, advancements: [v.advancements[0], v.advancements[0]] };
      })(),
    ],
    [
      'unknown key',
      (() => {
        const v = validEnvelope();
        return {
          ...v,
          advancements: [
            {
              version: 1 as const,
              advancementKey: 'minecraft:not_real',
              achieved: false,
              achievedTick: null,
              criteriaAchieved: [false],
            },
          ],
        };
      })(),
    ],
    [
      'criteria length drift',
      (() => {
        const v = validEnvelope();
        const rec = { ...v.advancements[0]!, criteriaAchieved: [false, false] };
        return { ...v, advancements: [rec] };
      })(),
    ],
    [
      'achieved true with unachieved criteria',
      (() => {
        const v = validEnvelope();
        const rec = { ...v.advancements[0]!, achieved: true, achievedTick: 7 };
        return { ...v, advancements: [rec] };
      })(),
    ],
    [
      'achieved false with all criteria true',
      (() => {
        const v = validEnvelope();
        const rec = { ...v.advancements[0]!, criteriaAchieved: [true] };
        return { ...v, advancements: [rec] };
      })(),
    ],
    [
      'achieved true with null tick',
      (() => {
        const v = validEnvelope();
        const rec = {
          ...v.advancements[0]!,
          achieved: true,
          achievedTick: null,
          criteriaAchieved: [true],
        };
        return { ...v, advancements: [rec] };
      })(),
    ],
    [
      'unachieved with non-null tick',
      (() => {
        const v = validEnvelope();
        const rec = { ...v.advancements[0]!, achievedTick: 9 };
        return { ...v, advancements: [rec] };
      })(),
    ],
    [
      'nested single-record fault (empty key)',
      (() => {
        const v = validEnvelope();
        const rec = { ...v.advancements[0]!, advancementKey: '' };
        return { ...v, advancements: [rec] };
      })(),
    ],
  ];
  for (const [name, payload] of cases) {
    it(`throws on ${name} and accepts nothing`, () => {
      expect(() => deserializeAdvancementSave(payload, CATALOG)).toThrow();
      // The valid envelope still restores afterwards: rejection is stateless.
      expect(() =>
        deserializeAdvancementSave(validEnvelope(), CATALOG),
      ).not.toThrow();
    });
  }
});

describe('trigger fan-out', () => {
  const OBTAIN_WOOD: AdvancementCriterion = { type: 'obtain_item', itemKey: 'wooden_pickaxe' };

  it('completes the matching def with the tick and names it', () => {
    const store = createDefaultAdvancementProgresses(CATALOG);
    const { progresses, completedKeys } = applyTriggerToProgresses(store, CATALOG, OBTAIN_WOOD, 42);
    expect(completedKeys).toEqual(['minecraft:stone_age']);
    expect(progresses[0]).toEqual({
      advancementKey: 'minecraft:stone_age',
      achieved: true,
      achievedTick: 42,
      criteriaAchieved: [true],
    });
    expect(progresses[1]).toBe(store[1]);
  });

  it('is an identity no-op for non-matching triggers', () => {
    const store = createDefaultAdvancementProgresses(CATALOG);
    const wrong: AdvancementCriterion = { type: 'obtain_item', itemKey: 'not_a_real_item' };
    const result = applyTriggerToProgresses(store, CATALOG, wrong, 1);
    expect(result.completedKeys).toEqual([]);
    expect(result.progresses).toBe(store);
  });

  it('is an identity no-op for null triggers and never throws', () => {
    const store = createDefaultAdvancementProgresses(CATALOG);
    const result = applyTriggerToProgresses(store, CATALOG, null as unknown as AdvancementCriterion, 1);
    expect(result.completedKeys).toEqual([]);
    expect(result.progresses).toBe(store);
  });

  it('completes dimension and boss criteria and ignores kill_mob without a catalog match', () => {
    let store = createDefaultAdvancementProgresses(CATALOG);
    const nether = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'dimension_enter', dimensionKey: 'minecraft:the_nether' },
      100,
    );
    expect(nether.completedKeys).toEqual(['minecraft:enter_the_nether']);
    store = nether.progresses;
    const dragon = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'boss_defeat', bossKey: 'ender_dragon' },
      5000,
    );
    expect(dragon.completedKeys).toEqual(['minecraft:free_the_end']);
    store = dragon.progresses;
    const kill = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'kill_mob', mobKey: 'zombie' },
      5001,
    );
    expect(kill.completedKeys).toEqual([]);
    expect(kill.progresses).toBe(store);
  });

  it('never completes twice: the second trigger is identity and keeps the tick', () => {
    const store = createDefaultAdvancementProgresses(CATALOG);
    const first = applyTriggerToProgresses(store, CATALOG, OBTAIN_WOOD, 42);
    const second = applyTriggerToProgresses(first.progresses, CATALOG, OBTAIN_WOOD, 9000);
    expect(second.completedKeys).toEqual([]);
    expect(second.progresses).toBe(first.progresses);
    expect(first.progresses[0]!.achievedTick).toBe(42);
  });

  it('throws loudly on a store out of sync with the catalog', () => {
    const store = createDefaultAdvancementProgresses(CATALOG).slice(1);
    expect(() => applyTriggerToProgresses(store, CATALOG, OBTAIN_WOOD, 1)).toThrow(
      /out of sync/,
    );
  });
});
