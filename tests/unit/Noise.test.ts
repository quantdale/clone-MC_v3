import { describe, it, expect } from 'vitest';
import { PRNG, hash2, hash3 } from '../../src/math/PRNG';
import { valueNoise2, valueNoise3, fbm2 } from '../../src/math/Noise';

describe('seeded PRNG', () => {
  it('is deterministic for the same seed', () => {
    const a = new PRNG(42);
    const b = new PRNG(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces values in [0, 1)', () => {
    const rng = new PRNG(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('differs for different seeds', () => {
    const a = new PRNG(1).next();
    const b = new PRNG(2).next();
    expect(a).not.toBe(b);
  });

  it('hash2/hash3 are deterministic', () => {
    expect(hash2(1, 2, 3)).toBe(hash2(1, 2, 3));
    expect(hash3(1, 2, 3, 4)).toBe(hash3(1, 2, 3, 4));
  });

  it('hash2/hash3 vary with the input coordinates', () => {
    // Different inputs must not collapse onto the same hash — a real practical
    // requirement for per-location noise inputs.
    expect(hash2(1, 2, 3)).not.toBe(hash2(1, 3, 3));
    expect(hash2(1, 2, 3)).not.toBe(hash2(1, 2, 4));
    expect(hash2(1, 2, 3)).not.toBe(hash2(2, 2, 3));
    expect(hash3(1, 2, 3, 4)).not.toBe(hash3(1, 2, 4, 4));
    expect(hash3(1, 2, 3, 4)).not.toBe(hash3(1, 2, 3, 5));
  });

  it('PRNG.nextInt and PRNG.range stay within their documented bounds', () => {
    const rng = new PRNG(99);
    for (let i = 0; i < 1000; i++) {
      const n = rng.nextInt(5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
      expect(Number.isInteger(n)).toBe(true);
      const r = rng.range(2, 10);
      expect(r).toBeGreaterThanOrEqual(2);
      expect(r).toBeLessThan(10);
    }
  });
});

describe('value noise', () => {
  it('is deterministic for a fixed seed and coordinates', () => {
    expect(valueNoise2(1.5, 2.5, 99)).toBe(valueNoise2(1.5, 2.5, 99));
    expect(valueNoise3(1.5, 2.5, 3.5, 99)).toBe(valueNoise3(1.5, 2.5, 3.5, 99));
  });

  it('equals the raw corner hash at integer lattice points', () => {
    // At integer coordinates the interpolation factors are all zero, so the
    // value must reduce exactly to the seeded lattice corner hash.
    expect(valueNoise2(3, 5, 99)).toBe(hash2(3, 5, 99) / 4294967296);
    expect(valueNoise2(-2, 7, 99)).toBe(hash2(-2, 7, 99) / 4294967296);
    expect(valueNoise3(3, 5, 7, 99)).toBe(hash3(3, 5, 7, 99) / 4294967296);
    expect(valueNoise3(-2, 4, -9, 99)).toBe(hash3(-2, 4, -9, 99) / 4294967296);
  });

  it('is continuous across a lattice boundary', () => {
    // A tiny step across a cell boundary must only change the value slightly —
    // a discontinuity would produce a visible sharp step in the terrain.
    const inside = valueNoise2(1.0, 1.0, 99);
    const outside = valueNoise2(1.0001, 1.0, 99);
    expect(Math.abs(inside - outside)).toBeLessThan(0.01);
    const inside3 = valueNoise3(1.0, 1.0, 1.0, 99);
    const outside3 = valueNoise3(1.0001, 1.0, 1.0, 99);
    expect(Math.abs(inside3 - outside3)).toBeLessThan(0.01);
  });

  it('produces values in [0, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const v = valueNoise2(i * 0.37, i * 0.13, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('fbm2 stays within [-1, 1] across a wide sweep', () => {
    // fbm2 is documented to return in [-1, 1]; it is the amplitude envelope
    // for terrain height, so excursions outside would break the terrain band.
    for (let i = 0; i < 200; i++) {
      const v = fbm2(i * 0.61, i * 0.37, 7);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('fbm2 differs with different seeds', () => {
    const a = fbm2(3.0, 4.0, 1);
    const b = fbm2(3.0, 4.0, 2);
    expect(a).not.toBe(b);
  });
});