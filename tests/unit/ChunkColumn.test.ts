import { describe, it, expect } from 'vitest';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';

const registry = createDefaultBlockStateRegistry();
const air = registry.getDefaultState(BlockId.Air);
const stone = registry.getDefaultState(BlockId.Stone);
const dirt = registry.getDefaultState(BlockId.Dirt);

const baseOpts = (overrides: Partial<Parameters<typeof makeColumn>[0]> = {}) => ({
  chunkX: 2,
  chunkZ: 3,
  sectionCount: 4,
  registry,
  ...overrides,
});

function makeColumn(overrides: Partial<{ chunkX: number; chunkZ: number; sectionCount: number }> = {}) {
  return new ChunkColumn({ ...baseOpts(overrides) });
}

describe('ChunkColumn', () => {
  it('returns air for untouched coords and is not dirty', () => {
    const c = makeColumn();
    expect(c.getBlockState(5, 0, 5).id).toBe(air.id);
    expect(c.getBlockState(15, 63, 0).id).toBe(air.id); // top section, top local y
    expect(c.isDirty).toBe(false);
  });

  it('routes get/set across multiple vertical sections', () => {
    const c = makeColumn();
    c.setBlockState(1, 0, 1, stone); // section 0, local y 0
    c.setBlockState(2, 20, 2, dirt); // section 1, local y 4
    c.setBlockState(3, 60, 3, stone); // section 3, local y 12

    expect(c.getBlockState(1, 0, 1).id).toBe(stone.id);
    expect(c.getBlockState(2, 20, 2).id).toBe(dirt.id);
    expect(c.getBlockState(3, 60, 3).id).toBe(stone.id);
    // unchanged slot in a touched section stays air
    expect(c.getBlockState(0, 20, 0).id).toBe(air.id);
  });

  it('throws for out-of-range world Y', () => {
    const c = makeColumn();
    expect(() => c.getBlockState(0, -1, 0)).toThrow(RangeError);
    expect(() => c.setBlockState(0, 64, 0, stone)).toThrow(RangeError); // section 4 >= count 4
  });

  it('tracks dirty sections and clears them', () => {
    const c = makeColumn();
    c.setBlockState(1, 0, 1, stone); // section 0
    c.setBlockState(2, 20, 2, dirt); // section 1
    expect(c.isDirty).toBe(true);
    expect([...c.dirtySectionIndices()].sort((a, b) => a - b)).toEqual([0, 1]);
    c.clearDirty();
    expect(c.isDirty).toBe(false);
    expect(c.dirtySectionIndices()).toEqual([]);
  });

  it('serializes and deserializes an identical column', () => {
    const c = makeColumn();
    c.setBlockState(0, 0, 0, stone);
    c.setBlockState(5, 20, 5, dirt);
    c.setBlockState(10, 60, 10, stone);
    const data = c.serialize();
    const restored = ChunkColumn.deserialize(data, registry);

    expect(restored.chunkX).toBe(2);
    expect(restored.chunkZ).toBe(3);
    expect(restored.getBlockState(0, 0, 0).id).toBe(stone.id);
    expect(restored.getBlockState(5, 20, 5).id).toBe(dirt.id);
    expect(restored.getBlockState(10, 60, 10).id).toBe(stone.id);
    expect(restored.getBlockState(1, 0, 1).id).toBe(air.id);
  });

  it('rejects an unsupported serialization version', () => {
    const c = makeColumn();
    const data = c.serialize();
    expect(() => ChunkColumn.deserialize({ ...data, version: 999 }, registry)).toThrow();
  });

  it('keeps untouched sections as air after deserialize', () => {
    const c = makeColumn();
    c.setBlockState(0, 0, 0, stone);
    const restored = ChunkColumn.deserialize(c.serialize(), registry);
    // never-written section 3 must still read as air
    expect(restored.getBlockState(7, 60, 7).id).toBe(air.id);
  });
});
