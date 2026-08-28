import { describe, it, expect } from 'vitest';
import { hash2, hash3 } from '../../src/math/PRNG';
import { createResourceId } from '../../src/data/ResourceId';
import {
  BlockId,
  BlockTypeRegistry,
  RenderCategory,
  createDefaultBlockRegistry,
  type BlockTypeDefinition,
} from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { TerrainGenerator } from '../../src/world/TerrainGenerator';
import {
  createDefaultStructureGenerator,
  createDefaultStructurePlacements,
  createDefaultStructureTemplates,
} from '../../src/worldgen/StructureGenerator';
import { StructureTemplateRegistry } from '../../src/worldgen/StructureTemplate';
import { StructurePlacementRegistry } from '../../src/worldgen/StructurePlacement';
import {
  PINNED_V2_MATRIX_HASH,
  PINNED_WORLDGEN_STATE_FINGERPRINT,
  SUPPORTED_WORLDGEN_MATRIX_VERSIONS,
  WORLDGEN_MATRIX_VERSION,
  createDefaultWorldgenMatrix,
  fingerprintWorldgenState,
  validateMatrixFixture,
  verifyWorldgenMatrix,
  worldgenMatrixHash,
  type MatrixFixture,
  type MatrixWorldProbe,
} from '../../src/worldgen/WorldgenRegressionMatrix';

/** A TerrainGenerator-backed probe (per-seed instances, chunk cache). */
class TerrainProbe implements MatrixWorldProbe {
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

  biomeAt(seed: number, x: number, z: number): string {
    return this.gen(seed).getBiomeAt(x, z);
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

  structurePresent(seed: number, chunkX: number, chunkZ: number): boolean {
    // The exact generator/context TerrainGenerator uses (its default third ctor arg).
    const structures = createDefaultStructureGenerator(seed);
    return structures.startAt(chunkX, chunkZ, {
      biomeKey: (x: number, z: number) => this.gen(seed).getBiomeAt(x, z),
      surfaceY: (x: number, z: number) => this.gen(seed).getHeightAt(x, z),
    }).length > 0;
  }
}

/** A probe wrapper whose `blockAt` throws at one exact coordinate. */
class ExplodingBlockProbe implements MatrixWorldProbe {
  private readonly inner: MatrixWorldProbe;
  private readonly boom: { x: number; y: number; z: number };

  constructor(inner: MatrixWorldProbe, boom: { x: number; y: number; z: number }) {
    this.inner = inner;
    this.boom = boom;
  }

  surfaceHeight(seed: number, x: number, z: number): number {
    return this.inner.surfaceHeight(seed, x, z);
  }

  biomeAt(seed: number, x: number, z: number): string {
    return this.inner.biomeAt(seed, x, z);
  }

  blockAt(seed: number, x: number, y: number, z: number): number {
    if (x === this.boom.x && y === this.boom.y && z === this.boom.z) {
      throw new Error(`synthetic probe failure at (${x}, ${y}, ${z})`);
    }
    return this.inner.blockAt(seed, x, y, z);
  }

  structurePresent(seed: number, chunkX: number, chunkZ: number): boolean {
    return this.inner.structurePresent(seed, chunkX, chunkZ);
  }
}

/** Minimal registry carrying only a generation-relevant coal_ore definition at `id`. */
function registryWithCoalOreAt(id: number): BlockTypeRegistry {
  const coalOre: BlockTypeDefinition = {
    id,
    resourceId: createResourceId('minecraft', 'coal_ore'),
    key: 'coal_ore',
    name: 'Coal Ore',
    solid: true,
    opaque: true,
    breakable: true,
    renderCategory: RenderCategory.Opaque,
    topTile: 16,
    bottomTile: 16,
    sideTile: 16,
    hardness: 2.4,
  };
  return new BlockTypeRegistry([coalOre]);
}

function defaultFingerprint(): string {
  return fingerprintWorldgenState({
    blockRegistry: createDefaultBlockRegistry(),
    templates: createDefaultStructureTemplates(),
    placements: createDefaultStructurePlacements(),
  });
}

const probe = new TerrainProbe();

describe('validateMatrixFixture', () => {
  it('accepts a fixture of every kind and returns the input unchanged', () => {
    const fixtures: MatrixFixture[] = [
      { key: 'hash2', kind: 'hash2', version: 'v2', seed: 42, x: 0, y: 0, z: 0, expected: 7 },
      { key: 'hash3', kind: 'hash3', version: 'v2', seed: 42, x: 0, y: 1, z: 0, expected: 7 },
      { key: 'surface', kind: 'surface', version: 'v2', seed: 42, x: 0, y: 0, z: 0, expected: 35 },
      { key: 'biome', kind: 'biome', version: 'v2', seed: 42, x: 0, y: 0, z: 0, expected: 'plains' },
      { key: 'block', kind: 'block', version: 'v2', seed: 42, x: 0, y: 30, z: 0, expected: 3 },
      { key: 'ore', kind: 'ore', version: 'v2', seed: 42, x: 0, y: 10, z: 0, expected: 14 },
      { key: 'cave', kind: 'cave', version: 'v2', seed: 42, x: 0, y: 20, z: 0, expected: 0 },
      { key: 'structure-present', kind: 'structure', version: 'v2', seed: 42, x: 0, y: 0, z: 0, expected: 'present' },
      { key: 'structure-absent', kind: 'structure', version: 'v2', seed: 42, x: 0, y: 0, z: 0, expected: 'absent' },
    ];
    for (const f of fixtures) {
      expect(validateMatrixFixture(f)).toEqual(f);
    }
  });

  it('rejects malformed fixtures naming the offending field', () => {
    const base: MatrixFixture = { key: 'k', kind: 'hash2', version: 'v2', seed: 42, x: 0, y: 0, z: 0, expected: 0 };
    expect(() => validateMatrixFixture({ ...base, key: '' })).toThrow(/key/i);
    expect(() => validateMatrixFixture({ ...base, version: '' })).toThrow(/version/i);
    expect(() => validateMatrixFixture({ ...base, kind: 'hash4' })).toThrow(/kind/i);
    expect(() => validateMatrixFixture({ ...base, seed: -1 })).toThrow(/seed/i);
    expect(() => validateMatrixFixture({ ...base, seed: 1.5 })).toThrow(/seed/i);
    expect(() => validateMatrixFixture({ ...base, x: 0.5 })).toThrow(/x\/y\/z/i);
    expect(() => validateMatrixFixture({ ...base, y: 0.5 })).toThrow(/x\/y\/z/i);
    expect(() => validateMatrixFixture({ ...base, z: 0.5 })).toThrow(/x\/y\/z/i);
    expect(() => validateMatrixFixture({ ...base, kind: 'biome', expected: 1 })).toThrow(/expected/i);
    expect(() => validateMatrixFixture({ ...base, kind: 'structure', expected: 1 })).toThrow(/expected/i);
    expect(() => validateMatrixFixture({ ...base, expected: -1 })).toThrow(/expected/i);
    expect(() => validateMatrixFixture({ ...base, expected: 0.5 })).toThrow(/expected/i);
  });

  it('rejects versions outside SUPPORTED_WORLDGEN_MATRIX_VERSIONS', () => {
    const base: MatrixFixture = { key: 'k', kind: 'hash2', version: 'v9', seed: 42, x: 0, y: 0, z: 0, expected: 0 };
    expect(() => validateMatrixFixture(base)).toThrow(/v9/);
    expect(() => validateMatrixFixture(base)).toThrow(/SUPPORTED_WORLDGEN_MATRIX_VERSIONS/);
    expect(SUPPORTED_WORLDGEN_MATRIX_VERSIONS).toEqual(['v2']);
  });
});

describe('verifyWorldgenMatrix per-kind computation', () => {
  it('passes fixtures of every kind whose expected matches the probe output', () => {
    const seed = 7;
    const x = 32;
    const z = -48;
    const h = probe.surfaceHeight(seed, x, z);
    const fixtures: MatrixFixture[] = [
      { key: 'hash2', kind: 'hash2', version: 'v2', seed, x, y: 0, z, expected: hash2(x, z, seed) },
      { key: 'hash3', kind: 'hash3', version: 'v2', seed, x, y: 12, z, expected: hash3(x, 12, z, seed) },
      { key: 'surface', kind: 'surface', version: 'v2', seed, x, y: 0, z, expected: h },
      { key: 'biome', kind: 'biome', version: 'v2', seed, x, y: 0, z, expected: probe.biomeAt(seed, x, z) },
      { key: 'block', kind: 'block', version: 'v2', seed, x, y: h - 1, z, expected: probe.blockAt(seed, x, h - 1, z) },
      { key: 'ore', kind: 'ore', version: 'v2', seed, x: x + 1, y: 10, z, expected: probe.blockAt(seed, x + 1, 10, z) },
      { key: 'cave', kind: 'cave', version: 'v2', seed, x: x + 2, y: 20, z, expected: probe.blockAt(seed, x + 2, 20, z) },
    ];
    for (const f of fixtures) {
      expect(validateMatrixFixture(f)).toEqual(f);
    }
    const results = verifyWorldgenMatrix(fixtures, probe);
    expect(results.map((r) => r.pass)).toEqual([true, true, true, true, true, true, true]);
    for (let i = 0; i < fixtures.length; i++) {
      expect(results[i]!.actual).toBe(fixtures[i]!.expected);
    }
  });

  it('verifies structurePresent fixtures through the real generator/context', () => {
    // The pinned v2 present/absent structure columns for seed 42.
    const present = { x: -552, z: 648 };
    const absent = { x: -632, z: -632 };
    const fixtures: MatrixFixture[] = [
      {
        key: 'structure/present',
        kind: 'structure',
        version: 'v2',
        seed: 42,
        x: present.x,
        y: 0,
        z: present.z,
        expected: probe.structurePresent(42, Math.floor(present.x / 16), Math.floor(present.z / 16))
          ? 'present'
          : 'absent',
      },
      {
        key: 'structure/absent',
        kind: 'structure',
        version: 'v2',
        seed: 42,
        x: absent.x,
        y: 0,
        z: absent.z,
        expected: probe.structurePresent(42, Math.floor(absent.x / 16), Math.floor(absent.z / 16))
          ? 'present'
          : 'absent',
      },
    ];
    const results = verifyWorldgenMatrix(fixtures, probe);
    expect(results.map((r) => r.actual)).toEqual(['present', 'absent']);
    expect(results.every((r) => r.pass)).toBe(true);
  });
});

describe('full pinned v2 catalog', () => {
  it('validates every catalog fixture', () => {
    const catalog = createDefaultWorldgenMatrix();
    expect(catalog.length).toBeGreaterThan(0);
    for (const f of catalog) {
      expect(validateMatrixFixture(f)).toEqual(f);
    }
  });

  it('verifies green against the terrain probe with the pinned hash and fingerprint', () => {
    const catalog = createDefaultWorldgenMatrix();
    const results = verifyWorldgenMatrix(catalog, probe);
    expect(results.length).toBe(catalog.length);
    expect(results.filter((r) => !r.pass)).toEqual([]);
    expect(worldgenMatrixHash(catalog, probe)).toBe(PINNED_V2_MATRIX_HASH);
    expect(defaultFingerprint()).toBe(PINNED_WORLDGEN_STATE_FINGERPRINT);
  });
});

describe('worldgenMatrixHash stability and sensitivity', () => {
  it('is stable across repeated calls on the same probe', () => {
    const catalog = createDefaultWorldgenMatrix();
    expect(worldgenMatrixHash(catalog, probe)).toBe(worldgenMatrixHash(catalog, probe));
  });

  it('changes when a single probe seam shifts', () => {
    const catalog = createDefaultWorldgenMatrix();
    const baseline = worldgenMatrixHash(catalog, probe);
    const shifted: MatrixWorldProbe = {
      surfaceHeight: (seed, x, z) => probe.surfaceHeight(seed, x, z) + 1,
      biomeAt: (seed, x, z) => probe.biomeAt(seed, x, z),
      blockAt: (seed, x, y, z) => probe.blockAt(seed, x, y, z),
      structurePresent: (seed, chunkX, chunkZ) => probe.structurePresent(seed, chunkX, chunkZ),
    };
    expect(worldgenMatrixHash(catalog, shifted)).not.toBe(baseline);
  });
});

describe('fingerprintWorldgenState stability and sensitivity', () => {
  it('is stable for identical default state', () => {
    expect(defaultFingerprint()).toBe(defaultFingerprint());
  });

  it('changes when a generation-relevant block id is remapped', () => {
    const remapped = fingerprintWorldgenState({
      blockRegistry: registryWithCoalOreAt(99),
      templates: createDefaultStructureTemplates(),
      placements: createDefaultStructurePlacements(),
    });
    expect(remapped).not.toBe(defaultFingerprint());
  });

  it('changes when a template block set changes', () => {
    const altered = new StructureTemplateRegistry();
    const well = createDefaultStructureTemplates().all()[0]!;
    altered.register({ ...well, blocks: [...well.blocks, { x: 2, y: 2, z: 2, blockId: BlockId.Cobblestone }] });
    const alteredFingerprint = fingerprintWorldgenState({
      blockRegistry: createDefaultBlockRegistry(),
      templates: altered,
      placements: createDefaultStructurePlacements(),
    });
    expect(alteredFingerprint).not.toBe(defaultFingerprint());
  });

  it('changes when a placement spacing changes', () => {
    const altered = new StructurePlacementRegistry();
    const config = createDefaultStructurePlacements().all()[0]!;
    altered.register({ ...config, spacing: config.spacing + 1 });
    const alteredFingerprint = fingerprintWorldgenState({
      blockRegistry: createDefaultBlockRegistry(),
      templates: createDefaultStructureTemplates(),
      placements: altered,
    });
    expect(alteredFingerprint).not.toBe(defaultFingerprint());
  });
});

describe('mismatch reporting', () => {
  it('reports a tampered fixture as failed without throwing and keeps other entries', () => {
    const catalog = createDefaultWorldgenMatrix();
    const tampered = catalog.map((f) => ({ ...f }));
    const target = tampered.find((f) => f.kind === 'surface')!;
    const originalExpected = target.expected;
    target.expected = (target.expected as number) + 1;

    let results: ReturnType<typeof verifyWorldgenMatrix> = [];
    expect(() => {
      results = verifyWorldgenMatrix(tampered, probe);
    }).not.toThrow();

    expect(results.length).toBe(tampered.length);
    const failed = results.filter((r) => !r.pass);
    expect(failed.length).toBe(1);
    expect(failed[0]).toMatchObject({ key: target.key, kind: 'surface', pass: false, actual: originalExpected });
    expect(failed[0]!.error).toBeUndefined();
    expect(results.filter((r) => r.pass).length).toBe(catalog.length - 1);
  });
});

describe('probe-error surfacing', () => {
  it('surfaces a thrown probe error as a failed entry and continues verification', () => {
    const catalog = createDefaultWorldgenMatrix();
    const target = catalog.find((f) => f.kind === 'block')!;
    const failing = new ExplodingBlockProbe(probe, { x: target.x, y: target.y, z: target.z });

    let results: ReturnType<typeof verifyWorldgenMatrix> = [];
    expect(() => {
      results = verifyWorldgenMatrix(catalog, failing);
    }).not.toThrow();

    expect(results.length).toBe(catalog.length);
    const failed = results.filter((r) => !r.pass);
    expect(failed.length).toBe(1);
    expect(failed[0]!.key).toBe(target.key);
    expect(failed[0]!.pass).toBe(false);
    expect(failed[0]!.actual).toBeNull();
    expect(failed[0]!.error).toContain('synthetic probe failure');
    // Verification continued over the rest of the catalog.
    expect(results.filter((r) => r.key !== target.key).length).toBe(catalog.length - 1);
    expect(results.filter((r) => r.key !== target.key).every((r) => r.error === undefined)).toBe(true);
  });
});

describe('determinism across fresh probes', () => {
  it('produces identical reports and hash on fresh probe instances', () => {
    const catalog = createDefaultWorldgenMatrix();
    const a = new TerrainProbe();
    const b = new TerrainProbe();
    const reportA = verifyWorldgenMatrix(catalog, a);
    const reportB = verifyWorldgenMatrix(catalog, b);
    expect(reportB).toEqual(reportA);
    expect(worldgenMatrixHash(catalog, b)).toBe(worldgenMatrixHash(catalog, a));
  });
});

describe('version policy', () => {
  it('pins the current version to v2 (bumped for the 2026-08-22 worldgen depth pipeline change) and rejects unsupported versions', () => {
    expect(WORLDGEN_MATRIX_VERSION).toBe('v2');
    expect(SUPPORTED_WORLDGEN_MATRIX_VERSIONS).toEqual(['v2']);
    expect(() => createDefaultWorldgenMatrix('v9')).toThrow(/v9/);
  });

  it('stamps every catalog fixture with the current supported version', () => {
    const catalog = createDefaultWorldgenMatrix();
    expect(catalog.every((f) => f.version === WORLDGEN_MATRIX_VERSION)).toBe(true);
    expect(catalog.every((f) => SUPPORTED_WORLDGEN_MATRIX_VERSIONS.includes(f.version))).toBe(true);
    expect(() => validateMatrixFixture({ ...catalog[0]!, version: 'v9' })).toThrow(/version/i);
  });
});

describe('catalog bounds and determinism', () => {
  it('has a bounded size and constructs identically', () => {
    const a = createDefaultWorldgenMatrix();
    const b = createDefaultWorldgenMatrix();
    expect(a.length).toBeGreaterThanOrEqual(24);
    expect(a.length).toBeLessThanOrEqual(40);
    expect(b).toEqual(a);
  });
});

describe('pinned catalog coverage', () => {
  it('covers exactly the documented seeds with surface and block fixtures per seed', () => {
    const catalog = createDefaultWorldgenMatrix();
    const seeds = [0, 1, 42, 1337, 1234, 9999];
    expect(new Set(catalog.map((f) => f.seed))).toEqual(new Set(seeds));
    for (const seed of seeds) {
      const forSeed = catalog.filter((f) => f.seed === seed);
      expect(forSeed.some((f) => f.kind === 'surface')).toBe(true);
      expect(forSeed.some((f) => f.kind === 'block')).toBe(true);
      expect(forSeed.some((f) => f.kind === 'biome')).toBe(true);
    }
  });

  it('spans origin, negative, far-positive, and chunk-boundary coordinates', () => {
    const catalog = createDefaultWorldgenMatrix();
    expect(catalog.some((f) => f.x === 0 && f.z === 0)).toBe(true);
    expect(catalog.some((f) => f.x < 0 || f.z < 0)).toBe(true);
    expect(catalog.some((f) => f.x > 100 || f.z > 100)).toBe(true);
    expect(catalog.some((f) => f.x % 16 === 0 && f.z % 16 === 0)).toBe(true);
  });

  it('samples y=0, ore-band, cave-band, and surface-adjacent depths', () => {
    const catalog = createDefaultWorldgenMatrix();
    expect(catalog.some((f) => f.y === 0)).toBe(true);
    expect(catalog.some((f) => f.kind === 'ore' && f.y > 0 && f.y < 32)).toBe(true);
    expect(catalog.some((f) => f.kind === 'cave' && f.y > 0 && f.y < 32)).toBe(true);
    // A block fixture sampled exactly one below its column's pinned surface height.
    const surfaceAdjacent = catalog.some(
      (b) =>
        b.kind === 'block' &&
        catalog.some(
          (s) =>
            s.kind === 'surface' && s.seed === b.seed && s.x === b.x && s.z === b.z && b.y === (s.expected as number) - 1,
        ),
    );
    expect(surfaceAdjacent).toBe(true);
  });

  it('covers all four biomes plus plains at spawn origin', () => {
    const catalog = createDefaultWorldgenMatrix();
    const biomes = catalog.filter((f) => f.kind === 'biome');
    expect(new Set(biomes.map((f) => f.expected))).toEqual(new Set(['plains', 'forest', 'desert', 'taiga']));
    expect(biomes.some((f) => f.x === 0 && f.z === 0 && f.expected === 'plains')).toBe(true);
  });

  it('covers structures, ores, caves, and every golden-seed kind without vegetation keys', () => {
    const catalog = createDefaultWorldgenMatrix();
    const kinds = new Set(catalog.map((f) => f.kind));
    for (const kind of ['hash2', 'hash3', 'surface', 'block'] as const) {
      expect(kinds.has(kind)).toBe(true);
    }
    const structures = catalog.filter((f) => f.kind === 'structure');
    expect(structures.some((f) => f.expected === 'present')).toBe(true);
    expect(structures.some((f) => f.expected === 'absent')).toBe(true);

    const oreExpecteds = new Set(catalog.filter((f) => f.kind === 'ore').map((f) => f.expected));
    expect(oreExpecteds.has(BlockId.CoalOre)).toBe(true);
    expect(oreExpecteds.has(BlockId.IronOre)).toBe(true);
    expect(oreExpecteds.has(BlockId.Stone)).toBe(true);

    const caveExpecteds = new Set(catalog.filter((f) => f.kind === 'cave').map((f) => f.expected));
    expect(caveExpecteds.has(BlockId.Air)).toBe(true);
    expect(caveExpecteds.has(BlockId.Stone)).toBe(true);

    expect(catalog.every((f) => !/tree|leave|vegetation/i.test(f.key))).toBe(true);
  });
});

describe('boundary seeds and coordinates end-to-end', () => {
  it('validates and verifies boundary seeds and coordinates against the probe', () => {
    const boundarySeed = 2147483646; // just under 2^31 - 1
    const hFar = probe.surfaceHeight(boundarySeed, 100000, 100000);
    const hNeg = probe.surfaceHeight(0, -16, -16);
    const cases: Array<{ key: string; kind: MatrixFixture['kind']; seed: number; x: number; y: number; z: number }> = [
      { key: 'boundary/hash2/negative-x', kind: 'hash2', seed: boundarySeed, x: -100000, y: 0, z: 16 },
      { key: 'boundary/hash3/far-positive', kind: 'hash3', seed: boundarySeed, x: 100000, y: 60, z: 16 },
      { key: 'boundary/surface/far-positive', kind: 'surface', seed: boundarySeed, x: 100000, y: 0, z: 100000 },
      { key: 'boundary/biome/chunk-boundary', kind: 'biome', seed: boundarySeed, x: 16, y: 0, z: -16 },
      { key: 'boundary/block/y0-chunk-boundary', kind: 'block', seed: 0, x: -16, y: 0, z: -16 },
      { key: 'boundary/block/below-surface', kind: 'block', seed: 0, x: -16, y: hNeg - 1, z: -16 },
      { key: 'boundary/block/boundary-seed-below-surface', kind: 'block', seed: boundarySeed, x: 100000, y: hFar - 1, z: 100000 },
    ];
    const fixtures: MatrixFixture[] = cases.map((c) => ({
      ...c,
      version: WORLDGEN_MATRIX_VERSION,
      expected:
        c.kind === 'hash2'
          ? hash2(c.x, c.z, c.seed)
          : c.kind === 'hash3'
            ? hash3(c.x, c.y, c.z, c.seed)
            : c.kind === 'surface'
              ? probe.surfaceHeight(c.seed, c.x, c.z)
              : c.kind === 'biome'
                ? probe.biomeAt(c.seed, c.x, c.z)
                : probe.blockAt(c.seed, c.x, c.y, c.z),
    }));

    for (const f of fixtures) {
      expect(validateMatrixFixture(f)).toEqual(f);
    }
    let results: ReturnType<typeof verifyWorldgenMatrix> = [];
    expect(() => {
      results = verifyWorldgenMatrix(fixtures, probe);
    }).not.toThrow();
    expect(results.length).toBe(fixtures.length);
    expect(results.every((r) => r.pass)).toBe(true);
  });
});
