import { describe, it, expect } from 'vitest';
import {
  climateDistance,
  ClimateSampler,
  validateClimateSample,
  type ClimateSample,
} from '../../src/worldgen/ClimateSampler';

const SEED = 2024;

describe('ClimateSampler', () => {
  it('is deterministic across instances and calls', () => {
    const a = new ClimateSampler(SEED);
    const b = new ClimateSampler(SEED);
    expect(a.sample(100, 200)).toEqual(b.sample(100, 200));
    expect(a.sample(100, 200)).toEqual(a.sample(100, 200));
  });

  it('keeps all five fields within [-1, 1] across a grid', () => {
    const sampler = new ClimateSampler(SEED);
    for (let x = -50; x <= 50; x += 10) {
      for (let z = -50; z <= 50; z += 10) {
        const sample = sampler.sample(x, z);
        for (const value of Object.values(sample)) {
          expect(value).toBeGreaterThanOrEqual(-1);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('varies with position', () => {
    const sampler = new ClimateSampler(SEED);
    const a = sampler.sample(0, 0);
    const b = sampler.sample(500, 500);
    expect(a).not.toEqual(b);
  });

  it('differs across seeds (spot-checked)', () => {
    const a = new ClimateSampler(1).sample(0, 0);
    const b = new ClimateSampler(2).sample(0, 0);
    expect(a).not.toEqual(b);
  });
});

describe('validateClimateSample', () => {
  it('accepts a valid in-range sample', () => {
    const sample: ClimateSample = {
      temperature: 0.5,
      humidity: -0.25,
      continentalness: 0,
      erosion: 1,
      weirdness: -1,
    };
    expect(validateClimateSample(sample)).toEqual(sample);
  });

  it('rejects out-of-range and non-finite fields naming the field', () => {
    const base: ClimateSample = {
      temperature: 0,
      humidity: 0,
      continentalness: 0,
      erosion: 0,
      weirdness: 0,
    };
    for (const field of ['temperature', 'humidity', 'continentalness', 'erosion', 'weirdness'] as const) {
      expect(() => validateClimateSample({ ...base, [field]: 1.5 })).toThrow(new RegExp(field));
      expect(() => validateClimateSample({ ...base, [field]: NaN })).toThrow(new RegExp(field));
    }
    expect(() => validateClimateSample(null)).toThrow(/object/i);
  });
});

describe('climateDistance', () => {
  it('is zero for identical samples and symmetric', () => {
    const a: ClimateSample = { temperature: 0.1, humidity: 0.2, continentalness: 0.3, erosion: 0.4, weirdness: 0.5 };
    const b: ClimateSample = { temperature: -0.1, humidity: 0.2, continentalness: -0.3, erosion: 0.4, weirdness: 0.5 };
    expect(climateDistance(a, a)).toBe(0);
    expect(climateDistance(a, b)).toBeCloseTo(climateDistance(b, a));
  });

  it('matches hand-computed Euclidean values', () => {
    const a: ClimateSample = { temperature: 0, humidity: 0, continentalness: 0, erosion: 0, weirdness: 0 };
    const b: ClimateSample = { temperature: 3, humidity: 0, continentalness: 0, erosion: 4, weirdness: 0 };
    expect(climateDistance(a, b)).toBe(5); // sqrt(3² + 4²)
  });
});
