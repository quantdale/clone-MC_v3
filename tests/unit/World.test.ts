import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { Chunk, ChunkState } from '../../src/world/Chunk';
import { CONFIG } from '../../src/config';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { emptyMeshBuildResult, type ChunkMeshResult } from '../../src/world/MeshingTypes';
import {
  processMeshSectionRequest,
  validateMeshSectionRequest,
} from '../../src/rendering/WorkerMeshing';
import type { MeshWorkerRegistryTable } from '../../src/rendering/MeshWorkerRegistry';
import { validateMeshWorkerRegistryTable } from '../../src/rendering/MeshWorkerRegistry';
import { WORKER_PROTOCOL_VERSION, type WorkerRequest, validateWorkerRequest } from '../../src/rendering/WorkerJobProtocol';
import type { DimensionType } from '../../src/data/DimensionType';

class DeferredMeshWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  private table: MeshWorkerRegistryTable | undefined;

  postMessage(data: unknown): void {
    if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'initialize') {
      this.table = validateMeshWorkerRegistryTable((data as { payload: unknown }).payload);
      return;
    }
    const request = validateWorkerRequest(data) as WorkerRequest;
    queueMicrotask(() => {
      try {
        const payload = validateMeshSectionRequest(request.payload, this.table);
        const result = processMeshSectionRequest(payload, request.generationToken);
        this.onmessage?.({
          data: {
            protocolVersion: WORKER_PROTOCOL_VERSION,
            jobId: request.jobId,
            kind: request.kind,
            ok: true,
            generationToken: request.generationToken,
            payload: {
              sectionX: result.sectionX,
              sectionY: result.sectionY,
              sectionZ: result.sectionZ,
              versionSnapshot: result.versionSnapshot,
              layerStreams: result.layerStreams,
            },
          },
        } as MessageEvent);
      } catch {
        this.onerror?.();
      }
    });
  }

  terminate(): void {}

  addEventListener(): void {}
}


/**
 * Build a World with a stub mesher/generator so we can exercise its dirty-state
 * and edit-overlay logic without a full renderer.
 */
function makeWorld(seed = 1, dimension?: DimensionType): World {
  const registry = createDefaultBlockRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = {
    generateChunk(chunk: Chunk): void {
      chunk.fill(BlockId.Stone);
    },
    getHeightAt(): number {
      return CONFIG.seaLevel + 1;
    },
  };
  const mesher = {
    mesh(): { opaque: null; transparent: null } {
      return { opaque: null, transparent: null };
    },
  };
  return new World({
    registry,
    seed,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials,
    renderDistance: 2,
    dimension,
  });
}

/**
 * Like makeWorld, but records every chunk key the mesher is asked to rebuild so
 * tests can assert that boundary edits propagate to neighbouring chunks.
 */
function makeRecordingWorld(seed = 1): { world: World; meshedKeys: string[] } {
  const registry = createDefaultBlockRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = {
    generateChunk(chunk: Chunk): void {
      chunk.fill(BlockId.Stone);
    },
    getHeightAt(): number {
      return CONFIG.seaLevel + 1;
    },
  };
  const meshedKeys: string[] = [];
  const mesher = {
    mesh(chunk: Chunk): { opaque: null; transparent: null } {
      meshedKeys.push(`${chunk.cx},${chunk.cy},${chunk.cz}`);
      return { opaque: null, transparent: null };
    },
  };
  const world = new World({
    registry,
    seed,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials,
    renderDistance: 2,
  });
  return { world, meshedKeys };
}

function makeCanonicalSectionWorld(
  workerMeshing = false,
  workerFactory?: () => Worker,
): World {
  const registry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = {
    generateColumn(): void {
      // Keep the canonical column air-filled; tests write target sections explicitly.
    },
    getHeightAt(): number {
      return 0;
    },
  };
  const mesher = {
    mesh(): { opaque: null; transparent: null } {
      return { opaque: null, transparent: null };
    },
    meshSection(): ChunkMeshResult {
      return {
        opaque: null,
        transparent: null,
        cutout: null,
        translucent: null,
        fluid: null,
        streams: emptyMeshBuildResult(),
      };
    },
  };
  return new World({
    registry,
    stateRegistry,
    seed: 1,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials,
    renderDistance: 0,
    dimension: OVERWORLD_DIMENSION_TYPE,
    workerMeshing,
    workerFactory,
  });
}

describe('world dirty propagation and edits', () => {
  /** Stream around the player chunk long enough for the target chunk to be
   *  generated and meshed. */
  function streamUntilGenerated(world: World, cx: number, cz: number): void {
    for (let i = 0; i < 200; i++) {
      world.update(0.016, cx, cz);
      // The chunk covering the player's chunk is generated once generation and
      // meshing have both run for it.
      if (world.getBlock(cx * 16 + 8, 8, cz * 16 + 8) !== BlockId.Air) {
        return;
      }
    }
  }

  it('keeps worker meshing opt-in and exposes runtime diagnostics', () => {
    const world = makeCanonicalSectionWorld();
    expect(world.isWorkerMeshingEnabled()).toBe(false);
    expect(world.getStats().workerMeshing).toEqual({
      enabled: false,
      pendingJobs: 0,
      activeBatches: 0,
      completed: 0,
      failures: 0,
      fallbacks: 0,
    });

    world.setWorkerMeshingEnabled(true);
    expect(world.isWorkerMeshingEnabled()).toBe(true);
    expect(world.getStats().workerMeshing?.enabled).toBe(true);
    world.setWorkerMeshingEnabled(false);
    expect(world.isWorkerMeshingEnabled()).toBe(false);
    world.dispose();
  });

  it('falls back to synchronous canonical meshing when worker construction is unavailable', () => {
    const world = makeCanonicalSectionWorld(true);
    world.setBlock(8, 8, 8, BlockId.Stone);
    for (let frame = 0; frame < 200; frame++) {
      world.update(1 / 60, 0, 0);
      if (world.getStats().pendingGeneration === 0 && world.getStats().pendingMesh === 0) break;
    }

    const diagnostics = world.getStats().workerMeshing!;
    expect(diagnostics.enabled).toBe(false);
    expect(diagnostics.failures).toBe(1);
    expect(diagnostics.fallbacks).toBeGreaterThanOrEqual(1);
    expect(diagnostics.activeBatches).toBe(0);
    expect(world.getStats().pendingMesh).toBe(0);
    expect((world as unknown as { sectionMeshGroups: Map<string, unknown> }).sectionMeshGroups.has('0,0,0')).toBe(true);
    world.dispose();
  });

  it('completes a validated worker section batch and attaches canonical geometry', async () => {
    const world = makeCanonicalSectionWorld(
      true,
      () => new DeferredMeshWorker() as unknown as Worker,
    );
    world.setBlock(8, 8, 8, BlockId.Stone);
    for (let frame = 0; frame < 200; frame++) {
      world.update(1 / 60, 0, 0);
      await Promise.resolve();
      const diagnostics = world.getStats().workerMeshing!;
      if (diagnostics.completed > 0 && world.getStats().pendingMesh === 0) break;
    }

    const diagnostics = world.getStats().workerMeshing!;
    expect(diagnostics.enabled).toBe(true);
    expect(diagnostics.completed).toBeGreaterThan(0);
    expect(diagnostics.failures).toBe(0);
    expect(diagnostics.fallbacks).toBe(0);
    expect(diagnostics.pendingJobs).toBe(0);
    expect(diagnostics.activeBatches).toBe(0);
    expect(world.getStats().pendingMesh).toBe(0);
    expect((world as unknown as { sectionMeshGroups: Map<string, unknown> }).sectionMeshGroups.has('0,0,0')).toBe(true);
    world.dispose();
  });

  it('uses canonical sections as live mesh invalidation units and preserves sibling ownership', () => {
    const world = makeCanonicalSectionWorld();
    const stateRegistry = createDefaultBlockStateRegistry();
    const column = world.storage.ensureColumn(0, 0);
    const neighbor = world.storage.ensureColumn(-1, 0);
    const stone = stateRegistry.getDefaultState(BlockId.Stone);
    const sectionMeshes = (world as unknown as { sectionMeshGroups: Map<string, unknown> }).sectionMeshGroups;

    world.setBlock(8, 8, 8, BlockId.Stone);
    world.setBlock(8, 24, 8, BlockId.Stone);
    world.setBlock(-8, 8, 8, BlockId.Stone);
    for (let frame = 0; frame < 200; frame++) {
      world.update(1 / 60, 0, 0);
      const stats = world.getStats();
      if (stats.pendingGeneration === 0 && stats.pendingMesh === 0) break;
    }

    expect(sectionMeshes.has('0,0,0')).toBe(true);
    expect(sectionMeshes.has('0,1,0')).toBe(true);
    const siblingMeshes = sectionMeshes.get('0,1,0');
    column.clearMeshDirty(4);
    column.clearMeshDirty(5);
    neighbor.clearMeshDirty(4);

    world.setBlock(8, 8, 8, BlockId.Glass);
    expect(column.meshDirtySectionIndices()).toEqual([4]);
    expect(neighbor.meshDirtySectionIndices()).toEqual([]);

    world.update(1 / 60, 0, 0);
    expect(column.meshDirtySectionIndices()).not.toContain(5);
    expect(sectionMeshes.get('0,1,0')).toBe(siblingMeshes);

    column.clearMeshDirty(4);
    neighbor.clearMeshDirty(4);
    world.storage.setCanonicalState(0, 8, 8, stone);
    world.setBlock(0, 8, 8, BlockId.Glass);
    expect(column.meshDirtySectionIndices()).toContain(4);
    expect(neighbor.meshDirtySectionIndices()).toContain(4);

    world.dispose();
  });
  it('iterates materialized canonical sections with dimension-aware negative and top Y', () => {
    const world = makeWorld(1, OVERWORLD_DIMENSION_TYPE);
    world.setBlock(-17, -64, -1, BlockId.Stone);
    world.setBlock(-17, 0, -1, BlockId.Stone);
    world.setBlock(-17, 319, -1, BlockId.Stone);

    const sections: Array<[number, number, number]> = [];
    world.forEachLoadedSection((sectionX, sectionY, sectionZ) => {
      sections.push([sectionX, sectionY, sectionZ]);
    });

    expect(sections).toEqual([
      [-2, -4, -1],
      [-2, 0, -1],
      [-2, 19, -1],
    ]);
    expect(world.getStats().residentColumns).toBe(0);
    expect(world.getStats().allocatedSections).toBe(3);
    world.dispose();
  });

  it('uses a non-allocating generator fallback for absent surface columns', () => {
    const world = makeWorld();
    expect(world.getStats().residentColumns).toBe(0);
    expect(world.getMotionBlockingHeight(8, 8)).toBe(CONFIG.seaLevel + 1);
    expect(world.getStats().residentColumns).toBe(0);
  });

  it('uses the canonical motion-blocking heightmap when a column exists', () => {
    const world = makeWorld();
    world.setBlock(8, 10, 8, BlockId.Stone);
    world.setBlock(8, 25, 8, BlockId.Water);

    // Water is a surface block but not motion-blocking; the canonical heightmap
    // must win over the generator fallback once the column exists.
    expect(world.getMotionBlockingHeight(8, 8)).toBe(10);
    world.setBlock(8, 10, 8, BlockId.Air);
    expect(world.getMotionBlockingHeight(8, 8)).toBe(-65);
  });

  it('clamps canonical surface queries to the active dimension bounds', () => {
    const world = makeWorld(1, OVERWORLD_DIMENSION_TYPE);
    world.setBlock(8, 319, 8, BlockId.Stone);
    world.setBlock(8, 320, 8, BlockId.Stone);
    expect(world.getMotionBlockingHeight(8, 8)).toBe(319);
  });

  it('queues preload work instead of generating synchronously', () => {
    const world = makeWorld();

    world.preloadChunks(0, 0, 0);

    expect(world.getStats().pendingGeneration).toBe(1);
    expect(world.getBlock(0, 8, 0)).toBe(BlockId.Air);

    world.update(0.016, 0, 0);
    expect(world.getBlock(0, 8, 0)).toBe(BlockId.Stone);
  });

  it('lets unsupported sand fall one block per world update', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);
    world.setBlock(8, 10, 8, BlockId.Sand);
    world.setBlock(8, 9, 8, BlockId.Air);
    expect(world.getBlock(8, 10, 8)).toBe(BlockId.Sand);
    for (let i = 0; i < 5 && world.getBlock(8, 9, 8) !== BlockId.Sand; i++) {
      world.update(0.016, 0, 0);
    }
    expect(world.getBlock(8, 10, 8)).toBe(BlockId.Air);
    expect(world.getBlock(8, 9, 8)).toBe(BlockId.Sand);
  });

  it('setBlock records an edit that survives streaming away and reload', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Stone);

    // Edit a block.
    world.setBlock(8, 8, 8, BlockId.Sand);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Sand);

    // Invalid ids are rejected before they can corrupt canonical storage or
    // make the mesher throw while resolving block properties.
    world.setBlock(8, 8, 8, 255);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Sand);

    // Stream far away. Canonical storage remains authoritative even after the
    // resident slab projection is evicted.
    for (let i = 0; i < 500; i++) {
      world.update(0.016, 100, 100);
    }
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Sand);

    // Return — the edit must still be present after regeneration.
    streamUntilGenerated(world, 0, 0);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Sand);
  });

  it('marks a boundary edit dirty on the neighbor chunk', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);

    // Block at local x==0 of chunk (0,0,0) is at world x = 0.
    expect(world.getBlock(0, 8, 8)).toBe(BlockId.Stone);

    world.setBlock(0, 8, 8, BlockId.Grass);
    // The edited block is regenerated with the edit overlay applied.
    streamUntilGenerated(world, 0, 0);
    expect(world.getBlock(0, 8, 8)).toBe(BlockId.Grass);
  });

  it('re-meshes the neighboring chunk after a boundary edit', () => {
    const { world, meshedKeys } = makeRecordingWorld();
    streamUntilGenerated(world, 0, 0);

    // The neighbor chunk (-1,0,0) is loaded (renderDistance 2) and meshed.
    const beforeCount = meshedKeys.filter((k) => k === '-1,0,0').length;
    expect(beforeCount).toBeGreaterThanOrEqual(1);

    // Edit a block on the -X boundary of chunk (0,0,0): world x=0.
    world.setBlock(0, 8, 8, BlockId.Grass);

    // Drive meshing long enough for the neighbor's re-mesh job to run.
    for (let i = 0; i < 50; i++) {
      world.update(0.016, 0, 0);
      if (meshedKeys.filter((k) => k === '-1,0,0').length > beforeCount) {
        break;
      }
    }
    // The boundary edit must have triggered a fresh re-mesh of the neighbor.
    expect(meshedKeys.filter((k) => k === '-1,0,0').length).toBeGreaterThan(beforeCount);
  });

  it('isReady reflects visible spawn chunks', () => {
    const world = makeWorld();
    expect(world.isReady()).toBe(false);
    for (let i = 0; i < 60; i++) {
      world.update(0.016, 0, 0);
    }
    expect(world.isReady()).toBe(true);
  });

  it('readiness excludes a generated surface slab until it is visible', () => {
    const world = makeWorld();
    for (let i = 0; i < 60; i++) {
      world.update(0.016, 0, 0);
    }
    expect(world.isReady()).toBe(true);

    const manager = (world as unknown as {
      getChunk: never;
      chunkManager: { getChunk: (cx: number, cy: number, cz: number) => Chunk | undefined };
    }).chunkManager;
    const surface = manager.getChunk(0, 0, 0);
    expect(surface?.state).toBe(ChunkState.Visible);
    surface!.state = ChunkState.Generated;
    expect(world.getReadyProgress(0, 0)).toBeLessThan(1);
    surface!.state = ChunkState.Visible;
    expect(world.getReadyProgress(0, 0)).toBe(1);
  });

  it('reports and drains the bounded unload backlog after a far teleport', () => {
    const world = makeWorld();
    for (let i = 0; i < 120; i++) {
      world.update(0.016, 0, 0);
    }
    expect(world.getStats().residentColumns).toBe(25);
    expect(world.getStats().pendingUnload).toBe(0);

    world.update(0.016, 100, 100);
    const firstPending = world.getStats().pendingUnload;
    expect(firstPending).toBeGreaterThan(0);
    expect(firstPending).toBeGreaterThanOrEqual(25 - CONFIG.budgets.unloadPerFrame);

    let previous = firstPending;
    for (let i = 0; i < 20 && world.getStats().pendingUnload > 0; i++) {
      world.update(0.016, 100, 100);
      const pending = world.getStats().pendingUnload;
      expect(pending).toBeLessThanOrEqual(previous);
      previous = pending;
    }
    expect(world.getStats().pendingUnload).toBe(0);
  });

  it('keeps generation queue bounded', () => {
    const world = makeWorld();
    world.update(0.016, 0, 0);
    world.update(0.016, 0, 0);
    const stats = world.getStats();
    // renderDistance 2 → a 5×5 chunk area max; the queue must not grow beyond it.
    expect(stats.pendingGeneration).toBeLessThanOrEqual(5 * 5);
  });

  it('exports and imports sparse edits for a matching seed', () => {
    const source = makeWorld(77);
    streamUntilGenerated(source, 0, 0);
    source.setBlock(8, 8, 8, BlockId.Glass);
    source.setBlock(9, 8, 8, BlockId.Air);

    const snapshot = source.exportEdits();
    expect(snapshot.version).toBe(1);
    expect(snapshot.seed).toBe(77);
    expect(snapshot.edits).toHaveLength(1);
    expect(snapshot.edits[0]?.changes).toEqual(expect.arrayContaining([
      [localIndexForTest(8, 8, 8), BlockId.Glass],
      [localIndexForTest(9, 8, 8), BlockId.Air],
    ]));

    const restored = makeWorld(77);
    expect(restored.importEdits(snapshot)).toBe(2);
    streamUntilGenerated(restored, 0, 0);
    expect(restored.getBlock(8, 8, 8)).toBe(BlockId.Glass);
    expect(restored.getBlock(9, 8, 8)).toBe(BlockId.Air);
  });

  it('rejects malformed or foreign edit snapshots', () => {
    const world = makeWorld(9);
    expect(world.importEdits({ version: 1, seed: 10, edits: [] })).toBe(0);
    expect(world.importEdits({ version: 2, seed: 9, edits: [] })).toBe(0);
    expect(world.importEdits({
      version: 1,
      seed: 9,
      edits: [{ chunk: [0, 0, 0], changes: [[999999, BlockId.Stone], [0, 999]] }],
    })).toBe(0);
    expect(world.getEditCount()).toBe(0);
  });

  it('does not invoke a compatibility generator for a protected legacy baseline', () => {
    let generatedChunks = 0;
    const registry = createDefaultBlockRegistry();
    const scene = new THREE.Scene();
    const materials = {
      opaque: new THREE.MeshLambertMaterial(),
      transparent: new THREE.MeshLambertMaterial(),
    };
    const generator = {
      generateChunk(chunk: Chunk): void {
        generatedChunks++;
        chunk.fill(BlockId.Stone);
      },
      getHeightAt(): number {
        return CONFIG.seaLevel + 1;
      },
    };
    const world = new World({
      registry,
      seed: 11,
      scene,
      mesher: { mesh: () => ({ opaque: null, transparent: null }) } as never,
      generator: generator as never,
      materials,
      renderDistance: 0,
    });

    world.setGenerationBaseline('legacy-unknown');
    world.preloadChunks(0, 0, 0);
    world.update(0.016, 0, 0);

    expect(generatedChunks).toBe(0);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Air);
  });
});

function localIndexForTest(x: number, y: number, z: number): number {
  return x + CONFIG.chunk.width * (z + CONFIG.chunk.depth * y);
}
