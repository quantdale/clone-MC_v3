import { describe, it, expect } from 'vitest';
import { MAX_AGE, isMature, nextCropAge } from '../../src/world/CropGrowth';

describe('CropGrowth', () => {
  it('defines MAX_AGE = 7', () => {
    expect(MAX_AGE).toBe(7);
  });

  it('nextCropAge increments by one and clamps at MAX_AGE', () => {
    expect(nextCropAge(0)).toBe(1);
    expect(nextCropAge(3)).toBe(4);
    expect(nextCropAge(6)).toBe(7);
    expect(nextCropAge(7)).toBe(7); // already mature, no growth past it
  });

  it('reaches maturity within exactly 7 increments from 0', () => {
    let age = 0;
    let steps = 0;
    while (!isMature(age) && steps < 20) {
      age = nextCropAge(age);
      steps++;
    }
    expect(age).toBe(7);
    expect(steps).toBe(7);
  });

  it('isMature is true only for age >= MAX_AGE', () => {
    for (let age = 0; age < MAX_AGE; age++) {
      expect(isMature(age)).toBe(false);
    }
    expect(isMature(MAX_AGE)).toBe(true);
    expect(isMature(MAX_AGE + 1)).toBe(true);
  });

  it('normalizes negative or non-integer input to 0', () => {
    expect(nextCropAge(-3)).toBe(0);
    expect(nextCropAge(2.5)).toBe(0);
    expect(nextCropAge(Number.NaN)).toBe(0);
  });
});
