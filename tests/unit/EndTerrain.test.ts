import { describe, it, expect } from 'vitest';
import { END_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import {
  DEFAULT_END_TERRAIN_CONFIG,
  END_OUTER_ISLAND_DISTANCE,
  generateEndColumn,
} from '../../src/worldgen/EndTerrain';
import type { TerrainColumn } from '../../src/worldgen/OverworldTerrain';

function dump(column: TerrainColumn): string[] {
  const cells: string[] = [];
  for (let z = 0; z < 16; z++) {
    for (let y = column.minY; y < column.maxY; y++) {
      for (let x = 0; x < 16; x++) {
        const block = column.getBlock(x, y, z);
        if (block !== null) cells.push(`${x},${y},${z}:${block}`);
      }
    }
  }
  return cells;
}

describe('generateEndColumn', () => {
  it('defaults to the End dimension bounds (0..256)', () => {
    expect(DEFAULT_END_TERRAIN_CONFIG.minY).toBe(END_DIMENSION_TYPE.minY);
    expect(DEFAULT_END_TERRAIN_CONFIG.maxY).toBe(END_DIMENSION_TYPE.minY + END_DIMENSION_TYPE.height);
  });

  it('generates the main island at the origin column', () => {
    const column = generateEndColumn(42, 0, 0);
    expect(column.blockCount).toBeGreaterThan(0);
    // Near the island center (world 8, 64, 8): well inside the minimum radius.
    expect(column.getBlock(8, 64, 8)).toBe(1); // default endStone id
    expect(column.getBlock(8, 60, 8)).toBe(1);
  });

  it('keeps the main island within the vanilla-ish vertical profile', () => {
    const column = generateEndColumn(42, 0, 0);
    // fbm3D with 4 octaves spans ~±1.875, so the noisy radius is 45 ± 18.75: the island reaches
    // up to ~y=127 (just below the End's 0..255 volume top) and down to ~y=0, never beyond.
    for (const cell of dump(column)) {
      const y = Number(cell.slice(cell.indexOf(',') + 1, cell.lastIndexOf(',')));
      expect(y).toBeLessThanOrEqual(127);
      expect(y).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves near-but-outside columns as pure void', () => {
    // World (80, 80) is outside the main island's max radius (55) and inside the outer ring start.
    expect(dump(generateEndColumn(42, 5, 5))).toEqual([]);
    expect(END_OUTER_ISLAND_DISTANCE).toBe(1000);
  });

  it('keeps outer-island columns as small bounded blobs near y=64', () => {
    // World (1120, 1120) is beyond the outer-island distance; any cells must be a small blob.
    const column = generateEndColumn(42, 70, 70);
    for (const cell of dump(column)) {
      const y = Number(cell.slice(cell.indexOf(',') + 1, cell.lastIndexOf(',')));
      expect(y).toBeGreaterThanOrEqual(64 - 22);
      expect(y).toBeLessThanOrEqual(64 + 22);
    }
  });

  it('never emits water and stays inside the column volume', () => {
    const column = generateEndColumn(7, -3, 2);
    for (const cell of dump(column)) {
      expect(cell.endsWith(':8')).toBe(false); // BlockId.Water never appears
      const y = Number(cell.slice(cell.indexOf(',') + 1, cell.lastIndexOf(',')));
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(256);
    }
  });

  it('is deterministic per (seed, columnX, columnZ)', () => {
    const a = generateEndColumn(7, 3, -2);
    const b = generateEndColumn(7, 3, -2);
    expect(dump(a)).toEqual(dump(b));
  });

  it('writes caller-supplied block ids', () => {
    const column = generateEndColumn(42, 0, 0, undefined, { endStone: 99 });
    expect(column.getBlock(8, 64, 8)).toBe(99);
  });

  it('rejects invalid configs', () => {
    expect(() => generateEndColumn(1, 0, 0, { minY: 10, maxY: 10 })).toThrow();
    expect(() => generateEndColumn(1, 0, 0, { minY: 20, maxY: 10 })).toThrow();
  });
});
