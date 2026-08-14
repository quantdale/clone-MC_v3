import { describe, it, expect } from 'vitest';
import { VerticalWorldAccess } from '../../src/world/VerticalWorldAccess';
import { BlockId } from '../../src/world/BlockRegistry';
import { BlockState, createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { DimensionType, createDefaultDimensionTypeRegistry } from '../../src/data/DimensionType';
import { createResourceId } from '../../src/data/ResourceId';

const registry = createDefaultBlockStateRegistry();
const air = registry.getDefaultState(BlockId.Air);
const stone = registry.getDefaultState(BlockId.Stone);
const dirt = registry.getDefaultState(BlockId.Dirt);

const overworld = new DimensionType({
  id: createResourceId('minecraft', 'overworld'),
  minY: -64,
  height: 384,
  logicalHeight: 384,
  hasSkylight: true,
});

function makeWorld(dimension: DimensionType = overworld): VerticalWorldAccess {
  return new VerticalWorldAccess({ dimension, registry });
}

describe('VerticalWorldAccess', () => {
  it('derives minSectionY/sectionCount from the active dimension', () => {
    const w = makeWorld();
    expect(w.dimension.minSectionY).toBe(-4);
    expect(w.dimension.sectionCount).toBe(24);
    expect(w.dimension.maxY).toBe(319);
  });

  it('returns air over the full dimension range before any writes', () => {
    const w = makeWorld();
    expect(w.getBlockState(0, -64, 0).id).toBe(air.id);
    expect(w.getBlockState(0, 0, 0).id).toBe(air.id);
    expect(w.getBlockState(0, 319, 0).id).toBe(air.id);
    expect(w.size).toBe(0);
  });

  it('writes and reads at the lowest in-range Y (negative)', () => {
    const w = makeWorld();
    w.setBlockState(0, -64, 0, stone);
    expect(w.getBlockState(0, -64, 0).id).toBe(stone.id);
    expect(w.hasColumn(0, 0)).toBe(true);
  });

  it('writes and reads at the highest in-range Y', () => {
    const w = makeWorld();
    w.setBlockState(0, 319, 0, stone);
    expect(w.getBlockState(0, 319, 0).id).toBe(stone.id);
  });

  it('no-ops writes above the dimension max Y and materializes nothing', () => {
    const w = makeWorld();
    w.setBlockState(0, 320, 0, stone);
    expect(w.size).toBe(0);
    expect(w.getBlockState(0, 320, 0).id).toBe(air.id);
  });

  it('no-ops writes below the dimension min Y', () => {
    const w = makeWorld();
    w.setBlockState(0, -65, 0, stone);
    expect(w.size).toBe(0);
  });

  it('no-ops writes with non-integer coordinates', () => {
    const w = makeWorld();
    w.setBlockState(0, 0.5, 0, stone);
    w.setBlockState(0.5, 0, 0, stone);
    w.setBlockState(0, 0, 0.5, stone);
    expect(w.size).toBe(0);
  });

  it('routes across chunk boundaries to distinct columns', () => {
    const w = makeWorld();
    w.setBlockState(15, 40, 0, stone);
    w.setBlockState(16, 40, 0, dirt);
    expect(w.getBlockState(15, 40, 0).id).toBe(stone.id);
    expect(w.getBlockState(16, 40, 0).id).toBe(dirt.id);
    expect(w.size).toBe(2);
    expect(w.getColumn(0, 0)?.chunkX).toBe(0);
    expect(w.getColumn(1, 0)?.chunkX).toBe(1);
  });

  it('supports column management: ensure/remove/size', () => {
    const w = makeWorld();
    const col = w.ensureColumn(2, 3);
    expect(col.chunkX).toBe(2);
    expect(col.chunkZ).toBe(3);
    expect(w.hasColumn(2, 3)).toBe(true);
    expect(w.size).toBe(1);
    expect(w.removeColumn(2, 3)).toBe(true);
    expect(w.hasColumn(2, 3)).toBe(false);
    expect(w.size).toBe(0);
  });

  it('aggregates dirty state across columns and clears it', () => {
    const w = makeWorld();
    expect(w.isDirty).toBe(false);
    expect(w.dirtyColumns()).toEqual([]);
    w.setBlockState(0, 0, 0, stone);
    w.setBlockState(16, 0, 0, dirt);
    expect(w.isDirty).toBe(true);
    expect(w.dirtyColumns().length).toBe(2);
    w.clearDirty();
    expect(w.isDirty).toBe(false);
    expect(w.dirtyColumns()).toEqual([]);
  });

  it('round-trips negative and high Y blocks through serialize/deserialize', () => {
    const w = makeWorld();
    w.setBlockState(1, -64, 1, stone);
    w.setBlockState(2, 319, 2, dirt);
    w.setBlockState(16, 40, 0, stone);
    const data = w.serialize();
    const restored = VerticalWorldAccess.deserialize(data, registry, overworld);
    expect(restored.size).toBe(w.size);
    expect(restored.getBlockState(1, -64, 1).id).toBe(stone.id);
    expect(restored.getBlockState(2, 319, 2).id).toBe(dirt.id);
    expect(restored.getBlockState(16, 40, 0).id).toBe(stone.id);
  });

  it('rejects deserialization with a mismatched vertical layout', () => {
    const w = makeWorld();
    w.setBlockState(0, 0, 0, stone);
    const data = w.serialize();
    const nether = new DimensionType({
      id: createResourceId('minecraft', 'the_nether'),
      minY: 0,
      height: 128,
      logicalHeight: 128,
      hasSkylight: false,
    });
    expect(() => VerticalWorldAccess.deserialize(data, registry, nether)).toThrow();
  });

  it('honors nether dimensions range from the default registry', () => {
    const nether = createDefaultDimensionTypeRegistry().get(createResourceId('minecraft', 'the_nether'));
    const w = new VerticalWorldAccess({ dimension: nether, registry });
    expect(w.dimension.maxY).toBe(127);
    expect(w.dimension.sectionCount).toBe(8);
    w.setBlockState(0, 127, 0, stone);
    expect(w.getBlockState(0, 127, 0).id).toBe(stone.id);
    w.setBlockState(0, 128, 0, stone); // out of nether range
    expect(w.size).toBe(1);
  });

  it('treats invalid block states as no-op writes', () => {
    const w = makeWorld();
    // A plain object is not a BlockState instance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    w.setBlockState(0, 0, 0, { id: 5 } as any as BlockState);
    expect(w.size).toBe(0);
  });
});
