import { describe, it, expect } from 'vitest';
import {
  applyAquifers,
  classifyAquifer,
  DEFAULT_AQUIFER_BLOCK_IDS,
  type AquiferDecision,
} from '../../src/worldgen/AquiferSystem';
import { carveColumn } from '../../src/worldgen/CaveCarver';
import { generateTerrainColumn } from '../../src/worldgen/OverworldTerrain';

const SEED = 555;

describe('classifyAquifer', () => {
  it('follows the exact y-table when dryness is forced off', () => {
    // fbm3 is bounded by ±(1 + 0.5 + 0.25); a threshold of 1.1 is never exceeded.
    expect(classifyAquifer(SEED, 0, 100, 0, { dryThreshold: 1.1 })).toBe('NONE'); // above sea
    expect(classifyAquifer(SEED, 0, 0, 0, { dryThreshold: 1.1 })).toBe('WATER'); // between
    expect(classifyAquifer(SEED, 0, -100, 0, { dryThreshold: 1.1 })).toBe('LAVA'); // below lavaLevel
    expect(classifyAquifer(SEED, 0, 62, 0, { dryThreshold: 1.1 })).toBe('WATER');
    expect(classifyAquifer(SEED, 0, -54, 0, { dryThreshold: 1.1 })).toBe('WATER'); // lavaLevel is exclusive
    expect(classifyAquifer(SEED, 0, -55, 0, { dryThreshold: 1.1 })).toBe('LAVA');
  });

  it('returns NONE everywhere below sea when dryness is forced on', () => {
    expect(classifyAquifer(SEED, 0, 0, 0, { dryThreshold: -2 })).toBe('NONE');
    expect(classifyAquifer(SEED, 0, -100, 0, { dryThreshold: -2 })).toBe('NONE');
    expect(classifyAquifer(SEED, 0, 100, 0, { dryThreshold: -2 })).toBe('NONE'); // above sea always NONE
  });

  it('is deterministic with the default config and stays in the decision set', () => {
    for (let i = 0; i < 50; i++) {
      const a = classifyAquifer(SEED, i * 3, i * 2 - 60, i * 5);
      const b = classifyAquifer(SEED, i * 3, i * 2 - 60, i * 5);
      expect(a).toBe(b);
      expect(['WATER', 'LAVA', 'NONE']).toContain(a);
    }
  });

  it('rejects invalid configs', () => {
    expect(() => classifyAquifer(SEED, 0, 0, 0, { dryThreshold: NaN })).toThrow(/invalid config/i);
    expect(() => classifyAquifer(SEED, 0, 0, 0, { seaLevel: 1.5, lavaLevel: -1, dryThreshold: 0.4 })).toThrow(
      /invalid config/i,
    );
    expect(() => classifyAquifer(SEED, 0, 0, 0, { lavaLevel: 100, seaLevel: 63, dryThreshold: 0.4 })).toThrow(
      /invalid config/i,
    );
  });
});

describe('applyAquifers', () => {
  const window = { minY: -64, maxY: -32, seaLevel: -40 };

  it('fills carved cells below sea with water, deep cells with lava, above-sea carved cells with air', () => {
    const column = generateTerrainColumn(SEED, 0, 0, window);
    const carved = carveColumn(SEED, 0, 0, window);
    // Force dryness off and use a window-relative table: lava below -54, water between.
    const aquiferWindow = { minY: -64, maxY: -32, seaLevel: -40, lavaLevel: -54, dryThreshold: 1.1 };

    const filled = applyAquifers(column, carved, SEED, aquiferWindow);

    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = -64; y < -32; y++) {
          const original = column.getBlock(x, y, z);
          if (original === null) {
            expect(filled.getBlock(x, y, z)).toBeNull();
            continue;
          }
          if (!carved.has(x, y, z)) {
            expect(filled.getBlock(x, y, z)).toBe(original);
          } else if (y < -54) {
            expect(filled.getBlock(x, y, z)).toBe(DEFAULT_AQUIFER_BLOCK_IDS.lava);
          } else if (y < -40) {
            expect(filled.getBlock(x, y, z)).toBe(DEFAULT_AQUIFER_BLOCK_IDS.water);
          } else {
            expect(filled.getBlock(x, y, z)).toBeNull(); // carved above sea stays air
          }
        }
      }
    }
    expect(column.getBlock(3, -60, 5)).not.toBeNull(); // input untouched (spot)
  });

  it('is deterministic', () => {
    const column = generateTerrainColumn(SEED, 0, 0, window);
    const carved = carveColumn(SEED, 0, 0, window);
    const a = applyAquifers(column, carved, SEED, { seaLevel: -40, lavaLevel: -54, dryThreshold: 1.1 });
    const b = applyAquifers(column, carved, SEED, { seaLevel: -40, lavaLevel: -54, dryThreshold: 1.1 });
    let equal = true;
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = -64; y < -32; y++) {
          if (a.getBlock(x, y, z) !== b.getBlock(x, y, z)) equal = false;
        }
      }
    }
    expect(equal).toBe(true);
  });

  it('rejects invalid configs on application', () => {
    const column = generateTerrainColumn(SEED, 0, 0, window);
    const carved = carveColumn(SEED, 0, 0, window);
    expect(() =>
      applyAquifers(column, carved, SEED, { seaLevel: -40, lavaLevel: -40, dryThreshold: 1.1 }),
    ).toThrow(/invalid config/i);
  });
});

describe('decision set spot-check', () => {
  it('produces multiple decision kinds with the default config (spot-checked)', () => {
    const kinds = new Set<AquiferDecision>();
    for (let i = 0; i < 60; i++) {
      kinds.add(classifyAquifer(SEED, i * 7, i * 3 - 80, i * 11));
    }
    // Over a range spanning above/below sea and lava levels, at least two kinds appear.
    expect(kinds.size).toBeGreaterThanOrEqual(2);
  });
});
