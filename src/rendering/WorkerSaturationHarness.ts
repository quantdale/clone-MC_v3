/**
 * Worker/main-thread saturation harness (238, worker-job-saturation). Drives the 064 worker job path
 * (section meshing 065/070 and worldgen 086) at worst-case volume through a synchronous, injectable
 * `WorkerDispatch` (the real 064/086 clients are pure, synchronous dispatchers — there is no async
 * pool), enforces a bounded pending-job cap (`maxPendingJobs`) with deterministic rejection beyond it,
 * preserves exactly-once / stale-result semantics, measures per-job latency with an injectable clock,
 * and evaluates a mean/p95/total budget verdict mirroring 075's `evaluateRenderBudget`.
 *
 * Functional suites use a scripted `now()` for determinism; wall-clock throughput suites use
 * `performance.now()` under the documented median-with-warmup protocol. Pure and headless-safe.
 */
import {
  MeshWorkerClient,
  processMeshSectionRequest,
  type MeshSectionRequestPayload,
} from './WorkerMeshing';
import {
  WorldgenWorkerClient,
  processWorldgenRequest,
  type WorldgenRequestPayload,
} from '../worldgen/WorkerWorldgen';

/** Budget thresholds for a worker saturation burst. */
export interface WorkerSaturationConfig {
  /** Jobs submitted per run. */
  burstCount: number;
  /** Backpressure cap: pending jobs may never exceed this. */
  maxPendingJobs: number;
  /** Budget: mean per-job latency, in milliseconds. */
  maxMeanJobMillis: number;
  /** Budget: p95 per-job latency, in milliseconds. */
  maxP95JobMillis: number;
  /** Budget: whole-burst wall time, in milliseconds. */
  maxTotalMillis: number;
}

/**
 * Documented starting budget values, tuned against the measured baseline (recorded in
 * `verification.md`): a fully-dense 16³ slab mesh costs ~22 ms/job in the dev environment, so the
 * default mean/p95/total budgets are set with clear headroom to absorb CI wall-clock variance. These
 * are internal stress budgets for the deterministic harness; `evaluateWorkerSaturation` is the
 * verdict surface, and release-tier budgets belong to change 247.
 */
export const DEFAULT_WORKER_SATURATION_BUDGET: WorkerSaturationConfig = {
  burstCount: 256,
  maxPendingJobs: 128,
  maxMeanJobMillis: 50,
  maxP95JobMillis: 100,
  maxTotalMillis: 12000,
};

const CONFIG_FIELDS: readonly (keyof WorkerSaturationConfig)[] = [
  'burstCount',
  'maxPendingJobs',
  'maxMeanJobMillis',
  'maxP95JobMillis',
  'maxTotalMillis',
];

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Validate an unknown value as `WorkerSaturationConfig`. Returns the same value (narrowed) on
 * success; throws a descriptive error naming the offending field on any non-positive/non-finite/
 * non-numeric value or non-object input.
 */
export function validateWorkerSaturationConfig(input: unknown): WorkerSaturationConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WorkerSaturationConfig: must be an object');
  }
  const r = input as Record<string, unknown>;
  for (const field of CONFIG_FIELDS) {
    if (!isPositiveFinite(r[field])) {
      throw new Error(`WorkerSaturationConfig: ${field} must be a positive finite number, got ${String(r[field])}`);
    }
  }
  return input as WorkerSaturationConfig;
}

/** The outcome of one submitted worker job in a saturation burst. */
export interface WorkerJobMeasurement {
  jobId: string;
  ok: boolean;
  latencyMillis: number;
}

/** One dimension of a worker saturation budget evaluation. */
export interface WorkerBudgetEntry {
  dimension: 'mean' | 'p95' | 'total';
  budget: number;
  actual: number;
  withinBudget: boolean;
}

/** The full verdict for a worker saturation burst. */
export interface WorkerSaturationReport {
  withinBudget: boolean;
  entries: WorkerBudgetEntry[];
  /** Every accepted job's outcome; rejected (over-cap) jobs are counted in `rejectedCount`. */
  results: WorkerJobMeasurement[];
  /** Number of submissions rejected by the `maxPendingJobs` backpressure cap. */
  rejectedCount: number;
}

/**
 * The dispatch abstraction the harness drives. It wraps either `MeshWorkerClient` or
 * `WorldgenWorkerClient`, enforcing `maxPendingJobs` on submission and resolving each job exactly
 * once. Implementations are synchronous because the underlying clients are; a test may supply a
 * scripted-clock-advancing dispatch to control measured latency deterministically.
 */
export interface WorkerDispatch {
  /**
   * Submit one job. Returns a jobId. Throws a descriptive error when submission would push pending
   * jobs above `maxPendingJobs`; a rejected submission enqueues nothing.
   */
  submit(payload: unknown): string;
  /**
   * Resolve the pending job `jobId` to completion (the worker result is computed and handled through
   * the underlying client). Returns the resolved payload, or `null` when the job was cancelled,
   * already resolved, unknown, or identity-mismatched (stale).
   */
  awaitResult(jobId: string): unknown | null;
  /** Cancel a pending job; returns whether it was pending. */
  cancel(jobId: string): boolean;
  /** Number of pending (unresolved) jobs. */
  pendingCount(): number;
}

/**
 * A `WorkerDispatch` over `MeshWorkerClient`. Submissions are backpressure-capped; `awaitResult`
 * runs the real pure meshing job (`processMeshSectionRequest`) and resolves it through the client.
 */
export function createMeshDispatch(client: MeshWorkerClient, maxPendingJobs: number): WorkerDispatch {
  if (!isPositiveFinite(maxPendingJobs) || !Number.isInteger(maxPendingJobs)) {
    throw new Error('createMeshDispatch: maxPendingJobs must be a positive integer');
  }
  const payloads = new Map<string, MeshSectionRequestPayload>();
  return {
    submit(payload: unknown): string {
      if (client.pendingCount >= maxPendingJobs) {
        throw new Error(`worker dispatch: maxPendingJobs exceeded (${maxPendingJobs})`);
      }
      const request = payload as MeshSectionRequestPayload;
      const jobId = client.requestSection(request, () => undefined);
      payloads.set(jobId, request);
      return jobId;
    },
    awaitResult(jobId: string): unknown | null {
      const request = payloads.get(jobId);
      if (request === undefined) return null;
      const result = processMeshSectionRequest(request);
      const resolved = client.handleMessage(MeshWorkerClient.resultMessage(jobId, result));
      payloads.delete(jobId);
      return resolved;
    },
    cancel(jobId: string): boolean {
      return client.cancel(jobId);
    },
    pendingCount(): number {
      return client.pendingCount;
    },
  };
}

/**
 * A `WorkerDispatch` over `WorldgenWorkerClient`. Submissions are backpressure-capped; `awaitResult`
 * runs the real pure worldgen job (`processWorldgenRequest`) and resolves it through the client,
 * which requires identity match (086).
 */
export function createWorldgenDispatch(client: WorldgenWorkerClient, maxPendingJobs: number): WorkerDispatch {
  if (!isPositiveFinite(maxPendingJobs) || !Number.isInteger(maxPendingJobs)) {
    throw new Error('createWorldgenDispatch: maxPendingJobs must be a positive integer');
  }
  const payloads = new Map<string, WorldgenRequestPayload>();
  return {
    submit(payload: unknown): string {
      if (client.pendingCount >= maxPendingJobs) {
        throw new Error(`worker dispatch: maxPendingJobs exceeded (${maxPendingJobs})`);
      }
      const request = payload as WorldgenRequestPayload;
      const jobId = client.submit(request, () => undefined);
      payloads.set(jobId, request);
      return jobId;
    },
    awaitResult(jobId: string): unknown | null {
      const request = payloads.get(jobId);
      if (request === undefined) return null;
      const result = processWorldgenRequest(request);
      const resolved = client.handleMessage(WorldgenWorkerClient.resultMessage(jobId, result));
      payloads.delete(jobId);
      return resolved;
    },
    cancel(jobId: string): boolean {
      return client.cancel(jobId);
    },
    pendingCount(): number {
      return client.pendingCount;
    },
  };
}

/** Whether a latency actual is within budget (finite, non-negative, at or below). */
function withinLatency(budget: number, actual: number): boolean {
  if (typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0) return false;
  return actual <= budget;
}

/** The p-th percentile of a sorted latency sample. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return sorted[index] ?? sorted[sorted.length - 1]!;
}

/**
 * Evaluate measured burst latencies against the budget. Mirrors 075: a dimension is within budget
 * iff `actual <= budget`; malformed actuals violate; overall is within only when every dimension is.
 */
export function evaluateWorkerSaturation(
  config: WorkerSaturationConfig,
  actual: { meanMillis: number; p95Millis: number; totalMillis: number },
): WorkerSaturationReport {
  const cfg = validateWorkerSaturationConfig(config);
  const entries: WorkerBudgetEntry[] = [
    { dimension: 'mean', budget: cfg.maxMeanJobMillis, actual: actual.meanMillis, withinBudget: withinLatency(cfg.maxMeanJobMillis, actual.meanMillis) },
    { dimension: 'p95', budget: cfg.maxP95JobMillis, actual: actual.p95Millis, withinBudget: withinLatency(cfg.maxP95JobMillis, actual.p95Millis) },
    { dimension: 'total', budget: cfg.maxTotalMillis, actual: actual.totalMillis, withinBudget: withinLatency(cfg.maxTotalMillis, actual.totalMillis) },
  ];
  return { withinBudget: entries.every((entry) => entry.withinBudget), entries, results: [], rejectedCount: 0 };
}

/** A fixed dense section payload (opaque lower half, clear upper half) for meshing bursts. */
function denseMeshPayload(): MeshSectionRequestPayload {
  const cells = new Array(4096).fill(null);
  for (let i = 0; i < 2048; i++) cells[i] = 1;
  return {
    sectionX: 0,
    sectionY: 0,
    sectionZ: 0,
    cells,
    opaqueIds: [1],
    skyLight: new Array(4096).fill(15),
    blockLight: new Array(4096).fill(0),
  };
}

/**
 * Submit a burst of `config.burstCount` section-meshing jobs through `dispatch`, resolve every
 * accepted job exactly once, and evaluate the burst against the meshing budget. Submissions beyond
 * `maxPendingJobs` are rejected (counted in `rejectedCount`, never enqueued).
 */
export function runMeshSaturation(
  config: WorkerSaturationConfig,
  dispatch: WorkerDispatch,
  now: () => number,
): WorkerSaturationReport {
  const cfg = validateWorkerSaturationConfig(config);
  const accepted: Array<{ jobId: string; start: number }> = [];
  let rejectedCount = 0;

  for (let i = 0; i < cfg.burstCount; i++) {
    let start = 0;
    let jobId: string;
    try {
      start = now();
      jobId = dispatch.submit(denseMeshPayload());
    } catch {
      rejectedCount++;
      continue;
    }
    accepted.push({ jobId, start });
  }

  return finishWorkerBurst(cfg, accepted, dispatch, now, rejectedCount);
}

/**
 * Submit a burst of `config.burstCount` worldgen jobs through `dispatch`, resolve every accepted job
 * exactly once (identity match enforced by the client), and evaluate against the worldgen budget.
 */
export function runWorldgenSaturation(
  config: WorkerSaturationConfig,
  dispatch: WorkerDispatch,
  now: () => number,
): WorkerSaturationReport {
  const cfg = validateWorkerSaturationConfig(config);
  const accepted: Array<{ jobId: string; start: number }> = [];
  let rejectedCount = 0;

  for (let i = 0; i < cfg.burstCount; i++) {
    const payload: WorldgenRequestPayload = { columnX: i, columnZ: i % 8, seed: 42, stage: 'TERRAIN' };
    let start = 0;
    let jobId: string;
    try {
      start = now();
      jobId = dispatch.submit(payload);
    } catch {
      rejectedCount++;
      continue;
    }
    accepted.push({ jobId, start });
  }

  return finishWorkerBurst(cfg, accepted, dispatch, now, rejectedCount);
}

/** Resolve the accepted jobs, measure per-job latency, and build the report. */
function finishWorkerBurst(
  cfg: WorkerSaturationConfig,
  accepted: Array<{ jobId: string; start: number }>,
  dispatch: WorkerDispatch,
  now: () => number,
  rejectedCount: number,
): WorkerSaturationReport {
  const results: WorkerJobMeasurement[] = [];
  const latencies: number[] = [];
  let total = 0;

  for (const { jobId, start } of accepted) {
    const ok = dispatch.awaitResult(jobId) !== null;
    const latency = Math.max(0, now() - start);
    latencies.push(latency);
    total += latency;
    results.push({ jobId, ok, latencyMillis: latency });
  }

  const report = evaluateWorkerSaturation(cfg, {
    meanMillis: latencies.length > 0 ? total / latencies.length : 0,
    p95Millis: percentile(latencies, 0.95),
    totalMillis: total,
  });
  report.results = results;
  report.rejectedCount = rejectedCount;
  return report;
}
