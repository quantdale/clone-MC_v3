import { describe, it, expect } from 'vitest';
import { NETHER_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import {
  DEFAULT_NETHER_TERRAIN_CONFIG,
  generateNetherColumn,
} from '../../src/worldgen/NetherTerrain';
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

describe('generateNetherColumn', () => {
  it('defaults to the Nether dimension bounds (0..256)', () => {
    expect(DEFAULT_NETHER_TERRAIN_CONFIG.minY).toBe(NETHER_DIMENSION_TYPE.minY);
    expect(DEFAULT_NETHER_TERRAIN_CONFIG.maxY).toBe(NETHER_DIMENSION_TYPE.minY + NETHER_DIMENSION_TYPE.height);
    expect(DEFAULT_NETHER_TERRAIN_CONFIG.lavaLevel).toBe(31);
    expect(DEFAULT_NETHER_TERRAIN_CONFIG.ceilingY).toBe(127);
  });

  it('lays a full bedrock floor at minY and a full bedrock roof at ceilingY', () => {
    const column = generateNetherColumn(42, 0, 0);
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        expect(column.getBlock(x, 0, z)).toBe(7); // bedrock floor
        expect(column.getBlock(x, 127, z)).toBe(7); // bedrock roof
      }
    }
  });

  it('has no water anywhere; lava fills every cell below lavaLevel', () => {
    const column = generateNetherColumn(42, 0, 0);
    for (const cell of dump(column)) {
      const block = Number(cell.slice(cell.lastIndexOf(':') + 1));
      expect(block).not.toBe(8); // BlockId.Water never appears in the Nether
    }
    // Below the lava level every cell is non-air: netherrack (terrain) or lava.
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        for (let y = 1; y < 31; y++) {
          expect(column.getBlock(x, y, z)).not.toBeNull();
        }
      }
    }
    // And at least some of those are lava (the terrain band sits well above y=31).
    let lavaCells = 0;
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        for (let y = 1; y < 31; y++) {
          if (column.getBlock(x, y, z) === 20) lavaCells++;
        }
      }
    }
    expect(lavaCells).toBeGreaterThan(0);
  });

  it('generates a netherrack terrain band below the roof with a positive surface height', () => {
    const column = generateNetherColumn(42, 0, 0);
    expect(column.blockCount).toBeGreaterThan(0);
    // The topmost solid is the bedrock roof; find the top of the netherrack body instead.
    let topmostNetherrack = -1;
    for (let z = 0; z < 16 && topmostNetherrack === -1; z++) {
      for (let x = 0; x < 16 && topmostNetherrack === -1; x++) {
        for (let y = 126; y >= 32; y--) {
          if (column.getBlock(x, y, z) !== null) {
            topmostNetherrack = y;
            break;
          }
        }
      }
    }
    expect(topmostNetherrack).toBeGreaterThanOrEqual(32);
    expect(topmostNetherrack).toBeLessThan(127); // never above the roof
  });

  it('leaves the open roof area above ceilingY as air', () => {
    const column = generateNetherColumn(42, 0, 0);
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        expect(column.getBlock(x, 200, z)).toBeNull();
        expect(column.getBlock(x, 255, z)).toBeNull();
      }
    }
  });

  it('is deterministic per (seed, columnX, columnZ)', () => {
    const a = generateNetherColumn(7, 3, -2);
    const b = generateNetherColumn(7, 3, -2);
    expect(dump(a)).toEqual(dump(b));
    expect(dump(a).length).toBeGreaterThan(0);
  });

  it('writes caller-supplied block ids', () => {
    const column = generateNetherColumn(1, 0, 0, undefined, { netherrack: 99, lava: 88, bedrock: 77 });
    expect(column.getBlock(0, 0, 0)).toBe(77);
    expect(column.getBlock(0, 127, 0)).toBe(77);
    const cells = dump(column);
    expect(cells.some((c) => c.endsWith(':99'))).toBe(true); // netherrack
    expect(cells.some((c) => c.endsWith(':88'))).toBe(true); // lava
    expect(cells.some((c) => c.endsWith(':8'))).toBe(false); // still no water
  });

  it('rejects invalid configs', () => {
    expect(() => generateNetherColumn(1, 0, 0, { minY: 10, maxY: 10 })).toThrow();
    expect(() => generateNetherColumn(1, 0, 0, { lavaLevel: 0 })).toThrow(); // not > minY
    expect(() => generateNetherColumn(1, 0, 0, { ceilingY: 256 })).toThrow(); // not < maxY
    expect(() => generateNetherColumn(1, 0, 0, { ceilingY: 20 })).toThrow(); // not > lavaLevel
  });
});
