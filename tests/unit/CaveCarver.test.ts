import { describe, it, expect } from 'vitest';
import {
  applyCarving,
  carveColumn,
  carveValue,
  CarvedColumn,
  DEFAULT_CAVE_CARVER_CONFIG,
} from '../../src/worldgen/CaveCarver';
import { generateTerrainColumn } from '../../src/worldgen/OverworldTerrain';

const SEED = 777;

describe('carveValue', () => {
  it('is deterministic and bounded', () => {
    const bound = 1 + 0.5 + 0.25 + 0.125 + 0.4 * (1 + 0.5 + 0.25);
    for (let i = 0; i < 40; i++) {
      const value = carveValue(SEED, i * 3, i * 2, i * 5);
      expect(value).toBeGreaterThanOrEqual(-bound);
      expect(value).toBeLessThanOrEqual(bound);
    }
    expect(carveValue(SEED, 1, 2, 3)).toBe(carveValue(SEED, 1, 2, 3));
  });
});

describe('carveColumn', () => {
  it('produces a deterministic sparse mask within the y-window', () => {
    // A reduced y-window keeps the exhaustive comparison fast (32 layers).
    const window = { minY: -64, maxY: -32 };
    const a = carveColumn(SEED, 3, -2, window);
    const b = carveColumn(SEED, 3, -2, window);
    expect(a.size).toBe(b.size);
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = -64; y < -32; y++) {
          expect(a.has(x, y, z)).toBe(b.has(x, y, z));
          if (a.has(x, y, z)) {
            expect(y).toBeGreaterThanOrEqual(-64);
            expect(y).toBeLessThan(-32);
          }
        }
      }
    }
  });

  it('differs across seeds (spot-checked)', () => {
    const window = { minY: -64, maxY: -32 };
    const a = carveColumn(1, 0, 0, window);
    const b = carveColumn(2, 0, 0, window);
    let differences = 0;
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = -64; y < -32; y++) {
          if (a.has(x, y, z) !== b.has(x, y, z)) differences++;
        }
      }
    }
    expect(differences).toBeGreaterThan(0);
  });

  it('carves a nonzero number of cells with the default threshold', () => {
    expect(carveColumn(SEED, 0, 0, { minY: -64, maxY: -32 }).size).toBeGreaterThan(0);
  });

  it('respects the y-window config', () => {
    const mask = carveColumn(SEED, 0, 0, { minY: 0, maxY: 64 });
    expect(mask.minY).toBe(0);
    expect(mask.maxY).toBe(64);
    for (let y = -1; y <= 64; y++) {
      if (y < 0 || y >= 64) {
        expect(mask.has(0, y, 0)).toBe(false);
      }
    }
  });

  it('rejects invalid configs', () => {
    expect(() => carveColumn(SEED, 0, 0, { threshold: NaN })).toThrow(/invalid config/i);
    expect(() => carveColumn(SEED, 0, 0, { minY: 10, maxY: 10 })).toThrow(/invalid config/i);
  });
});

describe('applyCarving', () => {
  it('removes exactly the carved cells and keeps the input untouched', () => {
    // A reduced y-window keeps the exhaustive comparison fast.
    const window = { minY: -64, maxY: -32, seaLevel: -40 };
    const column = generateTerrainColumn(SEED, 0, 0, window);
    const carved = carveColumn(SEED, 0, 0, window);
    const before = column.blockCount;

    const carvedColumn = applyCarving(column, carved);

    expect(carvedColumn.blockCount).toBeLessThan(before);
    let removed = 0;
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = -64; y < -32; y++) {
          if (carved.has(x, y, z)) {
            expect(carvedColumn.getBlock(x, y, z)).toBeNull();
            removed++;
          } else {
            expect(carvedColumn.getBlock(x, y, z)).toBe(column.getBlock(x, y, z));
          }
        }
      }
    }
    expect(removed).toBe(carved.size);
    expect(column.blockCount).toBe(before); // input untouched
  });
});

describe('CarvedColumn and TerrainColumn.removeCell', () => {
  it('has/size round-trip and removeCell clears stored cells', () => {
    const mask = new CarvedColumn(0, 0, DEFAULT_CAVE_CARVER_CONFIG.minY, DEFAULT_CAVE_CARVER_CONFIG.maxY);
    mask.add(1, 5, 2);
    expect(mask.has(1, 5, 2)).toBe(true);
    expect(mask.has(1, 6, 2)).toBe(false);
    expect(mask.size).toBe(1);

    const column = generateTerrainColumn(SEED, 0, 0, { minY: -64, maxY: -32, seaLevel: -40 });
    const before = column.blockCount;
    // Bedrock cells exist everywhere at minY; remove one.
    column.removeCell(3, -64, 5);
    expect(column.getBlock(3, -64, 5)).toBeNull();
    expect(column.blockCount).toBe(before - 1);
    column.removeCell(3, -64, 5); // idempotent
    expect(column.blockCount).toBe(before - 1);
  });
});
