import { describe, it, expect } from 'vitest';
import {
  createFluidState,
  fluidFallingHeight,
  fluidSurfaceHeight,
  isFluidFalling,
  isFluidSource,
  validateFluidLevel,
} from '../../src/world/FluidState';

describe('validateFluidLevel', () => {
  it('accepts every integer in [0, 15]', () => {
    for (let level = 0; level <= 15; level++) {
      expect(validateFluidLevel(level)).toBe(level);
    }
  });

  it('rejects out-of-range, fractional, and non-number values', () => {
    for (const bad of [-1, 16, 1.5, NaN, Infinity, '5', null, undefined]) {
      expect(() => validateFluidLevel(bad)).toThrow(/level/i);
    }
  });
});

describe('createFluidState', () => {
  it('builds a validated state', () => {
    expect(createFluidState(3, 5)).toEqual({ fluidId: 3, level: 5 });
  });

  it('rejects invalid levels and fluid ids', () => {
    expect(() => createFluidState(3, 16)).toThrow(/level/i);
    expect(() => createFluidState(3, 0.5)).toThrow(/level/i);
    expect(() => createFluidState(-1, 5)).toThrow(/fluidId/i);
    expect(() => createFluidState(1.5, 5)).toThrow(/fluidId/i);
  });
});

describe('isFluidSource', () => {
  it('is true exactly for level 0', () => {
    for (let level = 0; level <= 15; level++) {
      expect(isFluidSource(createFluidState(1, level))).toBe(level === 0);
    }
  });
});

describe('isFluidFalling', () => {
  it('is true exactly for levels 8-15', () => {
    for (let level = 0; level <= 15; level++) {
      expect(isFluidFalling(createFluidState(1, level))).toBe(level >= 8);
    }
  });
});

describe('fluidSurfaceHeight', () => {
  it('returns 1 for source, (8-level)/8 for flowing 1-7, 1 for falling 8-15', () => {
    expect(fluidSurfaceHeight(createFluidState(1, 0))).toBe(1);
    expect(fluidSurfaceHeight(createFluidState(1, 1))).toBe(7 / 8);
    expect(fluidSurfaceHeight(createFluidState(1, 4))).toBe(4 / 8);
    expect(fluidSurfaceHeight(createFluidState(1, 7))).toBe(1 / 8);
    expect(fluidSurfaceHeight(createFluidState(1, 8))).toBe(1);
    expect(fluidSurfaceHeight(createFluidState(1, 15))).toBe(1);
  });
});

describe('fluidFallingHeight', () => {
  it('returns level - 8 for falling states and 0 otherwise', () => {
    expect(fluidFallingHeight(createFluidState(1, 0))).toBe(0);
    expect(fluidFallingHeight(createFluidState(1, 7))).toBe(0);
    expect(fluidFallingHeight(createFluidState(1, 8))).toBe(0);
    expect(fluidFallingHeight(createFluidState(1, 9))).toBe(1);
    expect(fluidFallingHeight(createFluidState(1, 15))).toBe(7);
  });
});

describe('purity', () => {
  it('returns identical results for identical states', () => {
    const state = createFluidState(2, 9);
    expect(isFluidFalling(state)).toBe(isFluidFalling(state));
    expect(fluidSurfaceHeight(state)).toBe(fluidSurfaceHeight(state));
    expect(fluidFallingHeight(state)).toBe(fluidFallingHeight(state));
  });
});
