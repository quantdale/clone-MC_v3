/**
 * Worldgen determinism proof for the depth pipeline (CLIMATE→BIOMES→TERRAIN→CAVES→SURFACE→
 * ORES→VEGETATION→STRUCTURES). Added during the 2026-08-22 re-pin campaign and kept as a
 * standing guard:
 * (a) `generateChunk` over six seeds produces byte-identical chunk hashes across two full
 *     repeated runs in the same process;
 * (b) generation order does not matter (chunk B then A vs A then B → identical results);
 * (c) statically verified: no Math.random/Date.now/performance.now anywhere under src/worldgen
 *     or TerrainGenerator (grep-checked at authoring time).
 */
import { describe, it, expect } from 'vitest';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { TERRAIN_GENERATION_VERSION, TerrainGenerator } from '../../src/world/TerrainGenerator';
import { Chunk } from '../../src/world/Chunk';

function fnv1aBytes(bytes: Uint8Array): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SEEDS = [0, 1, 42, 1337, 1234, 9999];
// Chosen to span chunk boundaries and negative coords; includes adjacent chunks
// so owner-region ore veins / tree canopies / structure starts are exercised.
const CHUNKS: Array<[number, number]> = [
  [0, 0],
  [-1, 0],
  [3, -2],
  [12, 7],
  [-5, -5],
];

function generateAll(seeds: number[], chunkCoords: Array<[number, number]>): Map<string, number> {
  const registry = createDefaultBlockRegistry();
  const out = new Map<string, number>();
  for (const seed of seeds) {
    const gen = new TerrainGenerator(registry, seed);
    for (const [cx, cz] of chunkCoords) {
      const chunk = new Chunk(cx, 0, cz);
      gen.generateChunk(chunk);
      out.set(`${seed}:${cx}:${cz}`, fnv1aBytes(chunk.blocks));
    }
  }
  return out;
}

function generateColumnHash(seed: number, chunkX: number, chunkZ: number): number {
  const blockRegistry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  const generator = new TerrainGenerator(blockRegistry, seed);
  const column = new ChunkColumn({
    chunkX,
    chunkZ,
    sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
    minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
    registry: stateRegistry,
  });
  generator.generateColumn(column, stateRegistry);

  let hash = 2166136261 >>> 0;
  for (let y = OVERWORLD_DIMENSION_TYPE.minY; y <= OVERWORLD_DIMENSION_TYPE.maxY; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        hash ^= column.getBlockState(x, y, z).id;
        hash = Math.imul(hash, 16777619) >>> 0;
      }
    }
  }
  return hash;
}

describe('temporary worldgen determinism proof', () => {
  it('pins the live generation contract and canonical full-column determinism', () => {
    expect(TERRAIN_GENERATION_VERSION).toBe('v2');

    const coordinates: Array<[number, number]> = [
      [0, 0],
      [-1, 0],
      [7, -9],
    ];
    const first = coordinates.map(([x, z]) => generateColumnHash(42, x, z));
    const repeated = coordinates.map(([x, z]) => generateColumnHash(42, x, z));
    const normalizedAlias = coordinates.map(([x, z]) => generateColumnHash(42 + 0x1_0000_0000, x, z));
    const differentSeed = coordinates.map(([x, z]) => generateColumnHash(43, x, z));

    expect(repeated).toEqual(first);
    expect(normalizedAlias).toEqual(first);
    expect(differentSeed).not.toEqual(first);
  });

  it('(a) two full repeated runs in one process produce byte-identical chunk hashes', () => {
    const run1 = generateAll(SEEDS, CHUNKS);
    const run2 = generateAll(SEEDS, CHUNKS);
    expect(run2).toEqual(run1);
    // Sanity: hashes must not all be identical (i.e. actually content-sensitive).
    expect(new Set(run1.values()).size).toBeGreaterThan(1);
  });

  it('(b) generation order does not matter (B then A vs A then B)', () => {
    const seed = 42;
    const registry = createDefaultBlockRegistry();
    const forward = new Map<string, number>();
    const genF = new TerrainGenerator(registry, seed);
    for (const [cx, cz] of CHUNKS) {
      const c = new Chunk(cx, 0, cz);
      genF.generateChunk(c);
      forward.set(`${cx}:${cz}`, fnv1aBytes(c.blocks));
    }
    const reversed = [...CHUNKS].reverse();
    const backward = new Map<string, number>();
    const genB = new TerrainGenerator(registry, seed);
    for (const [cx, cz] of reversed) {
      const c = new Chunk(cx, 0, cz);
      genB.generateChunk(c);
      backward.set(`${cx}:${cz}`, fnv1aBytes(c.blocks));
    }
    expect(backward).toEqual(forward);
    // Also across independent generator instances sharing a shared generator? No:
    // separate instances per run already covered by (a).
  });
});
