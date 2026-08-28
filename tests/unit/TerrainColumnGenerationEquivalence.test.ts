import { describe, expect, it } from 'vitest';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { TerrainGenerator } from '../../src/world/TerrainGenerator';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { VerticalWorldAccess } from '../../src/world/VerticalWorldAccess';
import { Chunk } from '../../src/world/Chunk';
import { CHUNK_DIMENSIONS } from '../../src/world/WorldCoordinates';

/**
 * Terrain-fidelity gate for the `generateColumn` vertical clamp
 * (Change 253 Phase 8).
 *
 * `generateColumn` used to walk every Y in the dimension (-64..319) for each
 * (x,z). Everything strictly above both the terrain surface and sea level is
 * unconditionally air, and air is never written into a column, so the loop now
 * stops at `max(height, seaLevel)`.
 *
 * That is only sound if (a) nothing above that level was ever produced, and
 * (b) the generated band itself is untouched. This file pins both, using the
 * independent per-slab `generateChunk` implementation as the oracle for (b).
 */
function makeGenerator(seed: number): {
  generator: TerrainGenerator;
  stateRegistry: ReturnType<typeof createDefaultBlockStateRegistry>;
} {
  const registry = createDefaultBlockRegistry();
  return {
    generator: new TerrainGenerator(registry, seed),
    stateRegistry: createDefaultBlockStateRegistry(),
  };
}

const COLUMNS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, -3],
  [-4, 2],
  [7, 7],
  [-9, -9],
];

describe('generateColumn vertical clamp preserves the generated world', () => {
  it('produces the exact pre-clamp block output over the full dimension range', () => {
    const { generator, stateRegistry } = makeGenerator(4242);
    const vwa = new VerticalWorldAccess({
      dimension: OVERWORLD_DIMENSION_TYPE,
      registry: stateRegistry,
    });

    // FNV-seeded order-sensitive hash over every cell of every test column,
    // -64..319 inclusive. The expected values were captured by running this
    // exact hash against the pre-clamp implementation (commit 06c7399) and
    // confirmed to be unchanged by the clamp.
    let hash = 2166136261 >>> 0;
    let nonAir = 0;
    for (const [chunkX, chunkZ] of COLUMNS) {
      const column = vwa.ensureColumn(chunkX, chunkZ);
      generator.generateColumn(column, stateRegistry);
      for (let lx = 0; lx < CHUNK_DIMENSIONS.width; lx++) {
        for (let lz = 0; lz < CHUNK_DIMENSIONS.depth; lz++) {
          for (let wy = column.minY; wy <= column.maxY; wy++) {
            const id = column.getBlockState(lx, wy, lz).blockId;
            if (id !== BlockId.Air) nonAir++;
            hash ^= id + 0x9e3779b9 + (hash << 6) + (hash >>> 2);
            hash = hash >>> 0;
          }
        }
      }
    }

    expect(hash).toBe(831535891);
    expect(nonAir).toBe(124722);
  });

  it('matches the independent per-slab generateChunk output cell for cell', () => {
    const { generator, stateRegistry } = makeGenerator(4242);
    const vwa = new VerticalWorldAccess({
      dimension: OVERWORLD_DIMENSION_TYPE,
      registry: stateRegistry,
    });
    const { width, height, depth } = CHUNK_DIMENSIONS;

    const mismatches: string[] = [];
    let compared = 0;
    let nonAirCompared = 0;
    for (const [chunkX, chunkZ] of COLUMNS) {
      const column = vwa.ensureColumn(chunkX, chunkZ);
      generator.generateColumn(column, stateRegistry);
      // generateChunk covers the legacy 0..63 slab; that band spans the surface
      // and so exercises terrain, caves, lava, surface rules and ore veins.
      const slab = new Chunk(chunkX, 0, chunkZ);
      generator.generateChunk(slab);
      for (let lx = 0; lx < width; lx++) {
        for (let lz = 0; lz < depth; lz++) {
          for (let ly = 0; ly < height; ly++) {
            const expected = slab.getLocal(lx, ly, lz);
            const actual = column.getBlockState(lx, ly, lz).blockId;
            if (actual !== expected) {
              mismatches.push(`(${chunkX},${chunkZ}) local(${lx},${ly},${lz}) ${actual}!=${expected}`);
            }
            if (expected !== BlockId.Air) nonAirCompared++;
            compared++;
          }
        }
      }
    }

    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(compared).toBe(COLUMNS.length * width * height * depth);
    // Guard against a vacuous pass if generation ever silently produced nothing.
    expect(nonAirCompared).toBeGreaterThan(0);
  });
});
