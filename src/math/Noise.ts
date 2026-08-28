import { hash2, hash3 } from './PRNG';

/**
 * Deterministic value noise.
 *
 * A 2D and 3D value-noise implementation using seeded integer hashing of grid
 * corners with smooth interpolation. No external dependency, fully
 * reproducible for a given seed. Used for terrain height and variation.
 */

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const INV_2POW32 = 1 / 4294967296;

/** 2D value noise in [0, 1] at integer lattice scale. */
export function valueNoise2(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;

  const a = hash2(xi, zi, seed) * INV_2POW32;
  const b = hash2(xi + 1, zi, seed) * INV_2POW32;
  const c = hash2(xi, zi + 1, seed) * INV_2POW32;
  const d = hash2(xi + 1, zi + 1, seed) * INV_2POW32;

  const u = smoothstep(xf);
  const v = smoothstep(zf);

  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** 3D value noise in [0, 1]. */
export function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;

  const aaa = hash3(xi, yi, zi, seed) * INV_2POW32;
  const baa = hash3(xi + 1, yi, zi, seed) * INV_2POW32;
  const aba = hash3(xi, yi + 1, zi, seed) * INV_2POW32;
  const bba = hash3(xi + 1, yi + 1, zi, seed) * INV_2POW32;
  const aab = hash3(xi, yi, zi + 1, seed) * INV_2POW32;
  const bab = hash3(xi + 1, yi, zi + 1, seed) * INV_2POW32;
  const abb = hash3(xi, yi + 1, zi + 1, seed) * INV_2POW32;
  const bbb = hash3(xi + 1, yi + 1, zi + 1, seed) * INV_2POW32;

  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const w = smoothstep(zf);

  return lerp(
    lerp(lerp(aaa, baa, u), lerp(aba, bba, u), v),
    lerp(lerp(aab, bab, u), lerp(abb, bbb, u), v),
    w,
  );
}

/**
 * Fractal (octave) 2D noise in [-1, 1], combining multiple octaves with
 * decreasing amplitude for natural-looking terrain.
 */
export function fbm2(x: number, z: number, seed: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise2(x * freq, z * freq, seed + i * 1013) - 0.5) * 2 * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}