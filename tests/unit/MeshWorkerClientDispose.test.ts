import { describe, it, expect, vi } from "vitest";
import {
  MeshWorkerClient,
  type MeshSectionRequestPayload,
} from "../../src/rendering/WorkerMeshing";
import type { WorkerPool } from "../../src/engine/WorkerPool";

/**
 * Change 269 (R-6 closure): `MeshWorkerClient.dispose()` must abandon every
 * pending job WITHOUT invoking result/rejection callbacks, clear wall-clock
 * timeouts, cancel owned pool jobs, and refuse further work — so no
 * post-dispose callback can mutate disposed World state. No real Workers,
 * no DOM; uses the repo-standard FakePool double.
 */

/** Minimal controllable pool double capturing submitted jobs. */
class FakePool {
  readonly submitted: Array<{
    kind: string;
    generationToken: number;
    payload: unknown;
    onResult: (payload: unknown) => void;
    onFailure: () => void;
  }> = [];
  cancelled: string[] = [];

  cancel(jobId: string): boolean {
    this.cancelled.push(jobId);
    return true;
  }

  submit(opts: {
    kind: string;
    generationToken: number;
    payload: unknown;
    onResult: (payload: unknown) => void;
    onFailure: () => void;
  }): string {
    this.submitted.push(opts);
    return `fake-${this.submitted.length}`;
  }

  asPool(): WorkerPool {
    return this as unknown as WorkerPool;
  }
}

function sectionPayload(): MeshSectionRequestPayload {
  return {
    sectionX: 1,
    sectionY: 0,
    sectionZ: -1,
    cells: new Array(4096).fill(null),
    opaqueIds: [1],
    skyLight: new Array(4096).fill(15),
    blockLight: new Array(4096).fill(0),
  };
}

function validResult() {
  return {
    sectionX: 1,
    sectionY: 0,
    sectionZ: -1,
    quads: [],
  };
}

describe("MeshWorkerClient.dispose (269)", () => {
  it("abandons pending jobs with zero callbacks and clears timeouts", () => {
    vi.useFakeTimers();
    try {
      const pool = new FakePool();
      const client = new MeshWorkerClient({ pool: pool.asPool(), timeoutMs: 25 });
      let resolved = 0;
      let rejected = 0;
      client.requestSection(sectionPayload(), () => resolved++, () => rejected++);
      client.requestSection(sectionPayload(), () => resolved++, () => rejected++);
      expect(client.pendingCount).toBe(2);

      client.dispose();

      expect(resolved).toBe(0);
      expect(rejected).toBe(0);
      expect(client.pendingCount).toBe(0);
      // Both owned pool jobs were cancelled.
      expect(pool.cancelled).toEqual(["fake-1", "fake-2"]);

      // Wall-clock timeouts are gone: advancing time fires nothing.
      vi.advanceTimersByTime(10_000);
      expect(resolved).toBe(0);
      expect(rejected).toBe(0);

      // Late pool deliveries land on abandoned jobs and are swallowed.
      pool.submitted[0]!.onResult(validResult());
      pool.submitted[1]!.onFailure();
      expect(resolved).toBe(0);
      expect(rejected).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is idempotent: a second dispose throws nothing and fires nothing", () => {
    const pool = new FakePool();
    const client = new MeshWorkerClient({ pool: pool.asPool(), timeoutMs: 0 });
    let resolved = 0;
    client.requestSection(sectionPayload(), () => resolved++);
    client.dispose();
    expect(() => client.dispose()).not.toThrow();
    expect(resolved).toBe(0);
    expect(client.pendingCount).toBe(0);
    // Pool jobs cancelled exactly once (once per job, on the first dispose).
    expect(pool.cancelled).toEqual(["fake-1"]);
  });

  it("refuses new work after dispose: submit throws, message returns null", () => {
    const pool = new FakePool();
    const client = new MeshWorkerClient({ pool: pool.asPool(), timeoutMs: 0 });
    const jobId = client.requestSection(sectionPayload(), () => undefined);
    client.dispose();

    expect(() => client.requestSection(sectionPayload(), () => {})).toThrow(
      /client is disposed/,
    );
    expect(pool.submitted.length).toBe(1); // nothing enqueued post-dispose
    expect(
      client.handleMessage(MeshWorkerClient.resultMessage(jobId, validResult())),
    ).toBeNull();
    expect(client.cancel(jobId)).toBe(false);
    expect(client.cancelByToken(0)).toBe(0);
  });

  it("dispose with no pending jobs is a clean no-op", () => {
    const pool = new FakePool();
    const client = new MeshWorkerClient({ pool: pool.asPool(), timeoutMs: 0 });
    expect(() => client.dispose()).not.toThrow();
    expect(client.pendingCount).toBe(0);
    expect(pool.cancelled).toEqual([]);
  });
});
