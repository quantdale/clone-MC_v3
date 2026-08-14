import { describe, it, expect } from 'vitest';
import {
  PlacedFeatureRegistry,
  placeFeature,
  validatePlacementModifier,
  validatePlacedFeature,
  type PlacementContext,
  type PlacementModifier,
} from '../../src/worldgen/PlacedFeature';
import { SeedRng } from '../../src/simulation/SeedRng';

/** A scripted rng that serves a fixed draw sequence and records every draw. */
class ScriptedRng {
  private readonly draws: number[];
  readonly seen: number[] = [];

  constructor(draws: number[]) {
    this.draws = draws;
  }

  nextFloat(): number {
    if (this.seen.length >= this.draws.length) {
      throw new Error(`ScriptedRng: exhausted after ${this.seen.length} draws`);
    }
    const d = this.draws[this.seen.length]!;
    this.seen.push(d);
    return d;
  }

  get count(): number {
    return this.seen.length;
  }
}

function context(rng: { nextFloat(): number }, biomeKey = 'plains', isSolid: (x: number, y: number, z: number) => boolean = () => true): PlacementContext {
  return { biomeKey, isSolid, rng };
}

describe('validatePlacementModifier', () => {
  it('accepts every documented modifier shape', () => {
    const modifiers: PlacementModifier[] = [
      { type: 'count', tries: 3 },
      { type: 'rarity', chance: 2 },
      { type: 'heightRange', minY: -64, maxY: -32 },
      { type: 'biomeFilter', biomeKeys: ['plains', 'desert'] },
      { type: 'survivalFilter' },
    ];
    for (const m of modifiers) {
      expect(validatePlacementModifier(m)).toEqual(m);
    }
  });

  it('rejects unknown types and malformed fields naming the field', () => {
    expect(() => validatePlacementModifier({ type: 'moon' })).toThrow(/unknown modifier type/i);
    expect(() => validatePlacementModifier({ type: 'count' })).toThrow(/tries/i);
    expect(() => validatePlacementModifier({ type: 'count', tries: 0 })).toThrow(/tries/i);
    expect(() => validatePlacementModifier({ type: 'count', tries: -3 })).toThrow(/tries/i);
    expect(() => validatePlacementModifier({ type: 'count', tries: 2.5 })).toThrow(/tries/i);
    expect(() => validatePlacementModifier({ type: 'rarity', chance: 0 })).toThrow(/chance/i);
    expect(() => validatePlacementModifier({ type: 'rarity', chance: -2 })).toThrow(/chance/i);
    expect(() => validatePlacementModifier({ type: 'rarity', chance: 1.5 })).toThrow(/chance/i);
    expect(() => validatePlacementModifier({ type: 'heightRange', minY: 1.5, maxY: 2 })).toThrow(/minY/i);
    expect(() => validatePlacementModifier({ type: 'heightRange', minY: 0, maxY: 'x' })).toThrow(/maxY/i);
    expect(() => validatePlacementModifier({ type: 'heightRange', minY: 0, maxY: -1 })).toThrow(/maxY/i);
    expect(() => validatePlacementModifier({ type: 'biomeFilter' })).toThrow(/biomeKeys/i);
    expect(() => validatePlacementModifier({ type: 'biomeFilter', biomeKeys: [] })).toThrow(/biomeKeys/i);
    expect(() => validatePlacementModifier({ type: 'biomeFilter', biomeKeys: [''] })).toThrow(/biomeKeys/i);
    expect(() => validatePlacementModifier({ type: 'biomeFilter', biomeKeys: ['plains', 3] })).toThrow(/biomeKeys/i);
    expect(() => validatePlacementModifier(null)).toThrow(/object/i);
  });
});

describe('validatePlacedFeature', () => {
  const validModifiers: PlacementModifier[] = [
    { type: 'count', tries: 2 },
    { type: 'rarity', chance: 3 },
    { type: 'heightRange', minY: -32, maxY: 16 },
    { type: 'biomeFilter', biomeKeys: ['plains'] },
    { type: 'survivalFilter' },
  ];

  it('accepts a keyed feature with a valid chain', () => {
    const feature = { key: 'overworld/trees', featureKey: 'overworld/oak_tree', modifiers: validModifiers };
    expect(validatePlacedFeature(feature)).toEqual(feature);
  });

  it('accepts a chain with biomeFilter before heightRange and survivalFilter', () => {
    const feature = {
      key: 'a',
      featureKey: 'b',
      modifiers: [
        { type: 'biomeFilter', biomeKeys: ['plains'] },
        { type: 'heightRange', minY: 0, maxY: 4 },
        { type: 'survivalFilter' },
      ],
    };
    expect(validatePlacedFeature(feature)).toEqual(feature);
  });

  it('rejects bad keys and non-array modifiers', () => {
    expect(() => validatePlacedFeature({ key: '', featureKey: 'b', modifiers: [] })).toThrow(/key/i);
    expect(() => validatePlacedFeature({ key: 'a', featureKey: '', modifiers: [] })).toThrow(/featureKey/i);
    expect(() => validatePlacedFeature({ key: 'a', featureKey: 'b', modifiers: 'x' })).toThrow(/modifiers/i);
    expect(() => validatePlacedFeature(null)).toThrow(/object/i);
  });

  it('rejects two count modifiers and survivalFilter without a preceding heightRange', () => {
    const base = { key: 'a', featureKey: 'b' };
    expect(() =>
      validatePlacedFeature({
        ...base,
        modifiers: [
          { type: 'count', tries: 2 },
          { type: 'count', tries: 3 },
        ],
      }),
    ).toThrow(/count/i);
    expect(() => validatePlacedFeature({ ...base, modifiers: [{ type: 'survivalFilter' }] })).toThrow(/heightRange/i);
    expect(() =>
      validatePlacedFeature({
        ...base,
        modifiers: [
          { type: 'biomeFilter', biomeKeys: ['plains'] },
          { type: 'survivalFilter' },
        ],
      }),
    ).toThrow(/heightRange/i);
  });
});

describe('placeFeature', () => {
  it('returns the column at y = 0 for an empty chain', () => {
    const placed = validatePlacedFeature({ key: 'a', featureKey: 'b', modifiers: [] });
    expect(placeFeature(placed, context(new ScriptedRng([])), 5, 7)).toEqual([[5, 0, 7]]);
  });

  it('expands count candidates and samples heights uniformly inside the range', () => {
    const placed = validatePlacedFeature({
      key: 'a',
      featureKey: 'b',
      modifiers: [
        { type: 'count', tries: 3 },
        { type: 'heightRange', minY: 10, maxY: 12 },
      ],
    });
    const rng = new ScriptedRng([0, 0.5, 0.999]);
    expect(placeFeature(placed, context(rng), 5, 7)).toEqual([
      [5, 10, 7],
      [5, 11, 7],
      [5, 12, 7],
    ]);
    expect(rng.count).toBe(3);
  });

  it('samples the inclusive height range bounds', () => {
    const placed = validatePlacedFeature({
      key: 'a',
      featureKey: 'b',
      modifiers: [{ type: 'heightRange', minY: -64, maxY: -32 }],
    });
    expect(placeFeature(placed, context(new ScriptedRng([0])), 0, 0)).toEqual([[0, -64, 0]]);
    expect(placeFeature(placed, context(new ScriptedRng([0.9999])), 0, 0)).toEqual([[0, -32, 0]]);
  });

  it('keeps rarity candidates with probability 1/chance', () => {
    const placed = validatePlacedFeature({
      key: 'a',
      featureKey: 'b',
      modifiers: [{ type: 'rarity', chance: 2 }],
    });
    expect(placeFeature(placed, context(new ScriptedRng([0.4])), 1, 2)).toEqual([[1, 0, 2]]);
    expect(placeFeature(placed, context(new ScriptedRng([0.5])), 1, 2)).toEqual([]);
  });

  it('rarity chance 1 always keeps the candidate but still consumes a draw', () => {
    const placed = validatePlacedFeature({
      key: 'a',
      featureKey: 'b',
      modifiers: [{ type: 'rarity', chance: 1 }],
    });
    const rng = new ScriptedRng([0.9999]);
    expect(placeFeature(placed, context(rng), 3, 4)).toEqual([[3, 0, 4]]);
    expect(rng.count).toBe(1);
  });

  it('filters by biome key', () => {
    const placed = validatePlacedFeature({
      key: 'a',
      featureKey: 'b',
      modifiers: [{ type: 'biomeFilter', biomeKeys: ['plains'] }],
    });
    expect(placeFeature(placed, context(new ScriptedRng([]), 'plains'), 0, 0)).toEqual([[0, 0, 0]]);
    expect(placeFeature(placed, context(new ScriptedRng([]), 'desert'), 0, 0)).toEqual([]);
  });

  it('keeps only solid positions and probes the exact placed coordinates', () => {
    const placed = validatePlacedFeature({
      key: 'a',
      featureKey: 'b',
      modifiers: [
        { type: 'heightRange', minY: 0, maxY: 0 },
        { type: 'survivalFilter' },
      ],
    });
    const probes: Array<[number, number, number]> = [];
    const isSolid = (x: number, y: number, z: number): boolean => {
      probes.push([x, y, z]);
      return true;
    };
    expect(placeFeature(placed, context(new ScriptedRng([0]), 'plains', isSolid), 5, 7)).toEqual([[5, 0, 7]]);
    expect(probes).toEqual([[5, 0, 7]]);
    const rng = new ScriptedRng([0]);
    expect(placeFeature(placed, context(rng, 'plains', () => false), 5, 7)).toEqual([]);
    expect(rng.count).toBe(1);
  });

  it('applies a full chain in data order with exactly one draw per rarity/height candidate', () => {
    const placed = validatePlacedFeature({
      key: 'a',
      featureKey: 'b',
      modifiers: [
        { type: 'count', tries: 2 },
        { type: 'rarity', chance: 1 },
        { type: 'heightRange', minY: 0, maxY: 0 },
        { type: 'biomeFilter', biomeKeys: ['plains'] },
        { type: 'survivalFilter' },
      ],
    });
    const rng = new ScriptedRng([0.5, 0.1, 0.0, 0.999]);
    expect(placeFeature(placed, context(rng, 'plains'), 8, 9)).toEqual([
      [8, 0, 9],
      [8, 0, 9],
    ]);
    expect(rng.count).toBe(4);
  });

  it('is deterministic for an identical feature, context and seed', () => {
    const placed = validatePlacedFeature({
      key: 'a',
      featureKey: 'b',
      modifiers: [
        { type: 'count', tries: 4 },
        { type: 'rarity', chance: 3 },
        { type: 'heightRange', minY: -32, maxY: 16 },
        { type: 'biomeFilter', biomeKeys: ['plains'] },
        { type: 'survivalFilter' },
      ],
    });
    const run = (): Array<[number, number, number]> =>
      placeFeature(placed, context(new SeedRng(12345), 'plains', () => true), 10, 20);
    const first = run();
    const second = run();
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
    for (const [, y] of first) {
      expect(y).toBeGreaterThanOrEqual(-32);
      expect(y).toBeLessThanOrEqual(16);
    }
  });
});

describe('PlacedFeatureRegistry', () => {
  const modifiers: PlacementModifier[] = [
    { type: 'count', tries: 2 },
    { type: 'rarity', chance: 3 },
    { type: 'heightRange', minY: -64, maxY: -32 },
    { type: 'biomeFilter', biomeKeys: ['plains'] },
    { type: 'survivalFilter' },
  ];

  it('registers, gets, checks, sizes, and clears', () => {
    const registry = new PlacedFeatureRegistry();
    registry.register('overworld/dirt_patch', 'overworld/dirt_patch', modifiers);
    expect(registry.get('overworld/dirt_patch')).toEqual({
      key: 'overworld/dirt_patch',
      featureKey: 'overworld/dirt_patch',
      modifiers,
    });
    expect(registry.has('overworld/dirt_patch')).toBe(true);
    expect(registry.has('missing')).toBe(false);
    expect(registry.size).toBe(1);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.get('overworld/dirt_patch')).toBeNull();
  });

  it('rejects duplicates and invalid placed features atomically', () => {
    const registry = new PlacedFeatureRegistry();
    registry.register('a', 'b', [{ type: 'count', tries: 1 }]);

    expect(() => registry.register('a', 'b', modifiers)).toThrow(/duplicate/i);
    expect(() =>
      registry.register('c', 'd', [
        { type: 'count', tries: 1 },
        { type: 'count', tries: 2 },
      ]),
    ).toThrow(/count/i);
    expect(() => registry.register('c', '', [{ type: 'count', tries: 1 }])).toThrow(/featureKey/i);
    expect(registry.size).toBe(1);
    expect(registry.has('c')).toBe(false);
  });
});
