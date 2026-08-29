import { describe, it, expect } from 'vitest';
import { VerticalWorldAccess } from '../../src/world/VerticalWorldAccess';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { DimensionType } from '../../src/data/DimensionType';
import { createResourceId } from '../../src/data/ResourceId';

const registry = createDefaultBlockStateRegistry();
const stone = registry.getDefaultState(BlockId.Stone);

const overworld = new DimensionType({
  id: createResourceId('minecraft', 'overworld'),
  minY: -64,
  height: 384,
  logicalHeight: 384,
  hasSkylight: true,
});

function makeWorld(): VerticalWorldAccess {
  return new VerticalWorldAccess({ dimension: overworld, registry });
}

function dirtySet(w: VerticalWorldAccess, cx: number, cz: number): Set<number> {
  const col = w.getColumn(cx, cz);
  return new Set(col ? col.dirtySectionIndices() : []);
}

function meshDirtySet(w: VerticalWorldAccess, cx: number, cz: number): Set<number> {
  const col = w.getColumn(cx, cz);
  return new Set(col ? col.meshDirtySectionIndices() : []);
}

describe('VerticalNeighborDirtying', () => {
  it('ChunkColumn.markSectionDirty flags an in-range section without allocating', () => {
    const col = new ChunkColumn({ chunkX: 0, chunkZ: 0, sectionCount: 4, registry });
    col.markSectionDirty(2);
    expect(col.isDirty).toBe(true);
    expect([...col.dirtySectionIndices()].sort((a, b) => a - b)).toEqual([2]);
  });

  it('ChunkColumn.markSectionDirty ignores out-of-range indices', () => {
    const col = new ChunkColumn({ chunkX: 0, chunkZ: 0, sectionCount: 4, registry });
    col.markSectionDirty(99);
    col.markSectionDirty(-1);
    expect(col.isDirty).toBe(false);
    expect(col.dirtySectionIndices()).toEqual([]);
  });

  it('propagates to the left horizontal neighbor on a localX == 0 boundary', () => {
    const w = makeWorld();
    w.ensureColumn(0, 0);
    w.ensureColumn(-1, 0);
    w.ensureColumn(1, 0);
    w.setBlockState(0, 0, 8, stone); // localX 0, localY 0 -> sy 4
    expect(dirtySet(w, 0, 0)).toEqual(new Set([4])); // persistence owns the written section only
    expect(meshDirtySet(w, 0, 0)).toEqual(new Set([3, 4])); // render target + vertical-down
    expect(meshDirtySet(w, -1, 0)).toEqual(new Set([4])); // left render neighbor
    expect(dirtySet(w, -1, 0)).toEqual(new Set()); // render-only neighbor is not persisted
    expect(meshDirtySet(w, 1, 0)).toEqual(new Set()); // right must stay clean
  });

  it('propagates to the right horizontal neighbor on a localX == 15 boundary', () => {
    const w = makeWorld();
    w.ensureColumn(0, 0);
    w.ensureColumn(1, 0);
    w.setBlockState(15, 0, 8, stone); // localX 15
    expect(dirtySet(w, 1, 0)).toEqual(new Set());
    expect(meshDirtySet(w, 1, 0)).toEqual(new Set([4])); // right render neighbor only
    expect(dirtySet(w, 0, 0)).toEqual(new Set([4]));
    expect(meshDirtySet(w, 0, 0)).toEqual(new Set([3, 4])); // target + vertical-down
  });

  it('propagates to the vertical-up neighbor on a localY == 15 boundary', () => {
    const w = makeWorld();
    w.ensureColumn(0, 0);
    w.setBlockState(8, 15, 8, stone); // localY 15 -> sy 4, neighbor sy 5
    expect(dirtySet(w, 0, 0)).toEqual(new Set([4]));
    expect(meshDirtySet(w, 0, 0)).toEqual(new Set([4, 5])); // target + vertical-up render dependency
  });

  it('propagates to the vertical-down neighbor on a localY == 0 boundary', () => {
    const w = makeWorld();
    w.ensureColumn(0, 0);
    w.setBlockState(8, 0, 8, stone); // localY 0 -> sy 4, neighbor sy 3
    expect(dirtySet(w, 0, 0)).toEqual(new Set([4]));
    expect(meshDirtySet(w, 0, 0)).toEqual(new Set([3, 4])); // target + vertical-down render dependency
  });

  it('leaves all neighbors clean on an interior write', () => {
    const w = makeWorld();
    w.ensureColumn(0, 0);
    w.ensureColumn(-1, 0);
    w.ensureColumn(1, 0);
    w.ensureColumn(0, -1);
    w.ensureColumn(0, 1);
    w.setBlockState(8, 8, 8, stone); // interior localX/localY/localZ
    expect(dirtySet(w, 0, 0)).toEqual(new Set([4])); // only the written section
    expect(dirtySet(w, -1, 0)).toEqual(new Set());
    expect(dirtySet(w, 1, 0)).toEqual(new Set());
    expect(dirtySet(w, 0, -1)).toEqual(new Set());
    expect(dirtySet(w, 0, 1)).toEqual(new Set());
  });

  it('never materializes an absent horizontal neighbor column', () => {
    const w = makeWorld();
    w.setBlockState(0, 0, 8, stone); // only (0,0) exists/written
    expect(w.size).toBe(1);
    expect(w.getColumn(-1, 0)).toBeUndefined();
  });

  it('no-ops the out-of-range vertical neighbor at the top of the world', () => {
    const w = makeWorld();
    w.ensureColumn(0, 0);
    w.setBlockState(8, 319, 8, stone); // top section sy 23, localY 15 -> sy+1 out of range
    expect(dirtySet(w, 0, 0)).toEqual(new Set([23])); // written section only
  });

  it('keeps the written section dirty after a boundary write', () => {
    const w = makeWorld();
    w.ensureColumn(0, 0);
    w.ensureColumn(-1, 0);
    w.setBlockState(0, 0, 8, stone);
    expect(dirtySet(w, 0, 0).has(4)).toBe(true); // written section 4 is dirty
  });
});
