/**
 * Deterministic named RNG streams (054). `SeedRng` is a pinned mulberry32 PRNG (32-bit state) so
 * identical seeds produce identical sequences. `createNamedRng(worldSeed, streamName)` derives an
 * isolated, reproducible stream per simulation subsystem, and `fork(name)` derives deterministic
 * child streams from a parent's current state. The algorithm MUST NOT change once consumers depend on
 * it; any future change requires a versioned stream scheme.
 */

/** FNV-1a 32-bit hash over a string (UTF-16 code units). */
function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 32-bit PRNG (mulberry32) with typed draws and deterministic forks. */
export class SeedRng {
  private a: number;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  /** One raw uint32 draw. */
  next(): number {
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** A float in `[0, 1)`. */
  nextFloat(): number {
    return this.next() / 0x100000000;
  }

  /** An integer in `[0, maxExclusive)`. */
  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`SeedRng.nextInt: maxExclusive must be a positive integer (got ${maxExclusive})`);
    }
    return Math.floor(this.nextFloat() * maxExclusive);
  }

  /** An integer in `[min, max]` (both inclusive). */
  nextIntInclusive(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`SeedRng.nextIntInclusive: invalid range [${min}, ${max}]`);
    }
    return min + this.nextInt(max - min + 1);
  }

  /** A boolean draw. */
  nextBoolean(): boolean {
    return (this.next() & 1) === 1;
  }

  /**
   * Derive a deterministic child stream from the parent's current state and `name`. Consumes one
   * parent draw (the state capture + derivation).
   */
  fork(name: string): SeedRng {
    const child = new SeedRng(hashString(name) ^ this.state);
    this.next(); // consume the draw used to derive the child seed
    return child;
  }

  /** The current 32-bit state (uint32). */
  get state(): number {
    return this.a >>> 0;
  }
}

/** A named, seed-derived stream: same `(worldSeed, streamName)` always yields the same sequence. */
export function createNamedRng(worldSeed: number, streamName: string): SeedRng {
  return new SeedRng((hashString(streamName) ^ (worldSeed >>> 0)) >>> 0);
}
