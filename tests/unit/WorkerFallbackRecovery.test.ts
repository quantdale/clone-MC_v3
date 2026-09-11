/**
 * 258 tasks 45-46: worker crash/failure injection with bounded fallback recovery.
 *
 * Two headless fault-injection scenarios through the real `World` worker
 * path (no headed GPU needed — faults are transport-level):
 *
 * 1. The worker factory throws: the synchronous fallback runs nested inside
 *    the `workerDispatch` phase bracket. This is the exact production crash
 *    fixed with the nest-guarded `withPhase` bracket (`begin(upload) while
 *    meshingMain is open` analog); the update must not throw and the chunk
 *    must still mesh.
 * 2. A mid-batch worker crash (`onerror` after dispatch): the batch must
 *    fail closed, workers must disable, and the affected chunk must recover
 *    through the bounded synchronous fallback with no leaked batches.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { emptyMeshBuildResult, type ChunkMeshResult } from '../../src/world/MeshingTypes';

/** Minimal fake-Worker surface the pool relies on (mirrors World.test.ts). */
interface FakeWorkerScope {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(data: unknown): void;
  terminate(): void;
  addEventListener(): void;
}

/** Accepts initialize, records section requests, and never answers (in-flight forever). */
class DelayedSectionWorker implements FakeWorkerScope {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  readonly sectionRequests: string[] = [];

  postMessage(data: unknown): void {
    if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'initialize') {
      return;
    }
    // Record the targeted section; the job stays in flight (no response).
    const payload = (data as { payload?: { sectionX?: unknown; sectionY?: unknown; sectionZ?: unknown } }).payload;
    const key = payload && Number.isInteger(payload.sectionX) && Number.isInteger(payload.sectionY) && Number.isInteger(payload.sectionZ)
      ? `${payload.sectionX},${payload.sectionY},${payload.sectionZ}`
      : 'unknown';
    this.sectionRequests.push(key);
  }

  terminate(): void {}
  addEventListener(): void {}
}

/** Accepts initialize, then crashes every section request via `onerror`. */
class CrashingSectionWorker implements FakeWorkerScope {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;

  postMessage(data: unknown): void {
    if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'initialize') {
      return;
    }
    queueMicrotask(() => this.onerror?.());
  }

  terminate(): void {}
  addEventListener(): void {}
}

function makeWorkerWorld(workerMeshing: boolean, workerFactory?: () => Worker, renderDistance = 0): World {
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
    // Echo the caller's inputVersion token like the real mesher: a fixed
    // stamp would read as stale after any failStage generation bump (e.g.
    // the crash-recovery path below) and self-invalidate forever.
    meshSection(
      _cx: number,
      _sy: number,
      _cz: number,
      _section: unknown,
      _sample: unknown,
      opts?: { inputVersion?: number },
    ): ChunkMeshResult {
      return {
        opaque: null,
        transparent: null,
        cutout: null,
        translucent: null,
        fluid: null,
        streams: emptyMeshBuildResult(opts?.inputVersion ?? 0),
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
    renderDistance,
    dimension: OVERWORLD_DIMENSION_TYPE,
    workerMeshing,
    workerFactory,
  });
}

function sectionMeshes(world: World): Map<string, unknown> {
  return (world as unknown as { sectionMeshGroups: Map<string, unknown> }).sectionMeshGroups;
}

describe('258 worker duplicate-submit prevention (task 47)', () => {
  it('does not cancel and resubmit an in-flight batch for the same current version', async () => {
    const workers: DelayedSectionWorker[] = [];
    const world = makeWorkerWorld(
      true,
      () => {
        const worker = new DelayedSectionWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
      2,
    );
    try {
      const settleArea = async (cx: number, cz: number): Promise<void> => {
        for (let frame = 0; frame < 400; frame++) {
          world.update(1 / 60, cx, cz);
          await Promise.resolve();
          if (world.getStats().pendingGeneration === 0 && world.getStats().pendingLight === 0) return;
        }
        throw new Error('area did not settle');
      };
      // Pregenerate the union of both stream centers (x in [-2, 3]) so the
      // measured teleports cause no generation, no unloads (hysteresis
      // retains x=-2 at dx=-3: 3 > 2+1 is false), and no version bumps.
      await settleArea(0, 0);
      await settleArea(1, 0);
      await settleArea(0, 0);

      const submitted = (): number =>
        workers.reduce((total, worker) => total + worker.sectionRequests.filter((key) => key === '0,0,0').length, 0);
      const versions = (): string => {
        const internals = world as unknown as {
          chunkManager: { getChunk: (x: number, y: number, z: number) => { meshVersion: number } | undefined; pipeline: { getRecord: (key: string) => { generation: number } | undefined } };
        };
        return `${internals.chunkManager.getChunk(0, 0, 0)?.meshVersion}/${internals.chunkManager.pipeline.getRecord('0,0,0')?.generation}`;
      };
      world.setBlock(8, 8, 8, BlockId.Stone);
      // Pump past light-driven rebuilds: measure only once a batch is in
      // flight with settled versions (frozen era).
      for (let frame = 0; frame < 200; frame++) {
        world.update(1 / 60, 0, 0);
        await Promise.resolve();
        if (submitted() > 0 && world.getStats().pendingLight === 0 && frame > 5) break;
      }
      expect(submitted()).toBeGreaterThan(0);
      const beforeTeleport = submitted();
      const versionsBefore = versions();

      // Teleport within the settled area twice: the dirty-chunk rescan
      // re-queues the same chunk version without bumping it.
      for (let frame = 0; frame < 10; frame++) {
        world.update(1 / 60, 1, 0);
        await Promise.resolve();
      }
      for (let frame = 0; frame < 10; frame++) {
        world.update(1 / 60, 0, 0);
        await Promise.resolve();
      }
      // No version churn means no legitimate rebuild: the in-flight batch
      // was never cancelled for a duplicate.
      expect(versions()).toBe(versionsBefore);
      expect(submitted()).toBe(beforeTeleport);
      expect(world.getStats().workerMeshing!.failures).toBe(0);
    } finally {
      world.dispose();
    }
  });
});

describe('258 worker fallback recovery', () => {
  it('survives a throwing worker factory: nested sync fallback meshes without throwing', () => {
    const world = makeWorkerWorld(true, () => {
      throw new Error('no workers on this host');
    });
    try {
      // Phase timing enabled: the fallback runs nested inside the
      // `workerDispatch` bracket, which must attribute (not throw).
      world.setPhaseTimingEnabled(true);
      world.setBlock(8, 8, 8, BlockId.Stone);
      for (let frame = 0; frame < 200; frame++) {
        // Must never throw `WholeFrameMetrics: begin(...) while ... is open`.
        world.update(1 / 60, 0, 0);
        if (world.getStats().pendingGeneration === 0 && world.getStats().pendingMesh === 0) break;
      }
      const diagnostics = world.getStats().workerMeshing!;
      expect(diagnostics.fallbacks).toBeGreaterThanOrEqual(1);
      expect(world.getStats().pendingMesh).toBe(0);
      expect(sectionMeshes(world).has('0,0,0')).toBe(true);
      expect(diagnostics.activeBatches).toBe(0);
      // Phase totals drained cleanly (no stuck-open phase from the throw path).
      const totals = world.drainPhaseTotals();
      expect(Object.values(totals).every((t) => t >= 0)).toBe(true);
    } finally {
      world.dispose();
    }
  });

  it('recovers a mid-batch worker crash through bounded synchronous fallback', async () => {
    const world = makeWorkerWorld(true, () => new CrashingSectionWorker() as unknown as Worker);
    try {
      world.setBlock(8, 8, 8, BlockId.Stone);
      for (let frame = 0; frame < 200; frame++) {
        world.update(1 / 60, 0, 0);
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (world.getStats().pendingGeneration === 0 && world.getStats().pendingMesh === 0) break;
      }
      const diagnostics = world.getStats().workerMeshing!;
      // The crash was observed and counted...
      expect(diagnostics.failures).toBeGreaterThanOrEqual(1);
      expect(diagnostics.fallbacks).toBeGreaterThanOrEqual(1);
      // ...workers disabled, nothing leaked, and the chunk still meshed via
      // the synchronous fallback.
      expect(diagnostics.enabled).toBe(false);
      expect(diagnostics.activeBatches).toBe(0);
      expect(diagnostics.pendingJobs).toBe(0);
      expect(world.getStats().pendingMesh).toBe(0);
      expect(sectionMeshes(world).has('0,0,0')).toBe(true);
    } finally {
      world.dispose();
    }
  });
});
