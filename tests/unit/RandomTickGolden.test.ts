import { describe, it, expect } from 'vitest';
import {
  RandomTickSelector,
  hash32,
  hash32_6,
} from '../../src/simulation/RandomTickSelector';

/**
 * Change 254 R5: the optimized selector must be bit-identical to the
 * pre-254 algorithm. The reference below is an independent reimplementation of
 * the ORIGINAL source (variadic FNV-1a + object-based index decode), so any
 * drift in the production path breaks these comparisons.
 */

function refHash32(...values: number[]): number {
  let h = 2166136261 >>> 0;
  for (const v of values) {
    h ^= v | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SECTION_VOLUME = 4096;

interface LocalCoord {
  localX: number;
  localY: number;
  localZ: number;
}

function refLocalFromIndex(index: number): LocalCoord {
  const localZ = Math.floor(index / (16 * 16));
  const remainder = index - localZ * 16 * 16;
  const localY = Math.floor(remainder / 16);
  const localX = remainder - localY * 16;
  return { localX, localY, localZ };
}

function refSelectEligible(
  sectionX: number,
  sectionY: number,
  sectionZ: number,
  tick: number,
  seed: number,
  isEligible: (x: number, y: number, z: number) => boolean,
  count = 3,
): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  let attempts = 0;
  while (out.length < count && attempts < 256 * count) {
    const index = refHash32(seed, sectionX, sectionY, sectionZ, tick, attempts) % SECTION_VOLUME;
    attempts++;
    const local = refLocalFromIndex(index);
    const x = sectionX * 16 + local.localX;
    const y = sectionY * 16 + local.localY;
    const z = sectionZ * 16 + local.localZ;
    if (isEligible(x, y, z)) {
      out.push([x, y, z]);
    }
  }
  return out;
}

describe('RandomTickSelector golden equivalence (254 R5)', () => {
  const selector = new RandomTickSelector();

  it('hash32_6 equals the variadic hash32 over a wide value sweep', () => {
    for (let a = -3; a <= 3; a++) {
      for (let b = -300; b <= 300; b += 97) {
        for (let f = 0; f <= 800; f += 199) {
          expect(hash32_6(a, b, 7, -13, 42, f)).toBe(hash32(a, b, 7, -13, 42, f));
        }
      }
    }
  });

  it('selectForSection matches the reference hash sequence', () => {
    for (let t = 0; t < 40; t++) {
      for (const sx of [-3, 0, 4]) {
        for (const sz of [-7, 2]) {
          const got = selector.selectForSection(sx, 1, sz, 1000 + t, 1337);
          const want = [0, 1, 2].map(
            (attempt) =>
              refHash32(1337, sx, 1, sz, 1000 + t, attempt) % SECTION_VOLUME,
          );
          expect(got).toEqual(want);
        }
      }
    }
  });

  it('selectEligible sequences are bit-identical to the pre-254 implementation', () => {
    const predicates = {
      never: () => false,
      always: () => true,
      sparse: (x: number, y: number, z: number) => ((x * 31 + y * 17 + z * 13) & 63) === 0,
      rare: (x: number, y: number, z: number) => ((x * 7 + y * 11 + z * 5) & 255) === 1,
    };
    for (const seed of [1337, 0, -42]) {
      for (let tick = 0; tick < 25; tick += 6) {
        for (const sx of [-3, 0, 9]) {
          for (const sy of [-1, 0, 3]) {
            for (const sz of [-8, 5, 12]) {
              for (const p of Object.values(predicates)) {
                expect(selector.selectEligible(sx, sy, sz, tick, seed, p)).toEqual(
                  refSelectEligible(sx, sy, sz, tick, seed, p),
                );
              }
            }
          }
        }
      }
    }
  });
});
