import { describe, it, expect } from "vitest";
import {
  processWorldgenRequest,
  processWorldgenColumnRequest,
  validateWorldgenRequest,
  validateWorldgenResult,
  commitWorldgenResult,
  WorldgenWorkerClient,
  WORLDGEN_PROTOCOL_VERSION,
  createWorldgenWorkerRuntime,
  type WorldgenRequestPayload,
} from "../../src/worldgen/WorkerWorldgen";
import { TERRAIN_GENERATION_VERSION, TerrainGenerator } from "../../src/world/TerrainGenerator";
import { ChunkColumn } from "../../src/world/ChunkColumn";
import { CanonicalWorldStorage } from "../../src/world/CanonicalWorldStorage";
import { createDefaultBlockRegistry, BlockId } from "../../src/world/BlockRegistry";
import { createDefaultBlockStateRegistry } from "../../src/world/BlockStateRegistry";
import { OVERWORLD_DIMENSION_TYPE } from "../../src/data/DimensionTypes";
import { ChunkStatus } from "../../src/world/ChunkStatus";
import { createDefaultWorldgenMatrix } from "../../src/worldgen/WorldgenRegressionMatrix";

const REQUEST: WorldgenRequestPayload = {
  columnX: 3,
  columnZ: -5,
  seed: 42,
  stage: "TERRAIN",
};

describe("validateWorldgenRequest", () => {
  it("accepts a valid request", () => {
    expect(validateWorldgenRequest(REQUEST)).toEqual(REQUEST);
  });

  it("rejects malformed requests naming the field", () => {
    expect(() => validateWorldgenRequest({ ...REQUEST, columnX: 1.5 })).toThrow(
      /columnX/i,
    );
    expect(() => validateWorldgenRequest({ ...REQUEST, columnZ: NaN })).toThrow(
      /columnZ/i,
    );
    expect(() => validateWorldgenRequest({ ...REQUEST, seed: "42" })).toThrow(
      /seed/i,
    );
    expect(() =>
      validateWorldgenRequest({ ...REQUEST, stage: "MOON" }),
    ).toThrow(/stage/i);
    expect(() => validateWorldgenRequest(null)).toThrow(/object/i);
  });
});

describe("processWorldgenRequest", () => {
  it("returns the versioned identity-echoing envelope", () => {
    expect(processWorldgenRequest(REQUEST)).toEqual({
      columnX: 3,
      columnZ: -5,
      seed: 42,
      stage: "TERRAIN",
      generationVersion: WORLDGEN_PROTOCOL_VERSION,
    });
  });

  it("is pure and deterministic", () => {
    expect(processWorldgenRequest(REQUEST)).toEqual(
      processWorldgenRequest(REQUEST),
    );
  });
});

describe("processWorldgenColumnRequest", () => {
  const COLUMN_REQUEST: WorldgenRequestPayload = {
    columnX: -7,
    columnZ: 11,
    seed: 42,
    stage: "TERRAIN",
    sectionCount: 24,
    minSectionY: -4,
    worldgenVersion: TERRAIN_GENERATION_VERSION,
    columnStatus: ChunkStatus.Empty,
    columnRevision: 0,
  };

  it("generates a validated serialized canonical column", () => {
    const result = processWorldgenColumnRequest(COLUMN_REQUEST);
    expect(result).toMatchObject({
      columnX: -7,
      columnZ: 11,
      seed: 42,
      stage: "TERRAIN",
      generationVersion: WORLDGEN_PROTOCOL_VERSION,
      worldgenVersion: TERRAIN_GENERATION_VERSION,
    });
    expect(result.serializedColumn).toMatchObject({
      version: 1,
      chunkX: -7,
      chunkZ: 11,
      sectionCount: 24,
      minSectionY: -4,
    });
    expect(validateWorldgenResult(result)).toEqual(result);
  });

  it("is bit-deterministic for negative column coordinates", () => {
    expect(processWorldgenColumnRequest(COLUMN_REQUEST)).toEqual(
      processWorldgenColumnRequest(COLUMN_REQUEST),
    );
  });

  it("requires the current layout and worldgen version", () => {
    expect(() => processWorldgenColumnRequest(REQUEST)).toThrow(/worldgenVersion|layout/i);
    expect(() =>
      processWorldgenColumnRequest({
        ...COLUMN_REQUEST,
        worldgenVersion: "old-version",
      }),
    ).toThrow(/worldgenVersion/i);
    expect(() =>
      processWorldgenColumnRequest({
        ...COLUMN_REQUEST,
        sectionCount: 16,
      }),
    ).toThrow(/layout/i);
    expect(() =>
      processWorldgenColumnRequest({
        ...COLUMN_REQUEST,
        minSectionY: 0,
      }),
    ).toThrow(/layout/i);
  });

  it("retains the synchronous fallback contract", () => {
    const result = processWorldgenColumnRequest(COLUMN_REQUEST);
    const registry = createDefaultBlockRegistry();
    const stateRegistry = createDefaultBlockStateRegistry();
    const fallback = new ChunkColumn({
      chunkX: COLUMN_REQUEST.columnX,
      chunkZ: COLUMN_REQUEST.columnZ,
      sectionCount: COLUMN_REQUEST.sectionCount!,
      minSectionY: COLUMN_REQUEST.minSectionY!,
      registry: stateRegistry,
      blockRegistry: registry,
    });
    new TerrainGenerator(registry, COLUMN_REQUEST.seed).generateColumn(fallback, stateRegistry);

    expect(fallback.serialize()).toEqual(result.serializedColumn);
  });
});

describe("workerized worldgen parity and reload", () => {
  const seeds = [0, 1, 42, 1337, 9999];
  const coordinates: Array<[number, number]> = [
    [0, 0],
    [-1, 0],
    [0, -1],
    [-2, 3],
    [7, -9],
    [31, -32],
    [-16, -12],
    [-16, 15],
    [-40, -40],
    [-35, 40],
  ];

  function request(seed: number, chunkX: number, chunkZ: number): WorldgenRequestPayload {
    return {
      columnX: chunkX,
      columnZ: chunkZ,
      seed,
      stage: "TERRAIN",
      sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
      minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
      worldgenVersion: TERRAIN_GENERATION_VERSION,
      columnStatus: ChunkStatus.Empty,
      columnRevision: 0,
    };
  }

  function blockIds(column: ChunkColumn): number[] {
    const ids: number[] = [];
    for (let y = OVERWORLD_DIMENSION_TYPE.minY; y <= OVERWORLD_DIMENSION_TYPE.maxY; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) ids.push(column.getBlockState(x, y, z).blockId);
      }
    }
    return ids;
  }

  it("matches synchronous generation across seeds, negative coordinates, and feature bounds", () => {
    for (const seed of seeds) {
      for (const [chunkX, chunkZ] of coordinates) {
        const result = processWorldgenColumnRequest(request(seed, chunkX, chunkZ));
        const registry = createDefaultBlockRegistry();
        const stateRegistry = createDefaultBlockStateRegistry();
        const fallback = new ChunkColumn({
          chunkX,
          chunkZ,
          sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
          minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
          registry: stateRegistry,
          blockRegistry: registry,
        });
        new TerrainGenerator(registry, seed).generateColumn(fallback, stateRegistry);
        expect(result.serializedColumn).toEqual(fallback.serialize());
        expect(result.serializedColumn?.sections).not.toEqual({});

        const serialized = result.serializedColumn!;
        const restored = ChunkColumn.deserialize(
          serialized,
          stateRegistry,
          undefined,
          registry,
        );
        expect(blockIds(restored)).toEqual(blockIds(fallback));
        expect(restored.getBlockState(0, OVERWORLD_DIMENSION_TYPE.minY, 0).blockId).toBe(
          fallback.getBlockState(0, OVERWORLD_DIMENSION_TYPE.minY, 0).blockId,
        );
        expect(restored.getBlockState(15, OVERWORLD_DIMENSION_TYPE.maxY, 15).blockId).toBe(
          fallback.getBlockState(15, OVERWORLD_DIMENSION_TYPE.maxY, 15).blockId,
        );
      }
    }
  });

  it("preserves pinned ore, cave, and structure feature outcomes", () => {
    const catalog = createDefaultWorldgenMatrix();
    const featureFixtures = catalog.filter(
      (fixture) => fixture.kind === "ore" || fixture.kind === "cave" || fixture.kind === "structure",
    );
    const registry = createDefaultBlockRegistry();
    const stateRegistry = createDefaultBlockStateRegistry();

    for (const fixture of featureFixtures) {
      const chunkX = Math.floor(fixture.x / 16);
      const chunkZ = Math.floor(fixture.z / 16);
      const result = processWorldgenColumnRequest(request(fixture.seed, chunkX, chunkZ));
      const restored = ChunkColumn.deserialize(result.serializedColumn!, stateRegistry, undefined, registry);
      const localX = fixture.x - chunkX * 16;
      const localZ = fixture.z - chunkZ * 16;

      if (fixture.kind === "ore" || fixture.kind === "cave") {
        expect(restored.getBlockState(localX, fixture.y, localZ).blockId).toBe(fixture.expected);
      }

      const fallback = new ChunkColumn({
        chunkX,
        chunkZ,
        sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
        minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
        registry: stateRegistry,
        blockRegistry: registry,
      });
      new TerrainGenerator(registry, fixture.seed).generateColumn(fallback, stateRegistry);
      expect(result.serializedColumn).toEqual(fallback.serialize());
    }
  });

  it("is byte-stable after worker serialization and reload", () => {
    const first = processWorldgenColumnRequest(request(1337, -1, -1));
    const second = processWorldgenColumnRequest(request(1337, -1, -1));
    expect(JSON.stringify(first.serializedColumn)).toBe(JSON.stringify(second.serializedColumn));

    const registry = createDefaultBlockRegistry();
    const stateRegistry = createDefaultBlockStateRegistry();
    const restored = ChunkColumn.deserialize(first.serializedColumn!, stateRegistry, undefined, registry);
    expect(JSON.stringify(restored.serialize())).toBe(JSON.stringify(first.serializedColumn));
  });
});


describe("validateWorldgenResult", () => {
  it("accepts a valid versioned result", () => {
    expect(validateWorldgenResult(processWorldgenRequest(REQUEST))).toEqual(
      processWorldgenRequest(REQUEST),
    );
  });

  it("rejects wrong versions and malformed shapes", () => {
    const result = processWorldgenRequest(REQUEST);
    expect(() =>
      validateWorldgenResult({ ...result, generationVersion: 99 }),
    ).toThrow(/generationVersion/i);
    expect(() => validateWorldgenResult({ ...result, columnX: 1.5 })).toThrow(
      /columnX/i,
    );
    expect(() => validateWorldgenResult({ ...result, stage: "MOON" })).toThrow(
      /stage/i,
    );
    expect(() => validateWorldgenResult(null)).toThrow(/object/i);
  });
});

describe("WorldgenWorkerClient", () => {
  it("dispatches a valid matching result exactly once", () => {
    const client = new WorldgenWorkerClient();
    const calls: Array<[string, number]> = [];
    const jobId = client.submit(REQUEST, (result) =>
      calls.push([result.stage, result.generationVersion]),
    );

    const payload = processWorldgenRequest(REQUEST);
    const returned = client.handleMessage(
      WorldgenWorkerClient.resultMessage(jobId, payload),
    );

    expect(calls).toEqual([["TERRAIN", 1]]);
    expect(returned).toEqual(payload);
    expect(client.pendingCount).toBe(0);
  });

  it("drops identity-mismatched results without callbacks (job consumed; re-submit)", () => {
    const client = new WorldgenWorkerClient();
    let calls = 0;
    const jobId = client.submit(REQUEST, () => calls++);

    const wrongColumn = processWorldgenRequest({ ...REQUEST, columnX: 9 });
    expect(
      client.handleMessage(
        WorldgenWorkerClient.resultMessage(jobId, wrongColumn),
      ),
    ).toBeNull();
    expect(calls).toBe(0);
    expect(client.pendingCount).toBe(0); // the result consumed the job; the caller re-submits

    const retry = client.submit(REQUEST, () => calls++);
    const good = processWorldgenRequest(REQUEST);
    expect(
      client.handleMessage(WorldgenWorkerClient.resultMessage(retry, good)),
    ).not.toBeNull();
    expect(calls).toBe(1);
  });

  it("rejects stale, duplicate, and cancelled results without callbacks", () => {
    const client = new WorldgenWorkerClient();
    let calls = 0;
    const jobId = client.submit(REQUEST, () => calls++);
    const payload = processWorldgenRequest(REQUEST);

    expect(
      client.handleMessage(
        WorldgenWorkerClient.resultMessage("ghost", payload),
      ),
    ).toBeNull();
    expect(
      client.handleMessage({ protocolVersion: 99, jobId, ok: true, payload }),
    ).toBeNull(); // bad protocol
    expect(
      client.handleMessage(WorldgenWorkerClient.resultMessage(jobId, payload)),
    ).not.toBeNull();
    expect(
      client.handleMessage(WorldgenWorkerClient.resultMessage(jobId, payload)),
    ).toBeNull(); // duplicate
    expect(calls).toBe(1);

    const job2 = client.submit(REQUEST, () => calls++);
    expect(client.cancel(job2)).toBe(true);
    expect(
      client.handleMessage(WorldgenWorkerClient.resultMessage(job2, payload)),
    ).toBeNull();
    expect(calls).toBe(1);
    expect(client.pendingCount).toBe(0);
  });

  it("tracks pending lifecycle across resolve and cancel", () => {
    const client = new WorldgenWorkerClient();
    const a = client.submit(REQUEST, () => undefined);
    const b = client.submit(REQUEST, () => undefined);
    expect(client.pendingCount).toBe(2);

    client.handleMessage(
      WorldgenWorkerClient.resultMessage(a, processWorldgenRequest(REQUEST)),
    );
    expect(client.pendingCount).toBe(1);
    expect(client.cancel(b)).toBe(true);
    expect(client.pendingCount).toBe(0);
  });
});

// ── Pool-mode dispatch coverage (verification campaign) ─────────────────────

import type { WorkerPool } from "../../src/engine/WorkerPool";

/** Minimal controllable pool double capturing submitted jobs. */
class FakePool {
  readonly submitted: Array<{
    kind: string;
    generationToken: number;
    payload: unknown;
    priority?: number;
    onResult: (payload: unknown) => void;
    onFailure: (error?: string) => void;
  }> = [];
  readonly cancelled: string[] = [];
  throwOnSubmit = false;

  submit(opts: {
    kind: string;
    generationToken: number;
    payload: unknown;
    priority?: number;
    onResult: (payload: unknown) => void;
    onFailure: (error?: string) => void;
  }): string {
    if (this.throwOnSubmit) throw new RangeError("pending queue is full");
    this.submitted.push(opts);
    return `fake-${this.submitted.length}`;
  }

  cancel(jobId: string): boolean {
    this.cancelled.push(jobId);
    return true;
  }

  /** Satisfy a fake-pool contract subset without touching the real WorkerPool type. */
  asPool(): WorkerPool {
    return this as unknown as WorkerPool;
  }
}

describe("WorldgenWorkerClient — pooled mode", () => {
  const REQUEST: WorldgenRequestPayload = {
    columnX: 8,
    columnZ: -2,
    seed: 7,
    stage: "TERRAIN",
  };

  function resultFor(payload: WorldgenRequestPayload): Record<string, unknown> {
    return { ...payload, generationVersion: 1 };
  }

  it("dispatches to the pool and resolves exactly once on a valid matching result", () => {
    const pool = new FakePool();
    const client = new WorldgenWorkerClient({ pool: pool.asPool() });
    let results = 0;
    const jobId = client.submit(REQUEST, () => results++, { priority: 17 });

    expect(pool.submitted.length).toBe(1);
    expect(pool.submitted[0]!.kind).toBe("worldgen");
    expect(pool.submitted[0]!.payload).toEqual(REQUEST);
    expect(pool.submitted[0]!.priority).toBe(17);

    pool.submitted[0]!.onResult(resultFor(REQUEST));
    expect(results).toBe(1);
    void jobId;
  });

  it("abandons (no callback, no throw) on invalid or foreign pool payloads", () => {
    const pool = new FakePool();
    const client = new WorldgenWorkerClient({ pool: pool.asPool() });
    let results = 0;
    client.submit(REQUEST, () => results++);

    // Malformed payload: never resolves the job.
    pool.submitted[0]!.onResult({ nonsense: true });
    // Foreign identity: right shape, wrong column.
    pool.submitted[0]!.onResult(resultFor({ ...REQUEST, columnX: 99 }));
    expect(results).toBe(0);
    expect(client.pendingCount).toBe(0); // bookkeeping dropped both times

    // A late duplicate of a resolved job is also inert.
    client.submit(REQUEST, () => results++);
    pool.submitted[1]!.onResult(resultFor(REQUEST));
    pool.submitted[1]!.onResult(resultFor(REQUEST));
    expect(results).toBe(1);
  });

  it("abandons on pool failure without delivering", () => {
    const pool = new FakePool();
    const client = new WorldgenWorkerClient({ pool: pool.asPool() });
    let results = 0;
    client.submit(REQUEST, () => results++);

    pool.submitted[0]!.onFailure();
    expect(results).toBe(0);
    expect(client.pendingCount).toBe(0);
  });

  it("rethrows synchronous pool rejection after abandoning the job", () => {
    const pool = new FakePool();
    pool.throwOnSubmit = true;
    const client = new WorldgenWorkerClient({ pool: pool.asPool() });

    expect(() => client.submit(REQUEST, () => {})).toThrow(RangeError);
    expect(client.pendingCount).toBe(0);
  });

  it("setGenerationToken keeps old-token pending jobs stale via cancelByToken", () => {
    const pool = new FakePool();
    const client = new WorldgenWorkerClient({
      pool: pool.asPool(),
      generationToken: 1,
    });
    let results = 0;
    const oldJob = client.submit(REQUEST, () => results++);
    void oldJob;

    client.setGenerationToken(2);
    const cancelled = client.cancelByToken(1);
    expect(cancelled).toBeGreaterThanOrEqual(1);
    expect(pool.cancelled).toEqual(["fake-1"]);
    // The superseded result can no longer resolve anything.
    pool.submitted[0]!.onResult(resultFor(REQUEST));
    expect(results).toBe(0);
  });
});

describe("createWorldgenWorkerRuntime", () => {
  class RuntimeWorker {
    posted: unknown[] = [];
    terminated = false;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;

    postMessage(message: unknown): void {
      this.posted.push(message);
    }

    terminate(): void {
      this.terminated = true;
    }

    addEventListener(): void {
      // WorkerPool only needs this optional hook for real worker close events.
    }
  }

  it("uses a bounded pool and disposes pending jobs before worker termination", () => {
    const workers: RuntimeWorker[] = [];
    const runtime = createWorldgenWorkerRuntime({
      size: 1,
      maxPending: 1,
      maxInFlightPerWorker: 1,
      workerFactory: () => {
        const worker = new RuntimeWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
    });
    const request: WorldgenRequestPayload = {
      ...REQUEST,
      sectionCount: 24,
      minSectionY: -4,
      worldgenVersion: TERRAIN_GENERATION_VERSION,
    };
    let results = 0;
    runtime.client.submit(request, () => results++);
    expect(runtime.pool.stats().inFlight).toBe(1);
    runtime.client.submit(request, () => {});
    expect(() => runtime.client.submit(request, () => {})).toThrow(RangeError);

    runtime.dispose();
    runtime.dispose();
    expect(runtime.client.pendingCount).toBe(0);
    expect(runtime.pool.stats().workerCount).toBe(0);
    expect(workers[0]!.terminated).toBe(true);
    expect(results).toBe(0);
    expect(() => runtime.client.submit(request, () => {})).toThrow(/disposed/i);
  });
});

describe("atomic canonical worldgen commit", () => {
  const request: WorldgenRequestPayload = {
    columnX: -2,
    columnZ: 3,
    seed: 99,
    stage: "TERRAIN",
    sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
    minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
    worldgenVersion: TERRAIN_GENERATION_VERSION,
    columnStatus: ChunkStatus.Empty,
    columnRevision: 0,
  };

  function makeStorage(): CanonicalWorldStorage {
    return new CanonicalWorldStorage({
      dimension: OVERWORLD_DIMENSION_TYPE,
      blockRegistry: createDefaultBlockRegistry(),
      stateRegistry: createDefaultBlockStateRegistry(),
    });
  }

  it("commits validated worker output atomically and marks the column full", () => {
    const storage = makeStorage();
    const before = storage.ensureColumn(request.columnX, request.columnZ);
    const result = processWorldgenColumnRequest(request);

    const committed = commitWorldgenResult(storage, result, { expectedSeed: request.seed });

    expect(committed.committed).toBe(true);
    expect(storage.getColumn(request.columnX, request.columnZ)).not.toBe(before);
    expect(storage.getColumn(request.columnX, request.columnZ)?.getStatus()).toBe(ChunkStatus.Full);
    expect(storage.getBlock(request.columnX * 16, 0, request.columnZ * 16)).not.toBe(BlockId.Air);
  });

  it("rejects a result captured before an edit without replacing the edited column", () => {
    const storage = makeStorage();
    const current = storage.ensureColumn(request.columnX, request.columnZ);
    const result = processWorldgenColumnRequest(request);
    storage.setBlock(request.columnX * 16, OVERWORLD_DIMENSION_TYPE.minY, request.columnZ * 16, BlockId.Glass);

    const committed = commitWorldgenResult(storage, result, { expectedSeed: request.seed });

    expect(committed).toEqual({ committed: false, reason: "stale-revision" });
    expect(storage.getColumn(request.columnX, request.columnZ)).toBe(current);
    expect(storage.getBlock(request.columnX * 16, OVERWORLD_DIMENSION_TYPE.minY, request.columnZ * 16)).toBe(BlockId.Glass);
  });

  it("rejects a result when the column status changes before completion", () => {
    const storage = makeStorage();
    const current = storage.ensureColumn(request.columnX, request.columnZ);
    const result = processWorldgenColumnRequest(request);
    current.setStatus(ChunkStatus.Noise);

    const committed = commitWorldgenResult(storage, result, { expectedSeed: request.seed });

    expect(committed).toEqual({ committed: false, reason: "stale-status" });
    expect(storage.getColumn(request.columnX, request.columnZ)).toBe(current);
  });

  it("rejects foreign, malformed, wrong-seed, and wrong-layout results without mutation", () => {
    const storage = makeStorage();
    const current = storage.ensureColumn(request.columnX, request.columnZ);
    const result = processWorldgenColumnRequest(request);

    expect(commitWorldgenResult(storage, { ...result, columnX: 100 })).toEqual({
      committed: false,
      reason: "invalid-result",
    });
    expect(commitWorldgenResult(storage, { ...result, seed: 1 }, { expectedSeed: request.seed })).toEqual({
      committed: false,
      reason: "seed-mismatch",
    });
    expect(commitWorldgenResult(storage, {
      ...result,
      serializedColumn: { ...result.serializedColumn!, sectionCount: 1 },
    })).toEqual({
      committed: false,
      reason: "invalid-layout",
    });
    expect(commitWorldgenResult(storage, { serializedColumn: result.serializedColumn })).toEqual({
      committed: false,
      reason: "invalid-result",
    });
    expect(storage.getColumn(request.columnX, request.columnZ)).toBe(current);
    expect(storage.getColumn(request.columnX, request.columnZ)?.generationRevision).toBe(0);
  });
});
