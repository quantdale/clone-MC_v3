import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { emptyMeshBuildResult, type ChunkMeshResult } from '../../src/world/MeshingTypes';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { TerrainGenerator } from '../../src/world/TerrainGenerator';
import { World, type WorldEditDurability } from '../../src/world/World';

function emptyResult(): ChunkMeshResult {
  return {
    opaque: null,
    transparent: null,
    cutout: null,
    translucent: null,
    fluid: null,
    streams: emptyMeshBuildResult(),
  };
}

function privateOwner(world: World): Record<string, unknown> {
  return world as unknown as Record<string, unknown>;
}

function makeDeferredDurability(): WorldEditDurability {
  return {
    captureChunkEdits: () => undefined,
    retainEvictedChunkEdits: () => undefined,
    restorePendingChunkEdits: () => null,
    loadCommittedChunkEdits: () => new Promise(() => undefined),
  };
}

describe('World ownership reclamation', () => {
  it('reclaims deferred hydration, canonical geometry, and churn ownership on dispose', () => {
    const registry = createDefaultBlockRegistry();
    const world = new World({
      registry,
      stateRegistry: createDefaultBlockStateRegistry(),
      seed: 1337,
      scene: new THREE.Scene(),
      mesher: {
        mesh: () => emptyResult(),
        meshSection: () => emptyResult(),
      } as never,
      generator: new TerrainGenerator(registry, 1337),
      materials: {
        opaque: new THREE.MeshLambertMaterial(),
        transparent: new THREE.MeshLambertMaterial(),
      },
      renderDistance: 0,
      dimension: OVERWORLD_DIMENSION_TYPE,
      editDurability: makeDeferredDurability(),
    });
    const owner = privateOwner(world);
    const geometry = new THREE.BufferGeometry();
    const dispose = vi.spyOn(geometry, 'dispose');
    const attach = (owner.attachCanonicalSection as unknown as (
      this: World,
      key: string,
      sectionX: number,
      sectionY: number,
      sectionZ: number,
      result: ChunkMeshResult,
    ) => void).bind(world);

    try {
      for (const [cx, cz] of [[0, 0], [20, 20], [-20, 20], [20, -20], [0, 0]] as const) {
        for (let frame = 0; frame < 100; frame++) world.update(1 / 60, cx, cz);
      }
      attach('99,19,-99', 99, 19, -99, { ...emptyResult(), opaque: geometry });

      const hydrationPending = owner.hydrationPending as Set<string>;
      const sectionMeshGroups = owner.sectionMeshGroups as Map<string, unknown>;
      expect(hydrationPending.size).toBeGreaterThan(0);
      expect(sectionMeshGroups.size).toBeGreaterThan(0);
      const scene = owner.scene as THREE.Scene;
      expect(scene.children.length).toBeGreaterThan(0);

      world.dispose();
      world.dispose();

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(scene.children).toHaveLength(0);
      expect((owner.workerMeshBatches as Map<string, unknown>).size).toBe(0);
      expect((owner.sectionMeshGroups as Map<string, unknown>).size).toBe(0);
      expect((owner.meshGroups as Map<string, unknown>).size).toBe(0);
      expect((owner.sectionTriangles as Map<string, unknown>).size).toBe(0);
      expect((owner.chunkTriangles as Map<string, unknown>).size).toBe(0);
      expect((owner.chunkVoxelCounts as Map<string, unknown>).size).toBe(0);
      expect((owner.hydrationPending as Set<string>).size).toBe(0);
      expect((owner.editOverlay as Map<string, unknown>).size).toBe(0);
      expect((owner.editOverlayAccessOrder as string[])).toHaveLength(0);
      expect((owner.retryMeshQueue as unknown[])).toHaveLength(0);
      expect((owner.retryMeshSet as Set<string>).size).toBe(0);
      expect((owner.fallingQueue as unknown[])).toHaveLength(0);
      expect((owner.fallingSet as Set<string>).size).toBe(0);
      expect((owner.lightDirtyChunks as Set<string>).size).toBe(0);
      expect((owner.seededLightColumns as Set<string>).size).toBe(0);
    } finally {
      world.dispose();
    }
  }, 120_000);
});
