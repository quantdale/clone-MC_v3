/**
 * Deterministic 3D noise primitives (087). `hashNoise3D` hashes integer coordinates with the seed
 * via FNV-1a into [0, 1). `ValueNoise3D` builds a periodic lattice of hash values (default period
 * 256 per axis) and samples with smoothstep trilinear interpolation into [-1, 1]; integer
 * coordinates return the lattice value exactly, and samples wrap exactly at the period.
 * `fbm3D` composes octaves (`Σ gain^i · noise(x·l^i, ...)`, defaults 4 octaves, lacunarity 2,
 * gain 0.5) — bounded and deterministic.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(input: number): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < 32; i += 8) {
    hash ^= (input >>> i) & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function hashInt(value: number): number {
  return fnv1a(value);
}

/** Deterministic hash of integer coordinates + seed into [0, 1). */
export function hashNoise3D(x: number, y: number, z: number, seed: number): number {
  let hash = FNV_OFFSET;
  for (const v of [x, y, z, seed]) {
    const h = hashInt(v);
    hash ^= h & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
    hash ^= (h >>> 8) & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
    hash ^= (h >>> 16) & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
    hash ^= (h >>> 24) & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return (hash >>> 0) / 0x100000000;
}

/** Smoothstep interpolation factor (clamped 0..1). */
export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lattice periods per axis (exact wrap). */
export interface NoisePeriods {
  x: number;
  y: number;
  z: number;
}

const DEFAULT_PERIOD = 256;

/** Periodic trilinear value noise (deterministic). */
export class ValueNoise3D {
  private readonly seed: number;
  private readonly periods: NoisePeriods;

  constructor(seed: number, periods?: Partial<NoisePeriods>) {
    this.seed = seed;
    this.periods = {
      x: periods?.x ?? DEFAULT_PERIOD,
      y: periods?.y ?? DEFAULT_PERIOD,
      z: periods?.z ?? DEFAULT_PERIOD,
    };
  }

  /** The lattice value at an integer lattice point, in [-1, 1]. */
  lattice(x: number, y: number, z: number): number {
    const wx = ((x % this.periods.x) + this.periods.x) % this.periods.x;
    const wy = ((y % this.periods.y) + this.periods.y) % this.periods.y;
    const wz = ((z % this.periods.z) + this.periods.z) % this.periods.z;
    return hashNoise3D(wx, wy, wz, this.seed) * 2 - 1;
  }

  /** Smoothly interpolated sample at fractional coordinates, in [-1, 1]. */
  sample(x: number, y: number, z: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const tx = smoothstep(x - x0);
    const ty = smoothstep(y - y0);
    const tz = smoothstep(z - z0);

    const c000 = this.lattice(x0, y0, z0);
    const c100 = this.lattice(x0 + 1, y0, z0);
    const c010 = this.lattice(x0, y0 + 1, z0);
    const c110 = this.lattice(x0 + 1, y0 + 1, z0);
    const c001 = this.lattice(x0, y0, z0 + 1);
    const c101 = this.lattice(x0 + 1, y0, z0 + 1);
    const c011 = this.lattice(x0, y0 + 1, z0 + 1);
    const c111 = this.lattice(x0 + 1, y0 + 1, z0 + 1);

    const x00 = lerp(c000, c100, tx);
    const x10 = lerp(c010, c110, tx);
    const x01 = lerp(c001, c101, tx);
    const x11 = lerp(c011, c111, tx);
    const y0v = lerp(x00, x10, ty);
    const y1v = lerp(x01, x11, ty);
    return lerp(y0v, y1v, tz);
  }
}

/**
 * Fractal Brownian motion over a value noise field:
 * `Σ_{i=0}^{octaves-1} gain^i · noise(x·l^i, y·l^i, z·l^i)`.
 */
export function fbm3D(
  noise: ValueNoise3D,
  octaves: number,
  lacunarity: number,
  gain: number,
  x: number,
  y: number,
  z: number,
): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * noise.sample(x * frequency, y * frequency, z * frequency);
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum;
}
