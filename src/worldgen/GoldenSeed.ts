/**
 * Golden seed regression fixtures (102). `GoldenFixture` pins deterministic worldgen outputs
 * (hashes, terrain surface heights, surface block ids) for given seeds and coordinates,
 * including negatives. `verifyGoldenFixtures` computes each fixture's actual value per kind and
 * reports pass/fail without throwing, so future worldgen changes that alter pinned behavior are
 * caught by the suite. `createDefaultGoldenFixtures` returns the documented v1 set; the values
 * were generated once from the verified implementation (never hand-tuned).
 */

import { hash2, hash3 } from '../math/PRNG';

/** Fixture kinds: two/three-coordinate hashes, terrain surface height, block id at a cell. */
export type GoldenFixtureKind = 'hash2' | 'hash3' | 'surface' | 'block';

/** A pinned worldgen output for a seed and coordinates. */
export interface GoldenFixture {
  key: string;
  kind: GoldenFixtureKind;
  version: string;
  seed: number;
  x: number;
  /** Used by hash3 and block fixtures only. */
  y: number;
  z: number;
  /** The pinned value (uint32 hash, height, or block id). */
  expected: number;
}

/** The current golden fixture version. Future behavior changes must bump and re-pin. */
export const GOLDEN_VERSION = 'v1';

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** Validate an unknown value as a golden fixture; throws descriptively otherwise. */
export function validateGoldenFixture(input: unknown): GoldenFixture {
  if (typeof input !== 'object' || input === null) {
    throw new Error('GoldenSeed: fixture must be an object');
  }
  const r = input as Record<string, unknown>;
  if (typeof r.key !== 'string' || r.key.length === 0) {
    throw new Error('GoldenSeed: key must be a non-empty string');
  }
  if (r.kind !== 'hash2' && r.kind !== 'hash3' && r.kind !== 'surface' && r.kind !== 'block') {
    throw new Error(`GoldenSeed: kind must be one of hash2/hash3/surface/block, got ${String(r.kind)}`);
  }
  if (typeof r.version !== 'string' || r.version.length === 0) {
    throw new Error('GoldenSeed: version must be a non-empty string');
  }
  if (!isInteger(r.seed) || r.seed < 0) {
    throw new Error(`GoldenSeed: seed must be a non-negative integer, got ${String(r.seed)}`);
  }
  if (!isInteger(r.x) || !isInteger(r.y) || !isInteger(r.z)) {
    throw new Error('GoldenSeed: x/y/z must be integers');
  }
  if (!isInteger(r.expected) || r.expected < 0) {
    throw new Error(`GoldenSeed: expected must be a non-negative integer, got ${String(r.expected)}`);
  }
  return {
    key: r.key,
    kind: r.kind as GoldenFixtureKind,
    version: r.version,
    seed: r.seed as number,
    x: r.x as number,
    y: r.y as number,
    z: r.z as number,
    expected: r.expected as number,
  };
}

/** Registry of validated golden fixtures (duplicate/invalid rejection, no partial state). */
export class GoldenFixtureRegistry {
  private readonly fixtures = new Map<string, GoldenFixture>();

  register(fixture: GoldenFixture): void {
    const validated = validateGoldenFixture(fixture);
    if (this.fixtures.has(validated.key)) {
      throw new Error(`GoldenFixtureRegistry: duplicate key: ${validated.key}`);
    }
    this.fixtures.set(validated.key, validated);
  }

  get(key: string): GoldenFixture | null {
    return this.fixtures.get(key) ?? null;
  }

  has(key: string): boolean {
    return this.fixtures.has(key);
  }

  get size(): number {
    return this.fixtures.size;
  }

  /** All validated fixtures in registration order (102 extension). */
  all(): GoldenFixture[] {
    return [...this.fixtures.values()];
  }

  clear(): void {
    this.fixtures.clear();
  }
}

/** The world probes verification needs, backed by a seed-specific generator (e.g. TerrainGenerator). */
export interface GoldenWorldProbe {
  surfaceHeight(seed: number, x: number, z: number): number;
  blockAt(seed: number, x: number, y: number, z: number): number;
}

/** One verification result; mismatches are reported, never thrown. */
export interface GoldenFixtureResult {
  key: string;
  kind: GoldenFixtureKind;
  pass: boolean;
  actual: number;
}

/**
 * Verify fixtures against the current implementation. Per fixture in input order: hash2 and
 * hash3 use `math/PRNG` directly; surface/block use the probe. Mismatches produce
 * `pass: false` entries and never throw.
 */
export function verifyGoldenFixtures(fixtures: readonly GoldenFixture[], world: GoldenWorldProbe): GoldenFixtureResult[] {
  const results: GoldenFixtureResult[] = [];
  for (const fixture of fixtures) {
    let actual: number;
    switch (fixture.kind) {
      case 'hash2':
        actual = hash2(fixture.x, fixture.z, fixture.seed);
        break;
      case 'hash3':
        actual = hash3(fixture.x, fixture.y, fixture.z, fixture.seed);
        break;
      case 'surface':
        actual = world.surfaceHeight(fixture.seed, fixture.x, fixture.z);
        break;
      case 'block':
        actual = world.blockAt(fixture.seed, fixture.x, fixture.y, fixture.z);
        break;
    }
    results.push({ key: fixture.key, kind: fixture.kind, pass: actual === fixture.expected, actual });
  }
  return results;
}

/**
 * The documented v1 golden fixture set (12 fixtures): three hash2, three hash3, three surface,
 * three block across seeds {42, 1234, 9999} and positive/negative coordinates. Values pinned
 * from the verified implementation (see verification.md).
 */
export function createDefaultGoldenFixtures(): GoldenFixture[] {
  const f = (key: string, kind: GoldenFixtureKind, seed: number, x: number, y: number, z: number, expected: number): GoldenFixture => ({
    key,
    kind,
    version: GOLDEN_VERSION,
    seed,
    x,
    y,
    z,
    expected,
  });
  return [
    f('hash2/origin/42', 'hash2', 42, 0, 0, 0, 1973702734),
    f('hash2/far/9999', 'hash2', 9999, 100, 0, -50, 3132115612),
    f('hash2/negative/1234', 'hash2', 1234, -77, 0, 33, 672145738),
    f('hash3/depth/42', 'hash3', 42, 1, -64, 1, 848142630),
    f('hash3/negative/9999', 'hash3', 9999, -5, 30, -5, 2437147272),
    f('hash3/origin/1234', 'hash3', 1234, 0, 0, 0, 313676576),
    f('surface/origin/42', 'surface', 42, 0, 0, 0, 35),
    f('surface/far/1234', 'surface', 1234, 100, 0, -50, 34),
    f('surface/negative/9999', 'surface', 9999, -77, 0, 33, 29),
    f('block/origin/42', 'block', 42, 0, 35, 0, 1),
    f('block/far/1234', 'block', 1234, 100, 34, -50, 1),
    f('block/negative/9999', 'block', 9999, -77, 29, 33, 4),
  ];
}
