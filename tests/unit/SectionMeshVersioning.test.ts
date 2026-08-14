import { describe, it, expect } from 'vitest';
import { ChunkSection } from '../../src/world/ChunkSection';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';

const registry = createDefaultBlockStateRegistry();
const stone = registry.getDefaultState(BlockId.Stone);
const dirt = registry.getDefaultState(BlockId.Dirt);

describe('SectionMeshVersioning', () => {
  it('ChunkSection starts at meshVersion 0', () => {
    const s = new ChunkSection(0, registry);
    expect(s.meshVersion).toBe(0);
  });

  it('every mutator bumps meshVersion by exactly one', () => {
    const s = new ChunkSection(0, registry);
    s.set(0, stone); // 1
    s.setAt(1, 1, 1, dirt); // 2
    s.setStateId(2, stone.id); // 3
    s.fill(dirt); // 4
    expect(s.meshVersion).toBe(4);
  });

  it('ChunkColumn.sectionMeshVersion returns 0 for an untouched section', () => {
    const col = new ChunkColumn({ chunkX: 0, chunkZ: 0, sectionCount: 4, registry });
    expect(col.sectionMeshVersion(2)).toBe(0);
    col.setBlockState(0, 0, 0, stone); // writes sy 0
    expect(col.sectionMeshVersion(1)).toBe(0); // untouched neighbor section
    expect(col.sectionMeshVersion(0)).toBe(1); // the written one bumped to 1
  });

  it('isSectionStale detects a mutation after capture', () => {
    const col = new ChunkColumn({ chunkX: 0, chunkZ: 0, sectionCount: 4, registry });
    col.setBlockState(0, 0, 0, stone); // sy 0, version 1
    const captured = col.sectionMeshVersion(0);
    expect(col.isSectionStale(0, captured)).toBe(false);
    col.setBlockState(1, 0, 0, dirt); // mutate again, version 2
    expect(col.sectionMeshVersion(0)).toBe(2);
    expect(col.isSectionStale(0, captured)).toBe(true);
  });

  it('serialization round-trips block data but resets the runtime meshVersion', () => {
    const col = new ChunkColumn({ chunkX: 0, chunkZ: 0, sectionCount: 4, registry });
    col.setBlockState(0, 0, 0, stone);
    expect(col.sectionMeshVersion(0)).toBeGreaterThan(0);
    const restored = ChunkColumn.deserialize(col.serialize(), registry);
    expect(restored.getBlockState(0, 0, 0).id).toBe(stone.id); // data preserved
    expect(restored.sectionMeshVersion(0)).toBe(0); // version reset
  });
});
