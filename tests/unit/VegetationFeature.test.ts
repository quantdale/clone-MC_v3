import { describe, it, expect } from 'vitest';
import {
  placeFeature,
  validatePlacementModifier,
  validatePlacedFeature,
  type PlacementContext,
} from '../../src/worldgen/PlacedFeature';
import {
  createDefaultVegetationConfiguredFeatures,
  createDefaultVegetationPlacedFeatures,
  VEGETATION_BLOCK_IDS,
} from '../../src/worldgen/VegetationFeature';

/** A scripted rng serving a fixed draw sequence. */
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

function context(
  rng: { nextFloat(): number },
  surfaceY: (x: number, z: number) => number,
  isSolid: (x: number, y: number, z: number) => boolean = () => true,
  biomeKey = 'plains',
): PlacementContext {
  return { biomeKey, isSolid, surfaceY, rng };
}

describe('surfaceHeight modifier (098 extension of the 095 union)', () => {
  it('validates as a modifier and as part of a chain', () => {
    expect(validatePlacementModifier({ type: 'surfaceHeight' })).toEqual({ type: 'surfaceHeight' });
    const placed = validatePlacedFeature({
      key: 'a',
      featureKey: 'b',
      modifiers: [
        { type: 'count', tries: 2 },
        { type: 'surfaceHeight' },
        { type: 'survivalFilter' },
      ],
    });
    expect(placed.modifiers[1]).toEqual({ type: 'surfaceHeight' });
  });

  it('sets y from ctx.surfaceY with no rng draw', () => {
    const placed = validatePlacedFeature({
      key: 'a',
      featureKey: 'b',
      modifiers: [
        { type: 'count', tries: 2 },
        { type: 'surfaceHeight' },
      ],
    });
    const rng = new ScriptedRng([]);
    const surfaceY = (x: number, z: number): number => x * 10 + z;
    expect(placeFeature(placed, context(rng, surfaceY), 3, 7)).toEqual([
      [3, 37, 7],
      [3, 37, 7],
    ]);
    expect(rng.count).toBe(0);
  });

  it('probes solidity at the surface position', () => {
    const placed = validatePlacedFeature({
      key: 'a',
      featureKey: 'b',
      modifiers: [
        { type: 'surfaceHeight' },
        { type: 'survivalFilter' },
      ],
    });
    const probes: Array<[number, number, number]> = [];
    const isSolid = (x: number, y: number, z: number): boolean => {
      probes.push([x, y, z]);
      return true;
    };
    const surfaceY = (_x: number, _z: number): number => 72;
    expect(placeFeature(placed, context(new ScriptedRng([]), surfaceY, isSolid), 5, 9)).toEqual([[5, 72, 9]]);
    expect(probes).toEqual([[5, 72, 9]]);
  });

  it('runs before rarity draws in chain order', () => {
    const placed = validatePlacedFeature({
      key: 'a',
      featureKey: 'b',
      modifiers: [
        { type: 'count', tries: 3 },
        { type: 'surfaceHeight' },
        { type: 'rarity', chance: 2 },
      ],
    });
    const rng = new ScriptedRng([0.4, 0.4, 0.6]);
    const surfaceY = (_x: number, _z: number): number => 60;
    // Draws: rarity per candidate (surfaceHeight consumes none); draw 0.6 drops the third.
    expect(placeFeature(placed, context(rng, surfaceY), 1, 2)).toEqual([
      [1, 60, 2],
      [1, 60, 2],
    ]);
    expect(rng.count).toBe(3);
  });

  it('rejects survivalFilter without a preceding heightRange or surfaceHeight', () => {
    expect(() =>
      validatePlacedFeature({
        key: 'a',
        featureKey: 'b',
        modifiers: [{ type: 'survivalFilter' }],
      }),
    ).toThrow(/heightRange or surfaceHeight/i);
    expect(() =>
      validatePlacedFeature({
        key: 'a',
        featureKey: 'b',
        modifiers: [
          { type: 'biomeFilter', biomeKeys: ['plains'] },
          { type: 'survivalFilter' },
        ],
      }),
    ).toThrow(/heightRange or surfaceHeight/i);
  });
});

describe('vegetation defaults', () => {
  it('documents the reserved vegetation block ids', () => {
    expect(VEGETATION_BLOCK_IDS).toEqual({
      shortGrass: 19,
      poppy: 20,
      dandelion: 21,
      redMushroom: 22,
      brownMushroom: 23,
    });
  });

  it('registers exactly the documented configured features deterministically', () => {
    const a = createDefaultVegetationConfiguredFeatures();
    const b = createDefaultVegetationConfiguredFeatures();
    expect(a.size).toBe(5);
    expect(a.get('overworld/short_grass')).toEqual({
      key: 'overworld/short_grass',
      config: { type: 'blockPatch', blockId: 19, tries: 16, radiusXZ: 4, radiusY: 1 },
    });
    expect(a.get('overworld/poppy')).toEqual({
      key: 'overworld/poppy',
      config: { type: 'blockPatch', blockId: 20, tries: 6, radiusXZ: 3, radiusY: 1 },
    });
    expect(a.get('overworld/dandelion')).toEqual({
      key: 'overworld/dandelion',
      config: { type: 'blockPatch', blockId: 21, tries: 6, radiusXZ: 3, radiusY: 1 },
    });
    expect(a.get('overworld/red_mushroom')).toEqual({
      key: 'overworld/red_mushroom',
      config: { type: 'blockPatch', blockId: 22, tries: 3, radiusXZ: 2, radiusY: 1 },
    });
    expect(a.get('overworld/brown_mushroom')).toEqual({
      key: 'overworld/brown_mushroom',
      config: { type: 'blockPatch', blockId: 23, tries: 3, radiusXZ: 2, radiusY: 1 },
    });
    expect(a.get('overworld/short_grass')).toEqual(b.get('overworld/short_grass'));
    expect(a.get('overworld/red_mushroom')).toEqual(b.get('overworld/red_mushroom'));
  });

  it('registers exactly the documented placed features deterministically', () => {
    const a = createDefaultVegetationPlacedFeatures();
    const b = createDefaultVegetationPlacedFeatures();
    expect(a.size).toBe(5);
    expect(a.get('overworld/short_grass')).toEqual({
      key: 'overworld/short_grass',
      featureKey: 'overworld/short_grass',
      modifiers: [
        { type: 'count', tries: 8 },
        { type: 'surfaceHeight' },
        { type: 'survivalFilter' },
      ],
    });
    expect(a.get('overworld/poppy')).toEqual({
      key: 'overworld/poppy',
      featureKey: 'overworld/poppy',
      modifiers: [
        { type: 'count', tries: 2 },
        { type: 'rarity', chance: 2 },
        { type: 'surfaceHeight' },
        { type: 'survivalFilter' },
      ],
    });
    expect(a.get('overworld/dandelion')).toEqual({
      key: 'overworld/dandelion',
      featureKey: 'overworld/dandelion',
      modifiers: [
        { type: 'count', tries: 2 },
        { type: 'rarity', chance: 2 },
        { type: 'surfaceHeight' },
        { type: 'survivalFilter' },
      ],
    });
    expect(a.get('overworld/red_mushroom')).toEqual({
      key: 'overworld/red_mushroom',
      featureKey: 'overworld/red_mushroom',
      modifiers: [
        { type: 'count', tries: 1 },
        { type: 'rarity', chance: 4 },
        { type: 'surfaceHeight' },
        { type: 'survivalFilter' },
      ],
    });
    expect(a.get('overworld/brown_mushroom')).toEqual({
      key: 'overworld/brown_mushroom',
      featureKey: 'overworld/brown_mushroom',
      modifiers: [
        { type: 'count', tries: 1 },
        { type: 'rarity', chance: 4 },
        { type: 'surfaceHeight' },
        { type: 'survivalFilter' },
      ],
    });
    expect(a.get('overworld/short_grass')).toEqual(b.get('overworld/short_grass'));
    expect(a.get('overworld/poppy')).toEqual(b.get('overworld/poppy'));
  });

  it('every default placed chain validates under the extended invariants', () => {
    const registry = createDefaultVegetationPlacedFeatures();
    for (const key of ['overworld/short_grass', 'overworld/poppy', 'overworld/dandelion', 'overworld/red_mushroom', 'overworld/brown_mushroom']) {
      const placed = registry.get(key);
      expect(placed).not.toBeNull();
      expect(validatePlacedFeature(placed)).toEqual(placed);
    }
  });
});
