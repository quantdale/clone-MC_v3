import { describe, it, expect } from "vitest";
import {
  processWorldgenRequest,
  processWorldgenColumnRequest,
  validateWorldgenRequest,
  validateWorldgenResult,
  WorldgenWorkerClient,
  WORLDGEN_PROTOCOL_VERSION,
  createWorldgenWorkerRuntime,
  type WorldgenRequestPayload,
} from "../../src/worldgen/WorkerWorldgen";
import { TERRAIN_GENERATION_VERSION } from "../../src/world/TerrainGenerator";

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
    expect(() => processWorldgenColumnRequest(REQUEST)).toThrow(/layout/i);
    expect(() =>
      processWorldgenColumnRequest({
        ...COLUMN_REQUEST,
        worldgenVersion: "old-version",
      }),
    ).toThrow(/worldgenVersion/i);
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
