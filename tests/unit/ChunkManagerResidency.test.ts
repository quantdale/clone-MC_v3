import { describe, expect, it } from 'vitest';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { ChunkManager } from '../../src/world/ChunkManager';

function manager(): ChunkManager {
  return new ChunkManager(createDefaultBlockRegistry());
}

describe('ChunkManager horizontal column residency', () => {
  it('keeps vertical slabs lazy within one horizontal column', () => {
    const chunks = manager();

    expect(chunks.columnCount).toBe(0);
    expect(chunks.getColumnResidency(-2, 3)).toBeUndefined();

    const lower = chunks.createChunk(-2, -1, 3);
    expect(chunks.columnCount).toBe(1);
    expect(chunks.size).toBe(1);
    expect(chunks.getColumnResidency(-2, 3)).toEqual({
      chunkX: -2,
      chunkZ: 3,
      slabs: [lower],
    });

    const upper = chunks.createChunk(-2, 4, 3);
    expect(chunks.columnCount).toBe(1);
    expect(chunks.size).toBe(2);
    expect(chunks.getColumnSlabs(-2, 3)).toEqual([lower, upper]);
    expect(chunks.getChunk(-2, 0, 3)).toBeUndefined();
  });

  it('enumerates horizontal columns without exposing the mutable map', () => {
    const chunks = manager();
    const negative = chunks.createChunk(-2, 0, -3);
    const positive = chunks.createChunk(4, 2, 5);
    const columns: Array<[number, number, readonly typeof negative[]]> = [];

    chunks.forEachColumn((column) => columns.push([column.chunkX, column.chunkZ, column.slabs]));

    expect(columns).toEqual([
      [-2, -3, [negative]],
      [4, 5, [positive]],
    ]);

    const snapshot = chunks.getColumnResidency(-2, -3)!;
    chunks.removeChunk(-2, 0, -3);
    expect(snapshot.slabs).toEqual([negative]);
    expect(chunks.columnCount).toBe(1);
  });

  it('prunes a horizontal column only after its final vertical slab leaves', () => {
    const chunks = manager();
    chunks.createChunk(1, 0, 1);
    chunks.createChunk(1, 1, 1);
    chunks.createChunk(2, 0, 1);

    chunks.removeChunk(1, 0, 1);
    expect(chunks.hasColumn(1, 1)).toBe(true);
    expect(chunks.columnCount).toBe(2);
    expect(chunks.pipeline.size).toBe(2);

    chunks.removeChunk(1, 1, 1);
    expect(chunks.hasColumn(1, 1)).toBe(false);
    expect(chunks.columnCount).toBe(1);
    expect(chunks.pipeline.size).toBe(1);
  });
});
