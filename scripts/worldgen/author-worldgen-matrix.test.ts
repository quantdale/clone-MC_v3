import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Chunk } from '../../src/world/Chunk';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { TerrainGenerator } from '../../src/world/TerrainGenerator';
import { createDefaultStructureGenerator } from '../../src/worldgen/StructureGenerator';
import {
  createDefaultStructureTemplates,
  createDefaultStructurePlacements,
} from '../../src/worldgen/StructureGenerator';
import {
  verifyWorldgenMatrix,
  worldgenMatrixHash,
  fingerprintWorldgenState,
  type MatrixFixture,
  type MatrixWorldProbe,
} from '../../src/worldgen/WorldgenRegressionMatrix';

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

/** Is `structures` public on TerrainGenerator? Fallback accessor if not. */
function structurePresentVia(probe: TerrainProbe, seed: number, cx: number, cz: number): boolean {
  return probe.structurePresent(seed, cx, cz);
}

describe('author worldgen matrix pins', () => {
  it('discovers and emits the v1 catalog', () => {
    const probe = new TerrainProbe();
    const SEEDS = [0, 1, 42, 1337, 1234, 9999];
    const fixtures: MatrixFixture[] = [];
    const f = (
      key: string,
      kind: MatrixFixture['kind'],
      seed: number,
      x: number,
      y: number,
      z: number,
      expected: number | string,
    ): void => {
      fixtures.push({ key, kind, version: 'v1', seed, x, y, z, expected });
    };

    // --- hash continuity (102 seams + boundary seed 0) ---
    f('hash2/origin/42', 'hash2', 42, 0, 0, 0, 1973702734);
    f('hash2/negative/1234', 'hash2', 1234, -77, 0, 33, 672145738);
    f('hash2/boundary-seed/0', 'hash2', 0, 48, 0, 64, 0); // placeholder, filled below
    f('hash3/depth/42', 'hash3', 42, 1, -64, 1, 848142630);
    f('hash3/negative/9999', 'hash3', 9999, -5, 30, -5, 2437147272);
    f('hash3/boundary-seed/0', 'hash3', 0, 48, 12, 64, 0);

    // Fill hash placeholders from PRNG-equivalent probe outputs (verify computes them directly).
    // We recompute using the same formulas via verification later; here compute via a temp fixture.
    const tmpHash2 = verifyWorldgenMatrix(
      [{ key: 't', kind: 'hash2', version: 'v1', seed: 0, x: 48, y: 0, z: 64, expected: 0 }],
      probe,
    )[0]!.actual as number;
    const tmpHash3 = verifyWorldgenMatrix(
      [{ key: 't', kind: 'hash3', version: 'v1', seed: 0, x: 48, y: 12, z: 64, expected: 0 }],
      probe,
    )[0]!.actual as number;
    fixtures[2]!.expected = tmpHash2;
    fixtures[5]!.expected = tmpHash3;

    // --- biome discovery: all four ids outside the spawn radius ---
    const BIOMES = ['forest', 'desert', 'taiga'] as const;
    const found = new Map<string, { seed: number; x: number; z: number }>();
    outer: for (const seed of SEEDS) {
      for (let x = -512; x <= 512; x += 16) {
        for (let z = -512; z <= 512; z += 16) {
          if (Math.hypot(x, z) <= 48) continue;
          const b = probe.biomeAt(seed, x, z);
          if (b !== 'plains' && !found.has(b)) {
            found.set(b, { seed, x, z });
            if (found.size === BIOMES.length) break outer;
          }
        }
      }
    }
    f('biome/spawn-origin/42', 'biome', 42, 0, 0, 0, 'plains');
    for (const b of BIOMES) {
      const p = found.get(b)!;
      f(`biome/${b}/${p.seed}`, 'biome', p.seed, p.x, 0, p.z, b);
    }

    // --- surface + block per seed (block sampled just below the surface) ---
    for (const seed of SEEDS) {
      const col =
        [...found.values()].find((p) => p.seed === seed) ??
        (seed === 42 ? { seed, x: 0, z: 0 } : { seed, x: 16 * seed, z: -16 });
      const h = probe.surfaceHeight(seed, col.x, col.z);
      f(`surface/${seed}`, 'surface', seed, col.x, 0, col.z, h);
      f(`block/surface/${seed}`, 'block', seed, col.x, h - 1, col.z, probe.blockAt(seed, col.x, h - 1, col.z));
    }

    // Per-seed biome coverage (fixtures spec: every seed >=1 surface+block+biome).
    for (const seed of SEEDS) {
      if ([...found.values()].some((p) => p.seed === seed)) continue;
      const col =
        seed === 42
          ? { x: 0, z: 0 }
          : { x: 16 * seed, z: -16 };
      f(`biome/${seed}`, 'biome', seed, col.x, 0, col.z, probe.biomeAt(seed, col.x, col.z));
    }

    // --- extra block coverage: bedrock, deep stone, chunk-boundary column ---
    f('block/bedrock/0', 'block', 0, 0, 0, 0, BlockId.Bedrock);
    f('block/boundary-column/1337', 'block', 1337, 48, 10, 64, probe.blockAt(1337, 48, 10, 64));

    // --- ore discovery: coal, iron, stone control ---
    let coal: { seed: number; x: number; y: number; z: number } | null = null;
    let iron: { seed: number; x: number; y: number; z: number } | null = null;
    let stoneCtl: { seed: number; x: number; y: number; z: number } | null = null;
    outerOre: for (const seed of SEEDS) {
      for (let x = -256; x <= 256; x += 8) {
        for (let z = -256; z <= 256; z += 8) {
          if (Math.hypot(x, z) <= 48) continue;
          const h = probe.surfaceHeight(seed, x, z);
          const top = Math.min(h - 3, 31);
          for (let y = 3; y < top; y++) {
            const b = probe.blockAt(seed, x, y, z);
            if (b === BlockId.CoalOre && !coal) coal = { seed, x, y, z };
            if (b === BlockId.IronOre && !iron) iron = { seed, x, y, z };
            if (b === BlockId.Stone && !stoneCtl) stoneCtl = { seed, x, y, z };
            if (coal && iron && stoneCtl) break outerOre;
          }
        }
      }
    }
    if (!coal || !iron || !stoneCtl) throw new Error('ore discovery failed');
    f(`ore/coal/${coal.seed}`, 'ore', coal.seed, coal.x, coal.y, coal.z, BlockId.CoalOre);
    f(`ore/iron/${iron.seed}`, 'ore', iron.seed, iron.x, iron.y, iron.z, BlockId.IronOre);
    f(`ore/no-ore-control/${stoneCtl.seed}`, 'ore', stoneCtl.seed, stoneCtl.x, stoneCtl.y, stoneCtl.z, BlockId.Stone);

    // --- cave discovery: carved air + not-carved solid control ---
    let carved: { seed: number; x: number; y: number; z: number } | null = null;
    let solidCtl: { seed: number; x: number; y: number; z: number } | null = null;
    outerCave: for (const seed of SEEDS) {
      for (let x = -256; x <= 256; x += 8) {
        for (let z = -256; z <= 256; z += 8) {
          if (Math.hypot(x, z) <= 48) continue;
          const h = probe.surfaceHeight(seed, x, z);
          const top = Math.min(h - 3, 31);
          for (let y = 2; y < top; y++) {
            const b = probe.blockAt(seed, x, y, z);
            if (b === BlockId.Air && !carved) carved = { seed, x, y, z };
            if ((b === BlockId.Stone || b === BlockId.Dirt) && !solidCtl &&
              !(carved && carved.seed === seed && carved.x === x && carved.y === y && carved.z === z)) {
              solidCtl = { seed, x, y, z };
            }
            if (carved && solidCtl) break outerCave;
          }
        }
      }
    }
    if (!carved || !solidCtl) throw new Error('cave discovery failed');
    f(`cave/carved/${carved.seed}`, 'cave', carved.seed, carved.x, carved.y, carved.z, BlockId.Air);
    f(`cave/not-carved-control/${solidCtl.seed}`, 'cave', solidCtl.seed, solidCtl.x, solidCtl.y, solidCtl.z, solidCtlSeedBlock(probe, solidCtl));

    function solidCtlSeedBlock(p: TerrainProbe, c: { seed: number; x: number; y: number; z: number }): number {
      return p.blockAt(c.seed, c.x, c.y, c.z);
    }

    // --- structure present/absent (exact generator/context TerrainGenerator uses) ---
    let present: { seed: number; cx: number; cz: number } | null = null;
    let absent: { seed: number; cx: number; cz: number } | null = null;
    outerStruct: for (const seed of [42, 1337, 0, 1, 1234, 9999]) {
      for (let cx = -40; cx <= 40; cx++) {
        for (let cz = -40; cz <= 40; cz++) {
          const has = structurePresentVia(probe, seed, cx, cz);
          if (has && !present) present = { seed, cx, cz };
          if (!has && !absent) absent = { seed, cx, cz };
          if (present && absent) break outerStruct;
        }
      }
    }
    if (!present || !absent) throw new Error('structure discovery failed');
    f(`structure/present/${present.seed}`, 'structure', present.seed, present.cx * 16 + 8, 0, present.cz * 16 + 8, 'present');
    f(`structure/absent/${absent.seed}`, 'structure', absent.seed, absent.cx * 16 + 8, 0, absent.cz * 16 + 8, 'absent');

    // --- emit pins ---
    const results = verifyWorldgenMatrix(fixtures, probe);
    const failures = results.filter((r) => !r.pass);
    if (failures.length > 0) {
      throw new Error(`catalog self-check failed: ${JSON.stringify(failures)}`);
    }
    const hash = worldgenMatrixHash(fixtures, probe);
    const fingerprint = fingerprintWorldgenState({
      blockRegistry: createDefaultBlockRegistry(),
      templates: createDefaultStructureTemplates(),
      placements: createDefaultStructurePlacements(),
    });
    writeFileSync(
      'scripts/_worldgen-matrix-pins.json',
      JSON.stringify({ count: fixtures.length, hash, fingerprint, fixtures }, null, 2),
    );
    console.log(`AUTHOR_OK count=${fixtures.length} hash=${hash} fingerprint=${fingerprint}`);
  });
});
