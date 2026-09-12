import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { emptyMeshBuildResult, type ChunkMeshResult } from '../../src/world/MeshingTypes';
import {
  processMeshSectionRequest,
  validateMeshSectionRequest,
} from '../../src/rendering/WorkerMeshing';
import type { MeshWorkerRegistryTable } from '../../src/rendering/MeshWorkerRegistry';
import { validateMeshWorkerRegistryTable } from '../../src/rendering/MeshWorkerRegistry';
import { WORKER_PROTOCOL_VERSION, type WorkerRequest, validateWorkerRequest } from '../../src/rendering/WorkerJobProtocol';

/**
 * Change 269 (R-6 closure): `World.dispose()` must be idempotent and must
 * terminate every composed mesh worker, with no post-dispose callback able
 * to attach geometry. Uses the repo-standard deferred fake worker with an
 * added `terminated` flag (cf. `WorkerWorldgen.test.ts`).
 */

class CountingDeferredWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = 0;
  private table: MeshWorkerRegistryTable | undefined;
  private readonly pending: WorkerRequest[] = [];

  postMessage(data: unknown): void {
    if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'initialize') {
      this.table = validateMeshWorkerRegistryTable((data as { payload: unknown }).payload);
      return;
    }
    this.pending.push(validateWorkerRequest(data) as WorkerRequest);
  }

  flush(): void {
    for (const request of this.pending.splice(0)) {
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
    }
  }

  terminate(): void {
    this.terminated++;
  }

  addEventListener(): void {}
}

function makeWorld(workerMeshing: boolean, workers: CountingDeferredWorker[]): World {
  const registry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = {
    generateColumn(): void {},
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
    workerFactory: () => {
      const worker = new CountingDeferredWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });
}

describe('World.dispose hardening (269)', () => {
  it('double dispose is safe with worker meshing off', () => {
    const world = makeWorld(false, []);
    expect(() => {
      world.dispose();
      world.dispose();
    }).not.toThrow();
  });

  it('double dispose is safe with meshing enabled but no workers spawned', () => {
    const workers: CountingDeferredWorker[] = [];
    const world = makeWorld(true, workers);
    expect(() => {
      world.dispose();
      world.dispose();
    }).not.toThrow();
    expect(workers.length).toBe(0);
  });

  it('dispose with pending jobs terminates every worker exactly once and attaches nothing late', () => {
    const workers: CountingDeferredWorker[] = [];
    const world = makeWorld(true, workers);
    try {
      world.setBlock(8, 8, 8, BlockId.Stone);
      for (let frame = 0; frame < 120; frame++) {
        world.update(1 / 60, 0, 0);
        if (world.getStats().workerMeshing!.pendingJobs > 0) break;
      }
      expect(workers.length).toBeGreaterThan(0);
      expect(world.getStats().workerMeshing!.pendingJobs).toBeGreaterThan(0);

      world.dispose();

      // Every composed worker terminated exactly once; pool reports empty.
      for (const worker of workers) expect(worker.terminated).toBe(1);
      expect(world.getStats().workerMeshing!.pendingJobs).toBe(0);
      expect(world.getStats().workerMeshing!.activeBatches).toBe(0);

      // Second dispose is a silent no-op: no additional terminate calls.
      world.dispose();
      for (const worker of workers) expect(worker.terminated).toBe(1);

      // Deferred deliveries after dispose attach nothing and throw nothing.
      expect(() => {
        for (const worker of workers) worker.flush();
      }).not.toThrow();
      expect(world.getStats().workerMeshing!.pendingJobs).toBe(0);
      expect(world.getStats().workerMeshing!.activeBatches).toBe(0);
    } finally {
      world.dispose();
    }
  });
});
