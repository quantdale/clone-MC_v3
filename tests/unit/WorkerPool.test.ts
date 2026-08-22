import { describe, it, expect } from "vitest";
import {
  WorkerPool,
  DEFAULT_MAX_PENDING,
  UNVERSIONED_TOKEN_SENTINEL,
} from "../../src/engine/WorkerPool";
import {
  WORKER_PROTOCOL_VERSION,
  validateWorkerRequest,
  type WorkerRequest,
} from "../../src/rendering/WorkerJobProtocol";

/**
 * Fake worker "scope": a plain object satisfying the subset of the Worker contract
 * WorkerPool relies on (onmessage/onerror/onmessageerror handlers, postMessage,
 * terminate, optional close listener). No real Workers, no DOM, fully synchronous.
 */
class FakeWorkerScope {
  posted: { request: WorkerRequest; transfer: ArrayBuffer[] }[] = [];
  terminated = false;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  private closeListeners: (() => void)[] = [];

  addEventListener(type: string, listener: () => void): void {
    if (type === "close") this.closeListeners.push(listener);
  }

  postMessage(data: unknown, transfer: ArrayBuffer[]): void {
    // The pool builds its own envelope; validate it against the real protocol.
    this.posted.push({ request: validateWorkerRequest(data), transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Simulate the worker posting a well-formed result envelope back. */
  emit(
    fields: Partial<{
      jobId: string;
      kind: string;
      ok: boolean;
      generationToken: number;
      payload: unknown;
      error: string;
    }>,
  ): void {
    const last = this.posted[this.posted.length - 1]!.request;
    this.onmessage?.({
      data: {
        protocolVersion: WORKER_PROTOCOL_VERSION,
        jobId: fields.jobId ?? last.jobId,
        kind: fields.kind ?? last.kind,
        ok: fields.ok ?? true,
        generationToken: fields.generationToken ?? last.generationToken,
        payload: fields.payload,
        error: fields.error,
      },
    });
  }

  fail(): void {
    this.onerror?.();
  }

  close(): void {
    for (const l of this.closeListeners) l();
  }
}

interface Harness {
  pool: WorkerPool;
  scopes: FakeWorkerScope[];
}

function makePool(opts?: {
  size?: number;
  maxPending?: number;
  maxInFlightPerWorker?: number;
}): Harness {
  const scopes: FakeWorkerScope[] = [];
  const pool = new WorkerPool({
    spawn: () => {
      const s = new FakeWorkerScope();
      scopes.push(s);
      return s as unknown as Worker;
    },
    size: opts?.size ?? 1,
    maxPending: opts?.maxPending,
    maxInFlightPerWorker: opts?.maxInFlightPerWorker ?? 1,
  });
  return { pool, scopes };
}

function submit(
  pool: WorkerPool,
  overrides: Partial<Parameters<WorkerPool["submit"]>[0]> = {},
): {
  jobId: string;
  results: unknown[];
  failures: string[];
} {
  const results: unknown[] = [];
  const failures: string[] = [];
  const jobId = pool.submit({
    kind: "worldgen",
    generationToken: 1,
    payload: {},
    onResult: (payload) => results.push(payload),
    onFailure: (error) => failures.push(error),
    ...overrides,
  });
  return { jobId, results, failures };
}

describe("WorkerPool", () => {
  it("spawns one worker per configured slot via the caller-supplied spawn", () => {
    const { pool, scopes } = makePool({ size: 3 });
    expect(scopes.length).toBe(3);
    expect(pool.stats().workerCount).toBe(3);
    expect(DEFAULT_MAX_PENDING).toBe(64); // documented default queue cap
  });

  it("dispatches a submitted job immediately with a valid protocol envelope", () => {
    const { pool, scopes } = makePool();
    const { jobId } = submit(pool, { payload: { cx: 1 }, generationToken: 7 });
    expect(jobId).toBe("wp-1");
    expect(scopes[0]!.posted.length).toBe(1);
    const req = scopes[0]!.posted[0]!.request;
    expect(req.protocolVersion).toBe(WORKER_PROTOCOL_VERSION);
    expect(req.jobId).toBe(jobId);
    expect(req.generationToken).toBe(7);
    expect(req.payload).toEqual({ cx: 1 });
    expect(pool.inFlightCount).toBe(1);
    expect(pool.pendingCount).toBe(0);
  });

  it("dispatches queued jobs in priority order (higher first), FIFO within equal priority", () => {
    const { pool, scopes } = makePool({ size: 1, maxInFlightPerWorker: 1 });
    const order: string[] = [];
    const dispatched = () => scopes[0]!.posted.map((p) => p.request.payload);
    const w = (name: string, priority?: number) =>
      submit(pool, {
        payload: name,
        priority,
        onResult: (p) => order.push(p as string),
      });

    const a = w("A"); // dispatched immediately (only in-flight slot)
    const b = w("B", 1);
    const d = w("D", 1); // tie with B -> later seq
    const c = w("C", 5); // highest pending priority

    expect(dispatched()).toEqual(["A"]); // nothing else while saturated
    scopes[0]!.emit({ jobId: a.jobId, payload: "a" }); // frees the slot
    expect(dispatched()).toEqual(["A", "C"]); // highest pending priority dispatches first
    scopes[0]!.emit({ jobId: c.jobId, payload: "c" });
    expect(dispatched()).toEqual(["A", "C", "B"]); // FIFO within equal priority: B before D
    scopes[0]!.emit({ jobId: b.jobId, payload: "b" });
    expect(dispatched()).toEqual(["A", "C", "B", "D"]);
    scopes[0]!.emit({ jobId: d.jobId, payload: "d" });

    expect(order).toEqual(["a", "c", "b", "d"]);
  });

  it("rejects with RangeError when the bounded pending queue is full", () => {
    const { pool } = makePool({
      size: 1,
      maxInFlightPerWorker: 1,
      maxPending: 2,
    });
    submit(pool); // in flight
    submit(pool); // pending 1
    submit(pool); // pending 2
    expect(() => submit(pool)).toThrow(RangeError);
    expect(() => submit(pool)).toThrow(/full/);
    expect(pool.pendingCount).toBe(2);
  });

  it("cancel(jobId): requeues non-matching entries and resolves none of the cancelled afterwards (early-return regression)", () => {
    const { pool, scopes } = makePool({ size: 1, maxInFlightPerWorker: 1 });
    const a = submit(pool); // in flight
    const b = submit(pool, { payload: "B" }); // pending
    const c = submit(pool, { payload: "C" }); // pending
    expect(pool.pendingCount).toBe(2);

    expect(pool.cancel(b.jobId)).toBe(true);
    expect(pool.cancel("wp-does-not-exist")).toBe(false);
    // Regression: the cancelled entry must be removed WITHOUT dropping entries behind it.
    expect(pool.pendingCount).toBe(1);

    scopes[0]!.emit({ payload: "a" }); // frees slot -> survivor (C) must dispatch
    const survivors = scopes[0]!.posted.filter(
      (p) => p.request.jobId !== a.jobId && p.request.jobId !== b.jobId,
    );
    expect(survivors.length).toBeGreaterThanOrEqual(1);
    expect(survivors.some((p) => p.request.jobId === c.jobId)).toBe(true);

    scopes[0]!.emit({ payload: "c" });
    expect(c.results).toEqual(["c"]);
    // Cancelled job's callbacks never fire, even if a stale result arrives late.
    expect(b.results).toEqual([]);
    expect(b.failures).toEqual([]);
    scopes[0]!.emit({ jobId: b.jobId, payload: "late-B" });
    expect(b.results).toEqual([]);
    expect(pool.stats().cancelled).toBe(1);
    expect(pool.stats().stale).toBe(1);
  });

  it("rejects stale-token results before any caller callback sees them", () => {
    const { pool, scopes } = makePool();
    const job = submit(pool, { generationToken: 7 });
    scopes[0]!.emit({ generationToken: 9, payload: "wrong-revision" });
    expect(job.results).toEqual([]);
    expect(job.failures).toEqual([]);
    let stats = pool.stats();
    expect(stats.stale).toBe(1);
    expect(stats.completed).toBe(0);
    expect(pool.inFlightCount).toBe(0);

    // The sentinel bypasses strict matching by contract.
    const sentinelJob = submit(pool, { generationToken: 3 });
    scopes[0]!.emit({
      generationToken: UNVERSIONED_TOKEN_SENTINEL,
      payload: "ok",
    });
    expect(sentinelJob.results).toEqual(["ok"]);
    stats = pool.stats();
    expect(stats.stale).toBe(1);
    expect(stats.completed).toBe(1);
  });

  it("respawns on worker error/close and requeues lost in-flight jobs with callbacks intact", () => {
    const { pool, scopes } = makePool({ size: 1, maxInFlightPerWorker: 1 });
    const job = submit(pool, { payload: "lost" });
    scopes[0]!.fail(); // error -> respawn + requeue

    let stats = pool.stats();
    expect(stats.respawns).toBe(1);
    expect(stats.workerCount).toBe(1);
    expect(job.failures).toEqual([]); // not failed: requeued
    // The replacement worker receives the lost job again.
    expect(scopes[1]!.posted.map((p) => p.request.jobId)).toEqual([job.jobId]);

    scopes[1]!.emit({ payload: "recovered" });
    expect(job.results).toEqual(["recovered"]);
    stats = pool.stats();
    expect(stats.completed).toBe(1);
    expect(stats.failed).toBe(0);
  });

  it("respawns when the worker closes", () => {
    const { pool, scopes } = makePool({ size: 1, maxInFlightPerWorker: 1 });
    const job = submit(pool);
    scopes[0]!.close();
    expect(pool.stats().respawns).toBe(1);
    scopes[1]!.emit({ payload: "x" });
    expect(job.results.length).toBe(1);
  });

  it("delivers onFailure exactly once for an ok:false worker result", () => {
    const { pool, scopes } = makePool();
    const job = submit(pool);
    scopes[0]!.emit({ ok: false, error: "mesh exploded" });
    expect(job.results).toEqual([]);
    expect(job.failures).toEqual(["mesh exploded"]);
    const stats = pool.stats();
    expect(stats.failed).toBe(1);
    expect(stats.completed).toBe(0);
  });

  it("dispose terminates every worker, fails outstanding jobs once, and is idempotent", () => {
    const { pool, scopes } = makePool({ size: 2, maxInFlightPerWorker: 1 });
    const inflight = submit(pool);
    // With two workers (cap 1 each) both jobs dispatch immediately, one per slot.
    const second = submit(pool, { payload: "queued" });
    expect(second.failures).toEqual([]);

    expect(() => pool.dispose()).not.toThrow();
    expect(scopes.every((s) => s.terminated)).toBe(true);
    expect(inflight.failures).toEqual(["disposed"]);
    expect(inflight.results).toEqual([]);
    expect(pool.stats().pending).toBe(0);
    expect(pool.stats().inFlight).toBe(0);

    // Idempotent: second dispose fails nothing again.
    expect(() => pool.dispose()).not.toThrow();
    expect(inflight.failures).toEqual(["disposed"]); // still exactly one failure
    expect(pool.cancel(inflight.jobId)).toBe(false); // dead pool is inert
    expect(() => submit(pool)).toThrow(/disposed/);
  });

  it("keeps stats counters coherent through a full lifecycle", () => {
    const { pool, scopes } = makePool({
      size: 1,
      maxInFlightPerWorker: 1,
      maxPending: 4,
    });
    submit(pool); // j1: in flight
    submit(pool); // j2: pending
    const j3 = submit(pool);
    pool.cancel(j3.jobId);

    scopes[0]!.emit({ payload: 1 });
    scopes[0]!.emit({ ok: false, error: "bad" });
    scopes[0]!.emit({ payload: "late-stale" }); // already-resolved id -> stale

    const s = pool.stats();
    expect(s.submitted).toBe(3);
    expect(s.completed).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.stale).toBe(1);
    expect(s.workerCount).toBe(1);
    expect(s.inFlight).toBe(0);
    expect(s.pending).toBe(0);
  });
});

// ── Remaining WorkerPool paths (verification campaign) ──────────────────────

import { computeWorkerPoolSize } from "../../src/engine/WorkerPool";

describe("WorkerPool — sizing and validation", () => {
  it("clamps hardware concurrency to [1,4] with a cores-2 reserve", () => {
    expect(computeWorkerPoolSize(16)).toBe(4); // 14 clamped to MAX
    expect(computeWorkerPoolSize(8)).toBe(4);
    expect(computeWorkerPoolSize(5)).toBe(3);
    expect(computeWorkerPoolSize(3)).toBe(1);
    expect(computeWorkerPoolSize(2)).toBe(1); // 0 clamped up to MIN
    expect(computeWorkerPoolSize(1)).toBe(1);
  });

  it("falls back to 2 for unavailable or nonsensical core counts", () => {
    expect(computeWorkerPoolSize(Number.NaN)).toBe(2);
    expect(computeWorkerPoolSize(0)).toBe(2);
    expect(computeWorkerPoolSize(-4)).toBe(2);

    // The undefined-argument path reads navigator.hardwareConcurrency; stub it out so the
    // fallback branch is deterministic regardless of the host machine's core count.
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      configurable: true,
    });
    try {
      expect(computeWorkerPoolSize(undefined)).toBe(2);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: original,
        configurable: true,
      });
    }
  });

  it("rejects a non-integer or sub-minimum size naming the field", () => {
    expect(() => makePool({ size: 0 })).toThrow(/size must be an integer/);
    expect(() => makePool({ size: 2.5 })).toThrow(/size must be an integer/);
  });

  it("rejects an invalid maxInFlightPerWorker", () => {
    expect(() => makePool({ maxInFlightPerWorker: 0 })).toThrow(
      /maxInFlightPerWorker must be an integer/,
    );
  });
});

describe("WorkerPool — cancelByToken and malformed results", () => {
  it("cancelByToken cancels both pending and in-flight jobs carrying the token", () => {
    const { pool, scopes } = makePool({
      size: 1,
      maxInFlightPerWorker: 1,
      maxPending: 4,
    });

    const inFlight = submit(pool, { generationToken: 11, payload: "a" });
    const queued = submit(pool, { generationToken: 11, payload: "b" });
    const other = submit(pool, { generationToken: 12, payload: "c" });

    const cancelled = pool.cancelByToken(11);
    expect(cancelled).toBe(2);
    expect(pool.stats().cancelled).toBe(2);
    expect(inFlight.failures).toEqual([]);
    expect(inFlight.results).toEqual([]);

    // Freed capacity dispatches the survivor immediately; its result lands without any
    // unrelated triggering event.
    scopes[0]!.emit({ jobId: other.jobId, payload: "c-done" });
    expect(other.results).toEqual(["c-done"]);
    expect(queued.results).toEqual([]); // cancelled, never dispatched
    // A late echo of a token-cancelled job is rejected as stale (unknown id).
    scopes[0]!.emit({ jobId: inFlight.jobId, payload: "late" });
    expect(inFlight.results).toEqual([]);
    expect(pool.stats().stale).toBe(1);
  });

  it("counts malformed worker messages as stale without disturbing in-flight state", () => {
    const { pool, scopes } = makePool({ size: 1 });
    const job = submit(pool);

    // Raw garbage that fails validateWorkerResult.
    scopes[0]!.onmessage?.({ data: { broken: "not-a-valid-envelope" } });
    expect(pool.stats().stale).toBe(1);
    expect(pool.stats().inFlight).toBe(1); // untouched

    scopes[0]!.emit({ jobId: job.jobId, payload: "ok-now" });
    expect(job.results).toEqual(["ok-now"]);
  });

  it("UNVERSIONED_TOKEN_SENTINEL results bypass strict token matching", () => {
    const { pool, scopes } = makePool({ size: 1 });
    const job = submit(pool, { generationToken: 3 });
    scopes[0]!.emit({
      jobId: job.jobId,
      generationToken: UNVERSIONED_TOKEN_SENTINEL,
      payload: "sync",
    });
    expect(job.results).toEqual(["sync"]);
  });

  it("recoverSlot drops requeued jobs with onFailure when the pending queue is full", () => {
    const { pool, scopes } = makePool({
      size: 1,
      maxInFlightPerWorker: 1,
      maxPending: 1,
    });
    const lost = submit(pool); // in flight
    submit(pool, { payload: "filler" }); // fills the single pending slot

    scopes[0]!.fail(); // respawn; lost job must be requeued → queue full → failed
    expect(lost.failures.length).toBe(1);
    expect(lost.failures[0]).toMatch(/pending queue full/);
    expect(pool.stats().respawns).toBe(1);
  });
});
