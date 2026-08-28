import { describe, it, expect } from 'vitest';
import {
  fluidLevelFromWaterlogging,
  isWaterloggable,
  validateWaterloggingLevel,
  waterlog,
  waterloggingLevelFromFluid,
  withWaterLevel,
} from '../../src/world/Waterlogging';

describe('validateWaterloggingLevel', () => {
  it('accepts 0 and every falling level 8-15', () => {
    expect(validateWaterloggingLevel(0)).toBe(0);
    for (let level = 8; level <= 15; level++) {
      expect(validateWaterloggingLevel(level)).toBe(level);
    }
  });

  it('rejects flowing levels and malformed values', () => {
    for (const bad of [1, 2, 7, 16, -1, 0.5, 8.5, NaN, '8', null, undefined]) {
      expect(() => validateWaterloggingLevel(bad as never)).toThrow(/level/i);
    }
  });
});

describe('waterlog', () => {
  it('builds a validated cell', () => {
    expect(waterlog(7, 8)).toEqual({ blockId: 7, waterLevel: 8 });
    expect(waterlog(7, 0)).toEqual({ blockId: 7, waterLevel: 0 });
  });

  it('rejects invalid levels and block ids', () => {
    expect(() => waterlog(7, 3)).toThrow(/level/i); // flowing level cannot coexist
    expect(() => waterlog(-1, 0)).toThrow(/blockId/i);
    expect(() => waterlog(1.5, 0)).toThrow(/blockId/i);
  });
});

describe('waterloggingLevelFromFluid', () => {
  it('maps sources and flowing water to level 0', () => {
    expect(waterloggingLevelFromFluid(0)).toBe(0);
    expect(waterloggingLevelFromFluid(1)).toBe(0);
    expect(waterloggingLevelFromFluid(7)).toBe(0);
  });

  it('keeps falling levels unchanged', () => {
    expect(waterloggingLevelFromFluid(8)).toBe(8);
    expect(waterloggingLevelFromFluid(15)).toBe(15);
  });
});

describe('fluidLevelFromWaterlogging', () => {
  it('maps waterlogged levels back to fluid levels', () => {
    expect(fluidLevelFromWaterlogging(0)).toBe(0);
    expect(fluidLevelFromWaterlogging(8)).toBe(8);
    expect(fluidLevelFromWaterlogging(15)).toBe(15);
  });
});

describe('withWaterLevel', () => {
  it('returns a new cell for a valid level and null for null', () => {
    const cell = waterlog(3, 0);
    expect(withWaterLevel(cell, 9)).toEqual({ blockId: 3, waterLevel: 9 });
    expect(withWaterLevel(cell, null)).toBeNull();
    expect(cell).toEqual({ blockId: 3, waterLevel: 0 }); // original untouched
  });

  it('rejects invalid levels', () => {
    expect(() => withWaterLevel(waterlog(3, 0), 4)).toThrow(/level/i);
  });
});

describe('isWaterloggable', () => {
  it('is pure set membership', () => {
    const ids = new Set([3, 5]);
    expect(isWaterloggable(3, ids)).toBe(true);
    expect(isWaterloggable(5, ids)).toBe(true);
    expect(isWaterloggable(4, ids)).toBe(false);
  });
});

describe('purity', () => {
  it('returns identical results for identical inputs', () => {
    expect(waterloggingLevelFromFluid(3)).toBe(waterloggingLevelFromFluid(3));
    expect(fluidLevelFromWaterlogging(9)).toBe(fluidLevelFromWaterlogging(9));
    expect(isWaterloggable(3, new Set([3]))).toBe(isWaterloggable(3, new Set([3])));
  });
});
