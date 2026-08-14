import { describe, it, expect } from 'vitest';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import {
  createDefaultBlockStateRegistry,
} from '../../src/world/BlockStateRegistry';

const registry = createDefaultBlockStateRegistry();
const blockRegistry = createDefaultBlockRegistry();

const air = registry.getDefaultState(BlockId.Air);
const stone = registry.getDefaultState(BlockId.Stone);
const dirt = registry.getDefaultState(BlockId.Dirt);
const water = registry.getDefaultState(BlockId.Water);

function makeColumn(
  overrides: Partial<{ sectionCount: number; minSectionY: number; withBlockRegistry: boolean }> = {},
): ChunkColumn {
  return new ChunkColumn({
    chunkX: 2,
    chunkZ: 3,
    sectionCount: overrides.sectionCount ?? 4,
    minSectionY: overrides.minSectionY ?? 0,
    registry,
    airId: air.id,
    blockRegistry: overrides.withBlockRegistry === false ? undefined : blockRegistry,
  });
}

// With default options (minSectionY=0, sectionCount=4): minY=0, maxY=63, sentinel=-1.

describe('ChunkColumn heightmap primitives', () => {
  it('declares the covered Y span', () => {
    const c = makeColumn();
    expect(c.minY).toBe(0);
    expect(c.maxY).toBe(63);
  });

  it('reports the sentinel for an untouched column', () => {
    const c = makeColumn();
    expect(c.getSurfaceHeight(0, 0)).toBe(-1);
    expect(c.getMotionBlockingHeight(0, 0)).toBe(-1);
  });

  it('sets both heights on a single write', () => {
    const c = makeColumn();
    c.setBlockState(5, 10, 5, stone);
    expect(c.getSurfaceHeight(5, 5)).toBe(10);
    expect(c.getMotionBlockingHeight(5, 5)).toBe(10);
  });

  it('raises the top when a higher block is placed', () => {
    const c = makeColumn();
    c.setBlockState(5, 10, 5, stone);
    c.setBlockState(5, 20, 5, dirt);
    expect(c.getSurfaceHeight(5, 5)).toBe(20);
    expect(c.getMotionBlockingHeight(5, 5)).toBe(20);
  });

  it('leaves the top unchanged when a lower block is placed', () => {
    const c = makeColumn();
    c.setBlockState(5, 20, 5, stone);
    c.setBlockState(5, 5, 5, dirt); // below the top
    expect(c.getSurfaceHeight(5, 5)).toBe(20);
    expect(c.getMotionBlockingHeight(5, 5)).toBe(20);
  });

  it('rescans downward when the top block is removed', () => {
    const c = makeColumn();
    c.setBlockState(5, 10, 5, stone);
    c.setBlockState(5, 20, 5, dirt);
    expect(c.getSurfaceHeight(5, 5)).toBe(20);
    c.setBlockState(5, 20, 5, air); // remove the top
    expect(c.getSurfaceHeight(5, 5)).toBe(10);
    expect(c.getMotionBlockingHeight(5, 5)).toBe(10);
  });

  it('returns the sentinel when the last block is removed', () => {
    const c = makeColumn();
    c.setBlockState(5, 10, 5, stone);
    c.setBlockState(5, 10, 5, air);
    expect(c.getSurfaceHeight(5, 5)).toBe(-1);
    expect(c.getMotionBlockingHeight(5, 5)).toBe(-1);
  });

  it('excludes non-solid blocks (water) from the motion-blocking heightmap but not the surface', () => {
    const c = makeColumn();
    c.setBlockState(3, 10, 3, stone);
    c.setBlockState(3, 25, 3, water);
    expect(c.getSurfaceHeight(3, 3)).toBe(25);
    expect(c.getMotionBlockingHeight(3, 3)).toBe(10);
  });

  it('tracks each (x,z) column independently', () => {
    const c = makeColumn();
    c.setBlockState(5, 10, 5, stone);
    expect(c.getSurfaceHeight(5, 5)).toBe(10);
    expect(c.getSurfaceHeight(1, 1)).toBe(-1);
    expect(c.getMotionBlockingHeight(1, 1)).toBe(-1);
  });

  it('reproduces current state via recomputeHeightmaps', () => {
    const c = makeColumn();
    c.setBlockState(5, 10, 5, stone);
    c.setBlockState(5, 20, 5, dirt);
    c.recomputeHeightmaps();
    expect(c.getSurfaceHeight(5, 5)).toBe(20);
    expect(c.getMotionBlockingHeight(5, 5)).toBe(20);
  });

  it('lazily recomputes heightmaps after deserialize', () => {
    const c = makeColumn();
    c.setBlockState(3, 12, 7, stone);
    const restored = ChunkColumn.deserialize(c.serialize(), registry, air.id);
    // Maps are not persisted; the first read recomputes from restored blocks.
    expect(restored.getSurfaceHeight(3, 7)).toBe(12);
    expect(restored.getMotionBlockingHeight(3, 7)).toBe(12);
  });

  it('falls back to treating any non-air block as motion-blocking when no blockRegistry is supplied', () => {
    const c = makeColumn({ withBlockRegistry: false });
    c.setBlockState(1, 8, 1, water);
    expect(c.getSurfaceHeight(1, 1)).toBe(8);
    expect(c.getMotionBlockingHeight(1, 1)).toBe(8);
  });
});
