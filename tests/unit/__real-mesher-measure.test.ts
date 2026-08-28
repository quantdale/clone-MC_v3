import { describe, it } from 'vitest';
import * as THREE from 'three';
import { ChunkMesher } from '../../src/world/ChunkMesher';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { TerrainGenerator } from '../../src/world/TerrainGenerator';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { tileUV } from '../../src/rendering/TextureAtlas';
import type { TextureAtlas } from '../../src/rendering/TextureAtlas';

describe('real mesher resource probe', () => {
  it('measures the first production-mesher frames', { timeout: 120_000 }, () => {
    const registry = createDefaultBlockRegistry();
    const scene = new THREE.Scene();
    const materials = {
      opaque: new THREE.MeshLambertMaterial(),
      transparent: new THREE.MeshLambertMaterial(),
    };
    const mesher = new ChunkMesher({
      registry,
      atlas: { uv: tileUV } as unknown as TextureAtlas,
    });
    const world = new World({
      registry,
      seed: 1337,
      scene,
      mesher,
      generator: new TerrainGenerator(registry, 1337),
      materials,
      renderDistance: 1,
      dimension: OVERWORLD_DIMENSION_TYPE,
      stateRegistry: createDefaultBlockStateRegistry(),
    });

    const frames: Array<{ ms: number; ready: number; pendingGeneration: number; pendingMesh: number; geometries: number }> = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      world.update(0.016, 0, 0);
      const elapsed = performance.now() - start;
      const stats = world.getStats();
      frames.push({
        ms: +elapsed.toFixed(1),
        ready: +world.getReadyProgress(0, 0).toFixed(3),
        pendingGeneration: stats.pendingGeneration,
        pendingMesh: stats.pendingMesh,
        geometries: stats.geometries,
      });
    }
    console.log(`[253 real mesher baseline] ${JSON.stringify(frames)}`);
    world.dispose();
  });
});
