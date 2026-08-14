/**
 * Seeded random-tick selection (048). Each ticking 16×16×16 sub-chunk receives a fixed number of
 * random cells per game tick (Java parity: default 3, sampled with replacement). Selection is a pure
 * function of `(seed, section coords, tick, attempt)` via a stable FNV-1a-style integer hash, so
 * identical worlds replay identically. `selectEligible` additionally filters candidates by a
 * caller-provided block predicate, with bounded attempts so a full sub-chunk of ineligible blocks
 * cannot hang the loop.
 */
import { SECTION_VOLUME, SECTION_SIZE, localFromIndex } from '../math/SectionCoordinate';

/** Default random cells per sub-chunk per tick (Java `randomTickSpeed` default). */
export const RANDOM_TICKS_PER_SUB_CHUNK = 3;

/** Default candidate attempts per requested eligible position. */
const DEFAULT_MAX_ELIGIBLE_ATTEMPTS = 256;

/**
 * FNV-1a style 32-bit hash over integer inputs. Deterministic and platform-independent; used to
 * derive pseudo-random cell indices.
 */
export function hash32(...values: number[]): number {
  let h = 2166136261 >>> 0;
  for (const v of values) {
    h ^= v | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface RandomTickSelectorOptions {
  /** Random cells sampled per sub-chunk per tick (default 3). */
  randomTicksPerSubChunk?: number;
  /** Candidate attempts per requested eligible position (default 256). */
  maxEligibleAttempts?: number;
}

/** Deterministic random-tick cell selection per sub-chunk per tick. */
export class RandomTickSelector {
  private readonly randomTicksPerSubChunk: number;
  private readonly maxEligibleAttempts: number;

  constructor(opts: RandomTickSelectorOptions = {}) {
    this.randomTicksPerSubChunk = opts.randomTicksPerSubChunk ?? RANDOM_TICKS_PER_SUB_CHUNK;
    this.maxEligibleAttempts = opts.maxEligibleAttempts ?? DEFAULT_MAX_ELIGIBLE_ATTEMPTS;
  }

  /**
   * Local cell indices in `[0, 4096)` for one sub-chunk at `tick` for `seed`. Returns exactly
   * `count` indices (default `randomTicksPerSubChunk`); sampling is with replacement (Java parity).
   */
  selectForSection(
    sectionX: number,
    sectionY: number,
    sectionZ: number,
    tick: number,
    seed: number,
    count: number = this.randomTicksPerSubChunk,
  ): number[] {
    if (count <= 0) return [];
    const out: number[] = new Array(count);
    for (let attempt = 0; attempt < count; attempt++) {
      out[attempt] = hash32(seed, sectionX, sectionY, sectionZ, tick, attempt) % SECTION_VOLUME;
    }
    return out;
  }

  /**
   * World-coordinate positions in this sub-chunk that pass `isEligible`, up to `count` (default
   * `randomTicksPerSubChunk`). Candidate sampling is bounded by `maxEligibleAttempts` per requested
   * position; fewer than `count` (or zero) may be returned when eligibility is sparse.
   */
  selectEligible(
    sectionX: number,
    sectionY: number,
    sectionZ: number,
    tick: number,
    seed: number,
    isEligible: (x: number, y: number, z: number) => boolean,
    count: number = this.randomTicksPerSubChunk,
  ): Array<[number, number, number]> {
    if (count <= 0) return [];
    const out: Array<[number, number, number]> = [];
    let attempts = 0;
    while (out.length < count && attempts < this.maxEligibleAttempts * count) {
      const index = hash32(seed, sectionX, sectionY, sectionZ, tick, attempts) % SECTION_VOLUME;
      attempts++;
      const local = localFromIndex(index);
      const x = sectionX * SECTION_SIZE + local.localX;
      const y = sectionY * SECTION_SIZE + local.localY;
      const z = sectionZ * SECTION_SIZE + local.localZ;
      if (isEligible(x, y, z)) {
        out.push([x, y, z]);
      }
    }
    return out;
  }
}
