import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { TerrainGenerator } from '../../src/world/TerrainGenerator';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { WorldLightStorage } from '../../src/rendering/LightStorage';
import { CHUNK_DIMENSIONS } from '../../src/world/WorldCoordinates';
import type { Chunk } from '../../src/world/Chunk';

/**
 * Visual-fidelity gate for the section-bulk skylight seeding fast path
 * (Change 253 Phase 8).
 *
 * `World.seedChunkLight` bulk-fills skylight for a 16^3 section that is entirely
 * air under an unobstructed slab, instead of writing 4096 cells individually.
 * That is only a legitimate optimization if it is *value-identical* to the
 * original per-cell loop, so this test re-implements the original algorithm and
 * asserts an exact cell-for-cell match over real generated terrain.
 */
/** Mirror of World's module-private emissive table. */
const REFERENCE_LUMINANCE: Readonly<Record<number, number>> = {
  [BlockId.Lava]: 15,
  [BlockId.Fire]: 15,
  [BlockId.RedstoneTorch]: 7,
};
const blockLuminance = (id: number): number => REFERENCE_LUMINANCE[id] ?? 0;

function referenceSeed(
  chunk: Chunk,
  registry: ReturnType<typeof createDefaultBlockRegistry>,
  target: WorldLightStorage,
): void {
  const ox = chunk.cx * CHUNK_DIMENSIONS.width;
  const oy = chunk.cy * CHUNK_DIMENSIONS.height;
  const oz = chunk.cz * CHUNK_DIMENSIONS.depth;
  const { width, height, depth } = CHUNK_DIMENSIONS;
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depth; z++) {
      let sky = 15;
      for (let y = height - 1; y >= 0; y--) {
        const id = chunk.getLocal(x, y, z);
        if (sky > 0 && registry.isOpaque(id)) sky = 0;
        if (sky > 0) target.setSkyLight(ox + x, oy + y, oz + z, sky);
        const luminance = blockLuminance(id);
        if (luminance > 0) {
          target.setBlockLight(ox + x, oy + y, oz + z, Math.min(15, luminance));
        }
      }
    }
  }
}

describe('section-bulk skylight seeding matches the per-cell reference exactly', () => {
  it('keeps canonical skylight continuous across the legacy slab boundary and dimension top', () => {
    const registry = createDefaultBlockRegistry();
    const stateRegistry = createDefaultBlockStateRegistry();
    const scene = new THREE.Scene();
    const materials = {
      opaque: new THREE.MeshLambertMaterial(),
      transparent: new THREE.MeshLambertMaterial(),
    };
    const stone = stateRegistry.getDefaultState(BlockId.Stone);
    const generator = {
      generateColumn(column: { setBlockState: (x: number, y: number, z: number, state: unknown) => void }): void {
        column.setBlockState(0, 0, 0, stone);
      },
      getHeightAt(): number {
        return 1;
      },
    };
    const world = new World({
      registry,
      seed: 20260828,
      scene,
      mesher: { mesh: () => ({ opaque: null, transparent: null }) } as never,
      generator: generator as never,
      materials,
      renderDistance: 0,
      dimension: OVERWORLD_DIMENSION_TYPE,
      stateRegistry,
    });

    for (let i = 0; i < 100 && world.getBlock(0, 0, 0) !== BlockId.Stone; i++) {
      world.update(0.016, 0, 0);
    }
    expect(world.getBlock(0, 0, 0)).toBe(BlockId.Stone);
    const light = (world as unknown as { lightStorage: WorldLightStorage }).lightStorage;
    expect(light.getSkyLight(0, 1, 0)).toBe(15);
    expect(light.getSkyLight(0, 0, 0)).toBe(0);
    expect(light.getSkyLight(0, -1, 0)).toBe(0);
    expect(light.getSkyLight(0, 319, 0)).toBe(15);
    expect(light.getSkyLight(0, 320, 0)).toBe(0);
    world.dispose();
  });

  it('produces identical sky and block light for every streamed chunk', () => {
    const registry = createDefaultBlockRegistry();
    const stateRegistry = createDefaultBlockStateRegistry();
    const scene = new THREE.Scene();
    const materials = {
      opaque: new THREE.MeshLambertMaterial(),
      transparent: new THREE.MeshLambertMaterial(),
    };
    const generator = new TerrainGenerator(registry, 20260828);
    const mesher = { mesh: () => ({ opaque: null, transparent: null }) };
    const world = new World({
      registry,
      seed: 20260828,
      scene,
      mesher: mesher as never,
      generator,
      materials,
      renderDistance: 1,
      dimension: OVERWORLD_DIMENSION_TYPE,
      stateRegistry,
    });
    for (let i = 0; i < 2000; i++) world.update(0.016, 0, 0);

    const live = (world as unknown as { lightStorage: WorldLightStorage }).lightStorage;
    const reference = new WorldLightStorage();

    const chunks: Chunk[] = [];
    (
      world as unknown as { chunkManager: { forEachChunk: (fn: (c: Chunk) => void) => void } }
    ).chunkManager.forEachChunk((c) => {
      if (c.generated) chunks.push(c);
    });
    expect(chunks.length).toBeGreaterThan(0);

    const mismatches: string[] = [];
    let compared = 0;
    let airSectionsCovered = 0;
    for (const chunk of chunks) {
      referenceSeed(chunk, registry, reference);
      const ox = chunk.cx * CHUNK_DIMENSIONS.width;
      const oy = chunk.cy * CHUNK_DIMENSIONS.height;
      const oz = chunk.cz * CHUNK_DIMENSIONS.depth;
      let slabIsAir = true;
      for (let x = 0; x < CHUNK_DIMENSIONS.width; x++) {
        for (let z = 0; z < CHUNK_DIMENSIONS.depth; z++) {
          for (let y = 0; y < CHUNK_DIMENSIONS.height; y++) {
            const wx = ox + x;
            const wy = oy + y;
            const wz = oz + z;
            // Compared without a per-cell matcher (1.7M assertions is minutes of
            // matcher overhead); the first divergence is reported explicitly.
            if (
              live.getSkyLight(wx, wy, wz) !== reference.getSkyLight(wx, wy, wz) ||
              live.getBlockLight(wx, wy, wz) !== reference.getBlockLight(wx, wy, wz)
            ) {
              mismatches.push(
                `(${wx},${wy},${wz}) sky ${live.getSkyLight(wx, wy, wz)}!=${reference.getSkyLight(wx, wy, wz)} ` +
                  `block ${live.getBlockLight(wx, wy, wz)}!=${reference.getBlockLight(wx, wy, wz)}`,
              );
            }
            if (chunk.getLocal(x, y, z) !== BlockId.Air) slabIsAir = false;
            compared++;
          }
        }
      }
      if (slabIsAir) airSectionsCovered++;
    }

    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(compared).toBeGreaterThan(0);
    // The comparison must actually exercise the bulk path, not just the
    // per-cell fallback, or it would prove nothing about the optimization.
    expect(airSectionsCovered).toBeGreaterThan(0);
  });
});
