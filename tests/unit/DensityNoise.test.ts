import { describe, it, expect } from 'vitest';
import { fbm3D, hashNoise3D, lerp, smoothstep, ValueNoise3D } from '../../src/worldgen/DensityNoise';

describe('hashNoise3D', () => {
  it('is deterministic and in [0, 1)', () => {
    const cases: Array<[number, number, number, number]> = [
      [1, 2, 3, 42],
      [-5, 100, 7, 0],
      [0, 0, 0, 12345],
    ];
    for (const [x, y, z, seed] of cases) {
      const a = hashNoise3D(x, y, z, seed);
      const b = hashNoise3D(x, y, z, seed);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  it('varies with coordinates and seed', () => {
    const base = hashNoise3D(10, 20, 30, 7);
    expect(hashNoise3D(11, 20, 30, 7)).not.toBe(base);
    expect(hashNoise3D(10, 20, 30, 8)).not.toBe(base);
  });
});

describe('smoothstep and lerp', () => {
  it('clamps and interpolates', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(2)).toBe(1);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(lerp(5, 5, 0.5)).toBe(5);
  });
});

describe('ValueNoise3D', () => {
  it('returns the lattice value exactly at integer coordinates', () => {
    const noise = new ValueNoise3D(42);
    expect(noise.sample(3, 4, 5)).toBe(noise.lattice(3, 4, 5));
    expect(noise.sample(-2, 0, 9)).toBe(noise.lattice(-2, 0, 9));
  });

  it('wraps exactly at the period', () => {
    const noise = new ValueNoise3D(7, { x: 64, y: 64, z: 64 });
    expect(noise.sample(10, 20, 30)).toBe(noise.sample(10 + 64, 20, 30));
    expect(noise.sample(10, 20, 30)).toBe(noise.sample(10, 20 - 64, 30));
  });

  it('stays within [-1, 1]', () => {
    const noise = new ValueNoise3D(99, { x: 32, y: 32, z: 32 });
    for (let i = 0; i < 200; i++) {
      const value = noise.sample(i * 0.37, i * 0.73, i * 0.11);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic', () => {
    const a = new ValueNoise3D(5);
    const b = new ValueNoise3D(5);
    expect(a.sample(1.5, 2.5, 3.5)).toBe(b.sample(1.5, 2.5, 3.5));
  });
});

describe('fbm3D', () => {
  it('is deterministic and bounded by the amplitude sum', () => {
    const noise = new ValueNoise3D(3);
    const sum = 1 + 0.5 + 0.25 + 0.125;
    for (let i = 0; i < 50; i++) {
      const value = fbm3D(noise, 4, 2, 0.5, i * 1.3, i * 0.7, i * 0.2);
      expect(value).toBeGreaterThanOrEqual(-sum);
      expect(value).toBeLessThanOrEqual(sum);
    }
    expect(fbm3D(noise, 4, 2, 0.5, 1, 2, 3)).toBe(fbm3D(noise, 4, 2, 0.5, 1, 2, 3));
  });
});
