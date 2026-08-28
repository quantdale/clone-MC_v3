import { describe, it, expect } from 'vitest';
import { validateConfiguredFeatureConfig, type ConfiguredFeatureConfig } from '../../src/worldgen/ConfiguredFeature';
import {
  buildTreeBlocks,
  createDefaultTreeConfiguredFeatures,
  type TreeFoliageConfig,
  type TreeTrunkConfig,
} from '../../src/worldgen/TreeFeature';

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

const validTree: ConfiguredFeatureConfig = {
  type: 'tree',
  trunk: { blockId: 7, minHeight: 4, maxHeight: 5 },
  foliage: { blockId: 8, shape: 'round', radius: 2 },
};

describe('tree config validation (094 union extension)', () => {
  it('accepts valid tree configs for every shape', () => {
    const shapes: Array<'round' | 'flatTop' | 'spruce'> = ['round', 'flatTop', 'spruce'];
    for (const shape of shapes) {
      const config: ConfiguredFeatureConfig = { type: 'tree', trunk: { blockId: 7, minHeight: 1, maxHeight: 1 }, foliage: { blockId: 8, shape, radius: 1 } };
      expect(validateConfiguredFeatureConfig(config)).toEqual(config);
    }
    expect(validateConfiguredFeatureConfig(validTree)).toEqual(validTree);
  });

  it('accepts a fixed height via minHeight == maxHeight', () => {
    const fixed: ConfiguredFeatureConfig = { type: 'tree', trunk: { blockId: 7, minHeight: 5, maxHeight: 5 }, foliage: { blockId: 8, shape: 'spruce', radius: 1 } };
    expect(validateConfiguredFeatureConfig(fixed)).toEqual(fixed);
  });

  it('rejects malformed tree configs naming the field', () => {
    expect(() => validateConfiguredFeatureConfig({ type: 'tree', foliage: { blockId: 8, shape: 'round', radius: 2 } })).toThrow(/trunk/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'tree', trunk: { blockId: 7, minHeight: 4, maxHeight: 5 } })).toThrow(/foliage/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'tree', trunk: { blockId: -1, minHeight: 4, maxHeight: 5 }, foliage: { blockId: 8, shape: 'round', radius: 2 } })).toThrow(/trunk\.blockId/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'tree', trunk: { blockId: 7, minHeight: 0, maxHeight: 5 }, foliage: { blockId: 8, shape: 'round', radius: 2 } })).toThrow(/minHeight/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'tree', trunk: { blockId: 7, minHeight: 4, maxHeight: 0 }, foliage: { blockId: 8, shape: 'round', radius: 2 } })).toThrow(/maxHeight/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'tree', trunk: { blockId: 7, minHeight: 5, maxHeight: 4 }, foliage: { blockId: 8, shape: 'round', radius: 2 } })).toThrow(/maxHeight/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'tree', trunk: { blockId: 7, minHeight: 1.5, maxHeight: 5 }, foliage: { blockId: 8, shape: 'round', radius: 2 } })).toThrow(/minHeight/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'tree', trunk: { blockId: 7, minHeight: 4, maxHeight: 5 }, foliage: { blockId: -1, shape: 'round', radius: 2 } })).toThrow(/foliage\.blockId/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'tree', trunk: { blockId: 7, minHeight: 4, maxHeight: 5 }, foliage: { blockId: 8, shape: 'cube', radius: 2 } })).toThrow(/shape/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'tree', trunk: { blockId: 7, minHeight: 4, maxHeight: 5 }, foliage: { blockId: 8, shape: 'round', radius: 0 } })).toThrow(/radius/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'tree', trunk: { blockId: 7, minHeight: 4, maxHeight: 5 }, foliage: { blockId: 8, shape: 'round', radius: -1 } })).toThrow(/radius/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'tree', trunk: { blockId: 7, minHeight: 4, maxHeight: 5 }, foliage: { blockId: 8, shape: 'round', radius: 1.5 } })).toThrow(/radius/i);
  });
});

describe('buildTreeBlocks', () => {
  const trunk: TreeTrunkConfig = { blockId: 7, minHeight: 1, maxHeight: 1 };
  const foliage: TreeFoliageConfig = { blockId: 8, shape: 'flatTop', radius: 1 };

  it('builds a flatTop radius-1 tree exactly (1 trunk + 3x3x3 foliage)', () => {
    const blocks = buildTreeBlocks({ trunk, foliage }, new ScriptedRng([0.5]));
    expect(blocks.length).toBe(28);
    // Trunk block first.
    expect(blocks[0]).toEqual({ kind: 'trunk', dx: 0, dy: 1, dz: 0, blockId: 7 });
    expect(blocks.slice(0, 1).every((b) => b.kind === 'trunk')).toBe(true);
    // 27 foliage blocks across three full 3x3 layers above the trunk top.
    expect(blocks.slice(1).every((b) => b.kind === 'foliage' && b.blockId === 8)).toBe(true);
    const layers = new Map<number, number>();
    for (const b of blocks.slice(1)) {
      layers.set(b.dy, (layers.get(b.dy) ?? 0) + 1);
    }
    expect([...layers.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [2, 9],
      [3, 9],
      [4, 9],
    ]);
  });

  it('builds a round radius-2 tree matching the default oak canopy (5x5, 5x5, 3x3)', () => {
    const oak = createDefaultTreeConfiguredFeatures().get('overworld/oak_tree')!;
    if (oak.config.type !== 'tree') {
      throw new Error('expected tree config');
    }
    // draw 0 -> height = 4 + floor(0 * 2) = 4.
    const blocks = buildTreeBlocks(oak.config, new ScriptedRng([0]));
    expect(blocks.filter((b) => b.kind === 'trunk').length).toBe(4);
    const foliageBlocks = blocks.filter((b) => b.kind === 'foliage');
    expect(foliageBlocks.length).toBe(59); // 25 + 25 + 9
    const layers = new Map<number, number>();
    for (const b of foliageBlocks) {
      layers.set(b.dy, (layers.get(b.dy) ?? 0) + 1);
    }
    expect([...layers.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [5, 25],
      [6, 25],
      [7, 9],
    ]);
    // Order: trunk first, then foliage layers in order; within a layer dx then dz ascending.
    expect(blocks[4]).toEqual({ kind: 'foliage', dx: -2, dy: 5, dz: -2, blockId: 8 });
    expect(blocks[blocks.length - 1]).toEqual({ kind: 'foliage', dx: 1, dy: 7, dz: 1, blockId: 8 });
  });

  it('builds a spruce radius-2 cone (25 + 9 + 1 foliage)', () => {
    const config = { trunk: { blockId: 7, minHeight: 5, maxHeight: 5 }, foliage: { blockId: 8, shape: 'spruce' as const, radius: 2 } };
    const blocks = buildTreeBlocks(config, new ScriptedRng([0.999]));
    expect(blocks.filter((b) => b.kind === 'trunk').length).toBe(5);
    const foliageBlocks = blocks.filter((b) => b.kind === 'foliage');
    expect(foliageBlocks.length).toBe(35); // 25 + 9 + 1
    const layers = new Map<number, number>();
    for (const b of foliageBlocks) {
      layers.set(b.dy, (layers.get(b.dy) ?? 0) + 1);
    }
    expect([...layers.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [6, 25],
      [7, 9],
      [8, 1],
    ]);
  });

  it('samples the trunk height uniformly over [minHeight, maxHeight]', () => {
    const config: { trunk: TreeTrunkConfig; foliage: TreeFoliageConfig } = { trunk: { blockId: 7, minHeight: 3, maxHeight: 5 }, foliage: { blockId: 8, shape: 'flatTop', radius: 1 } };
    expect(buildTreeBlocks(config, new ScriptedRng([0])).filter((b) => b.kind === 'trunk').length).toBe(3);
    expect(buildTreeBlocks(config, new ScriptedRng([0.5])).filter((b) => b.kind === 'trunk').length).toBe(4);
    expect(buildTreeBlocks(config, new ScriptedRng([0.999])).filter((b) => b.kind === 'trunk').length).toBe(5);
  });

  it('consumes exactly one rng draw per tree', () => {
    const rng = new ScriptedRng([0.5]);
    buildTreeBlocks({ trunk, foliage }, rng);
    expect(rng.count).toBe(1);
  });

  it('is deterministic for an identical config and rng', () => {
    const a = buildTreeBlocks({ trunk, foliage }, new ScriptedRng([0.5]));
    const b = buildTreeBlocks({ trunk, foliage }, new ScriptedRng([0.5]));
    expect(b).toEqual(a);
  });
});

describe('createDefaultTreeConfiguredFeatures', () => {
  it('registers exactly the documented default oak deterministically', () => {
    const a = createDefaultTreeConfiguredFeatures();
    const b = createDefaultTreeConfiguredFeatures();
    expect(a.size).toBe(1);
    expect(a.get('overworld/oak_tree')).toEqual({
      key: 'overworld/oak_tree',
      config: { type: 'tree', trunk: { blockId: 7, minHeight: 4, maxHeight: 5 }, foliage: { blockId: 8, shape: 'round', radius: 2 } },
    });
    expect(a.get('overworld/oak_tree')).toEqual(b.get('overworld/oak_tree'));
  });
});
