/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * Deterministic and dependency-free. Used for all world-critical generation so
 * that the same seed + coordinates always reproduce identical terrain.
 */
export class PRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [0, max). */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Returns a float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

/** Deterministic integer hash of a seed used to derive per-location noise inputs. */
export function hash2(x: number, z: number, seed: number): number {
  let h = seed ^ (Math.imul(x, 374761393) ^ Math.imul(z, 668265263));
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic integer hash of a 3D coordinate. */
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = seed ^ (Math.imul(x, 374761393) ^ Math.imul(y, 2246822519) ^ Math.imul(z, 668265263));
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}