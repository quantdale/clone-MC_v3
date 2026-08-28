import { describe, it, expect } from 'vitest';
import { CanonicalWorldStorage } from '../../src/world/CanonicalWorldStorage';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { DimensionType } from '../../src/data/DimensionType';
import { createResourceId } from '../../src/data/ResourceId';

const blockRegistry = createDefaultBlockRegistry();
const stateRegistry = createDefaultBlockStateRegistry();
const overworld = new DimensionType({
  id: createResourceId('minecraft', 'overworld'),
  minY: -64,
  height: 384,
  logicalHeight: 384,
  hasSkylight: true,
});

function makeStorage(): CanonicalWorldStorage {
  return new CanonicalWorldStorage({ dimension: overworld, blockRegistry, stateRegistry });
}

describe('CanonicalWorldStorage (253 single authority facade)', () => {
  it('exposes the active dimension bounds', () => {
    const s = makeStorage();
    expect(s.dimension.minY).toBe(-64);
    expect(s.dimension.maxY).toBe(319);
  });

  it('projects canonical block id via getBlock; setBlock writes default state', () => {
    const s = makeStorage();
    s.setBlock(0, 0, 0, BlockId.Stone);
    expect(s.getBlock(0, 0, 0)).toBe(BlockId.Stone);
    expect(s.getBlockState(0, 0, 0).blockId).toBe(BlockId.Stone);
    // Exactly one materialized column proves a single writable authority (no legacy slab dup).
    expect(s.vwa.size).toBe(1);
    expect(s.hasColumn(0, 0)).toBe(true);
  });

  it('no-ops out-of-range writes and allocates nothing', () => {
    const s = makeStorage();
    s.setBlock(0, -65, 0, BlockId.Stone);
    s.setBlock(0, 320, 0, BlockId.Stone);
    expect(s.size).toBe(0);
    expect(s.getBlock(0, -65, 0)).toBe(BlockId.Air);
  });

  it('no-ops invalid block ids', () => {
    const s = makeStorage();
    s.setBlock(0, 0, 0, 99999);
    expect(s.size).toBe(0);
  });

  it('preserves property-bearing states through the canonical path', () => {
    const s = makeStorage();
    const ps = stateRegistry.allStates().find((st) => st.assignments.length > 0);
    expect(ps).toBeDefined();
    const blockId = ps!.blockId;
    const schema = blockRegistry.getPropertySchema(blockId);
    const defaultState = stateRegistry.getDefaultState(blockId);
    // Build a RAW assignment from the canonical default state's properties.
    const raw: Record<string, boolean | number | string> = {};
    for (const [name, text] of defaultState.assignments) {
      raw[name] = schema.parse(name, text);
    }
    // Default assignment round-trips to the default state id.
    s.setBlockState(1, 10, 1, blockId, raw);
    expect(s.getBlockState(1, 10, 1).id).toBe(defaultState.id);

    // Change one property to a non-default legal raw value and verify the exact state.
    const firstProp = schema.properties[0];
    if (!firstProp) throw new Error('expected at least one property');
    const pname = firstProp.name;
    const legal = schema.legalValues(pname);
    const nonDefaultText = legal.find((t) => t !== defaultState.getProperty(pname));
    expect(nonDefaultText).toBeDefined();
    const rawNonDefault = schema.parse(pname, nonDefaultText!);
    const target = stateRegistry.lookup(blockId, { ...raw, [pname]: rawNonDefault });
    s.setBlockState(1, 11, 1, blockId, { ...raw, [pname]: rawNonDefault });
    const read = s.getBlockState(1, 11, 1);
    expect(read.id).toBe(target.id);
    expect(read.getProperty(pname)).toBe(nonDefaultText);
  });

  it('isSolid reflects the canonical block registry', () => {
    const s = makeStorage();
    s.setBlock(0, 40, 0, BlockId.Stone);
    expect(s.isSolid(0, 40, 0)).toBe(blockRegistry.isSolid(BlockId.Stone));
    expect(s.isSolid(0, -64, 0)).toBe(blockRegistry.isSolid(BlockId.Air));
  });

  it('tracks dirty columns and clears them; serialize/deserialize round-trips', () => {
    const s = makeStorage();
    expect(s.isDirty).toBe(false);
    s.setBlock(3, 3, 3, BlockId.Dirt);
    expect(s.isDirty).toBe(true);
    expect(s.dirtyColumns().length).toBe(1);
    const data = s.serialize();
    const restored = CanonicalWorldStorage.deserialize(data, overworld, blockRegistry, stateRegistry);
    expect(restored.getBlock(3, 3, 3)).toBe(BlockId.Dirt);
    restored.clearDirty();
    expect(restored.isDirty).toBe(false);
  });

  it('honors a vertical section boundary (y=15 and y=16 in adjacent sections) under one column', () => {
    const s = makeStorage();
    s.setBlock(0, 15, 0, BlockId.Stone);
    s.setBlock(0, 16, 0, BlockId.Dirt);
    expect(s.getBlock(0, 15, 0)).toBe(BlockId.Stone);
    expect(s.getBlock(0, 16, 0)).toBe(BlockId.Dirt);
    // Both heights live in a single horizontal column; one column, not two.
    expect(s.size).toBe(1);
  });
});
