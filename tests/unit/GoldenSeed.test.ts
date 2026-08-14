import { describe, it, expect } from 'vitest';
import { hash2, hash3 } from '../../src/math/PRNG';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { TerrainGenerator } from '../../src/world/TerrainGenerator';
import {
  createDefaultGoldenFixtures,
  GOLDEN_VERSION,
  GoldenFixtureRegistry,
  validateGoldenFixture,
  verifyGoldenFixtures,
  type GoldenFixture,
  type GoldenWorldProbe,
} from '../../src/worldgen/GoldenSeed';

/** A TerrainGenerator-backed probe (per-seed instances, chunk cache). */
class TerrainProbe implements GoldenWorldProbe {
  private readonly registry = createDefaultBlockRegistry();
  private readonly generators = new Map<number, TerrainGenerator>();
  private readonly chunks = new Map<string, Chunk>();

  private gen(seed: number): TerrainGenerator {
    let g = this.generators.get(seed);
    if (!g) {
      g = new TerrainGenerator(this.registry, seed);
      this.generators.set(seed, g);
    }
    return g;
  }

  surfaceHeight(seed: number, x: number, z: number): number {
    return this.gen(seed).getHeightAt(x, z);
  }

  blockAt(seed: number, x: number, y: number, z: number): number {
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const key = `${seed}:${cx}:${cz}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, 0, cz);
      this.gen(seed).generateChunk(chunk);
      this.chunks.set(key, chunk);
    }
    return chunk.getLocal(x - cx * 16, y, z - cz * 16);
  }
}

const probe = new TerrainProbe();

describe('validateGoldenFixture', () => {
  it('accepts a fixture of every kind', () => {
    const kinds: Array<GoldenFixture['kind']> = ['hash2', 'hash3', 'surface', 'block'];
    for (const kind of kinds) {
      const fixture: GoldenFixture = { key: kind, kind, version: 'v1', seed: 42, x: 0, y: 0, z: 0, expected: 0 };
      expect(validateGoldenFixture(fixture)).toEqual(fixture);
    }
  });

  it('rejects malformed fixtures naming the field', () => {
    const base: GoldenFixture = { key: 'k', kind: 'hash2', version: 'v1', seed: 42, x: 0, y: 0, z: 0, expected: 1 };
    expect(() => validateGoldenFixture({ ...base, key: '' })).toThrow(/key/i);
    expect(() => validateGoldenFixture({ ...base, kind: 'hash4' })).toThrow(/kind/i);
    expect(() => validateGoldenFixture({ ...base, version: '' })).toThrow(/version/i);
    expect(() => validateGoldenFixture({ ...base, seed: -1 })).toThrow(/seed/i);
    expect(() => validateGoldenFixture({ ...base, seed: 1.5 })).toThrow(/seed/i);
    expect(() => validateGoldenFixture({ ...base, x: 1.5 })).toThrow(/x\/y\/z/i);
    expect(() => validateGoldenFixture({ ...base, y: 'a' })).toThrow(/x\/y\/z/i);
    expect(() => validateGoldenFixture({ ...base, expected: -1 })).toThrow(/expected/i);
    expect(() => validateGoldenFixture(null)).toThrow(/object/i);
  });
});

describe('GoldenFixtureRegistry', () => {
  it('registers, gets, checks, sizes, lists, and clears', () => {
    const registry = new GoldenFixtureRegistry();
    const a: GoldenFixture = { key: 'a', kind: 'hash2', version: 'v1', seed: 1, x: 0, y: 0, z: 0, expected: 1 };
    const b: GoldenFixture = { key: 'b', kind: 'surface', version: 'v1', seed: 2, x: 1, y: 0, z: 1, expected: 2 };
    registry.register(a);
    registry.register(b);
    expect(registry.get('a')).toEqual(a);
    expect(registry.has('a')).toBe(true);
    expect(registry.has('c')).toBe(false);
    expect(registry.size).toBe(2);
    expect(registry.all()).toEqual([a, b]);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.get('a')).toBeNull();
  });

  it('rejects duplicates and invalid fixtures atomically', () => {
    const registry = new GoldenFixtureRegistry();
    const a: GoldenFixture = { key: 'a', kind: 'hash2', version: 'v1', seed: 1, x: 0, y: 0, z: 0, expected: 1 };
    registry.register(a);

    expect(() => registry.register(a)).toThrow(/duplicate/i);
    expect(() => registry.register({ ...a, key: 'b', seed: -1 })).toThrow(/seed/i);
    expect(registry.size).toBe(1);
    expect(registry.has('b')).toBe(false);
  });
});

describe('verifyGoldenFixtures', () => {
  it('matches hash fixtures against direct hash calls', () => {
    const fixtures: GoldenFixture[] = [
      { key: 'h2', kind: 'hash2', version: 'v1', seed: 42, x: 0, y: 0, z: 0, expected: hash2(0, 0, 42) },
      { key: 'h2n', kind: 'hash2', version: 'v1', seed: 9999, x: -77, y: 0, z: 33, expected: hash2(-77, 33, 9999) },
      { key: 'h3', kind: 'hash3', version: 'v1', seed: 1234, x: 1, y: -64, z: 1, expected: hash3(1, -64, 1, 1234) },
    ];
    const results = verifyGoldenFixtures(fixtures, probe);
    expect(results).toEqual([
      { key: 'h2', kind: 'hash2', pass: true, actual: hash2(0, 0, 42) },
      { key: 'h2n', kind: 'hash2', pass: true, actual: hash2(-77, 33, 9999) },
      { key: 'h3', kind: 'hash3', pass: true, actual: hash3(1, -64, 1, 1234) },
    ]);
  });

  it('the full default v1 set passes against the terrain probe', () => {
    const results = verifyGoldenFixtures(createDefaultGoldenFixtures(), probe);
    expect(results.length).toBe(12);
    expect(results.every((r) => r.pass)).toBe(true);
    expect(results.every((r) => r.actual >= 0)).toBe(true);
  });

  it('reports mismatches without throwing', () => {
    const fixtures: GoldenFixture[] = [
      { key: 'h2', kind: 'hash2', version: 'v1', seed: 42, x: 0, y: 0, z: 0, expected: 0 },
      { key: 'surface', kind: 'surface', version: 'v1', seed: 42, x: 0, y: 0, z: 0, expected: 0 },
    ];
    let results: ReturnType<typeof verifyGoldenFixtures> = [];
    expect(() => {
      results = verifyGoldenFixtures(fixtures, probe);
    }).not.toThrow();
    expect(results[0]).toEqual({ key: 'h2', kind: 'hash2', pass: false, actual: hash2(0, 0, 42) });
    expect(results[1]).toEqual({ key: 'surface', kind: 'surface', pass: false, actual: 35 });
  });

  it('is deterministic for identical inputs', () => {
    const fixtures = createDefaultGoldenFixtures();
    const a = verifyGoldenFixtures(fixtures, probe);
    const b = verifyGoldenFixtures(fixtures, probe);
    expect(b).toEqual(a);
  });
});

describe('createDefaultGoldenFixtures', () => {
  it('returns the documented v1 set deterministically', () => {
    const a = createDefaultGoldenFixtures();
    const b = createDefaultGoldenFixtures();
    expect(a.length).toBe(12);
    expect(a.every((f) => f.version === GOLDEN_VERSION)).toBe(true);
    expect(new Set(a.map((f) => f.kind))).toEqual(new Set(['hash2', 'hash3', 'surface', 'block']));
    expect(new Set(a.map((f) => f.seed))).toEqual(new Set([42, 1234, 9999]));
    expect(b).toEqual(a);
    // Every default fixture passes its own validation.
    for (const f of a) {
      expect(validateGoldenFixture(f)).toEqual(f);
    }
  });
});
