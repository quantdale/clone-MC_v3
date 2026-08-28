/**
 * Worker worldgen (086). Versioned off-main-thread generation jobs over the unified worker protocol
 * (`WorkerJobProtocol`, v2): `WorldgenRequestPayload { columnX, columnZ, seed, stage }` (stage from
 * the 085 vocabulary) and `WorldgenResultPayload` echoing the identity with `generationVersion`.
 * `processWorldgenRequest` is the pure worker-side job (stage bodies arrive in 087+).
 * `WorldgenWorkerClient` dispatches valid, identity-matching, token-matching results exactly once
 * and drops stale, duplicate, mismatched, and superseded results. It can run detached (synchronous
 * harness mode) or backed by a shared `WorkerPool` of real workers.
 */
import {
  UNVERSIONED_TOKEN,
  WORKER_PROTOCOL_VERSION,
  WorkerJobClient,
  type ResolvedOutcome,
  type WorkerResult,
} from '../rendering/WorkerJobProtocol';
import type { WorkerPool } from '../engine/WorkerPool';
import { validateGenerationStage } from './GenerationPipeline';

/** Version of the worldgen result envelope. */
export const WORLDGEN_PROTOCOL_VERSION = 1;

/** A column generation request (plain data; structured-clone-safe). */
export interface WorldgenRequestPayload {
  columnX: number;
  columnZ: number;
  /** World seed (opaque to the framework; consumed by 087+ stage bodies). */
  seed: number;
  /** 085 generation stage. */
  stage: string;
}

/** The versioned result envelope echoing the request identity. */
export interface WorldgenResultPayload {
  columnX: number;
  columnZ: number;
  seed: number;
  stage: string;
  generationVersion: number;
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** Validate an unknown value as a worldgen request; throws a descriptive error otherwise. */
export function validateWorldgenRequest(input: unknown): WorldgenRequestPayload {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WorldgenRequest: must be an object');
  }
  const r = input as Record<string, unknown>;
  if (!isInteger(r.columnX) || !isInteger(r.columnZ)) {
    throw new Error(`WorldgenRequest: columnX/columnZ must be integers (${String(r.columnX)}, ${String(r.columnZ)})`);
  }
  if (!isInteger(r.seed)) {
    throw new Error(`WorldgenRequest: seed must be an integer, got ${String(r.seed)}`);
  }
  const stage = validateGenerationStage(r.stage);
  return { columnX: r.columnX, columnZ: r.columnZ, seed: r.seed, stage };
}

/** Validate an unknown value as a worldgen result; throws a descriptive error otherwise. */
export function validateWorldgenResult(input: unknown): WorldgenResultPayload {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WorldgenResult: must be an object');
  }
  const r = input as Record<string, unknown>;
  if (r.generationVersion !== WORLDGEN_PROTOCOL_VERSION) {
    throw new Error(
      `WorldgenResult: unsupported generationVersion ${String(r.generationVersion)} (expected ${WORLDGEN_PROTOCOL_VERSION})`,
    );
  }
  if (!isInteger(r.columnX) || !isInteger(r.columnZ) || !isInteger(r.seed)) {
    throw new Error('WorldgenResult: columnX/columnZ/seed must be integers');
  }
  const stage = validateGenerationStage(r.stage);
  return {
    columnX: r.columnX,
    columnZ: r.columnZ,
    seed: r.seed,
    stage,
    generationVersion: WORLDGEN_PROTOCOL_VERSION,
  };
}

/**
 * The pure worker-side worldgen job: validates the request and returns the versioned
 * identity-echoing envelope. Stage bodies are added by 087+.
 */
export function processWorldgenRequest(payload: WorldgenRequestPayload): WorldgenResultPayload {
  const request = validateWorldgenRequest(payload);
  return {
    columnX: request.columnX,
    columnZ: request.columnZ,
    seed: request.seed,
    stage: request.stage,
    generationVersion: WORLDGEN_PROTOCOL_VERSION,
  };
}

/**
 * Main-thread dispatcher for worldgen jobs over the unified protocol. Detached mode (no pool)
 * keeps the synchronous harness contract; pool mode posts real worker requests and routes results
 * back through the same exactly-once resolution path.
 */
export class WorldgenWorkerClient {
  private readonly jobs = new WorkerJobClient();
  private readonly callbacks = new Map<string, (result: WorldgenResultPayload) => void>();
  private readonly requests = new Map<string, WorldgenRequestPayload>();
  /** Submission-time token per pending job (mirrors `WorkerJobClient` state for cancellation sweeps). */
  private readonly tokens = new Map<string, number>();
  private pool: WorkerPool | null = null;
  private generationToken = 0;

  constructor(opts: { pool?: WorkerPool; generationToken?: number } = {}) {
    if (opts.pool) this.pool = opts.pool;
    if (opts.generationToken !== undefined) this.generationToken = opts.generationToken;
  }

  /** Attach a shared worker pool; subsequent jobs are dispatched to real workers. */
  attachPool(pool: WorkerPool): void {
    this.pool = pool;
  }

  /**
   * Advance the version token. Pending jobs keep their old token, so their late results are
   * rejected as stale; call `cancelByToken` to also free their queue slots eagerly.
   */
  setGenerationToken(token: number): void {
    this.generationToken = token;
  }

  /** Submit a worldgen job; `onResult` fires exactly once on a valid, identity-matching result. */
  submit(payload: WorldgenRequestPayload, onResult: (result: WorldgenResultPayload) => void): string {
    const token = this.generationToken;
    const jobId = this.jobs.submit('worldgen', token);
    this.callbacks.set(jobId, onResult);
    this.requests.set(jobId, payload);
    this.tokens.set(jobId, token);
    if (this.pool) {
      try {
        this.pool.submit({
          kind: 'worldgen',
          generationToken: token,
          payload,
          onResult: (payload) => {
            // Pool payloads are untyped transport: apply the same validation and
            // identity-match discipline as `handleMessage` before completion.
            let result: WorldgenResultPayload;
            try {
              result = validateWorldgenResult(payload);
            } catch {
              this.abandon(jobId); // invalid payload can never satisfy the job
              return;
            }
            if (!this.matches(jobId, result)) {
              this.abandon(jobId); // foreign/stale identity must not resolve the job
              return;
            }
            this.complete(jobId, result);
          },
          onFailure: () => {
            // Abandon the job (worker loss/dispose): no result is delivered; late results become stale.
            this.abandon(jobId);
          },
        });
      } catch (err) {
        // Synchronous pool rejection (bounded queue full): keep bookkeeping truthful.
        this.abandon(jobId);
        throw err;
      }
    }
    return jobId;
  }

  /** Whether a result's identity matches the stored request. */
  private matches(jobId: string, result: WorldgenResultPayload): boolean {
    const request = this.requests.get(jobId);
    if (request === undefined) return false;
    return (
      request.columnX === result.columnX &&
      request.columnZ === result.columnZ &&
      request.seed === result.seed &&
      request.stage === result.stage
    );
  }

  /**
   * Handle a worker message: validate + resolve via the unified protocol, then require identity
   * match; on success invoke the job's callback once and return the result. Stale/invalid/
   * mismatched messages return null and invoke nothing.
   */
  handleMessage(input: unknown): WorldgenResultPayload | null {
    const outcome: ResolvedOutcome | null = this.jobs.resolveResult(input);
    if (outcome === null || !outcome.ok) return null;

    let result: WorldgenResultPayload;
    try {
      result = validateWorldgenResult(outcome.payload);
    } catch {
      return null;
    }
    if (!this.matches(outcome.jobId, result)) return null;
    return this.complete(outcome.jobId, result);
  }

  /** Cancel a pending job (its late result becomes stale). */
  cancel(jobId: string): boolean {
    const removed = this.jobs.cancel(jobId);
    this.abandon(jobId);
    return removed;
  }

  /**
   * Cancel every pending job still carrying `generationToken`; returns how many. Use when the
   * world revision advances (new seed, regenerated region) so superseded columns are dropped
   * wholesale instead of writing over current state.
   */
  cancelByToken(generationToken: number): number {
    let cancelled = 0;
    for (const [jobId, token] of this.tokens) {
      if (token === generationToken && this.jobs.cancel(jobId)) {
        this.callbacks.delete(jobId);
        this.requests.delete(jobId);
        this.tokens.delete(jobId);
        cancelled++;
      }
    }
    return cancelled;
  }

  /** Number of pending (unresolved) jobs. */
  get pendingCount(): number {
    return this.jobs.pendingCount;
  }

  /**
   * Build a unified-protocol result message for `jobId` (helper for worker-side wiring and the
   * synchronous harness path). The wildcard `UNVERSIONED_TOKEN` means "resolve regardless of the
   * submission token"; real async workers must echo their request's token instead.
   */
  static resultMessage(jobId: string, payload: WorldgenResultPayload): WorkerResult {
    return {
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId,
      kind: 'worldgen',
      ok: true,
      generationToken: UNVERSIONED_TOKEN,
      payload,
    };
  }

  /** Shared exactly-once completion: drop all bookkeeping, fire its callback, return the result. */
  private complete(jobId: string, result: WorldgenResultPayload): WorldgenResultPayload | null {
    // Authority is the callbacks map: on the detached/harness path `resolveResult` has already
    // consumed the protocol-level pending record, so gating here on `jobs.cancel` would drop
    // every legitimate result.
    const callback = this.callbacks.get(jobId);
    if (!callback) return null; // stale / cancelled / already resolved
    this.abandon(jobId);
    callback(result);
    return result;
  }

  /** Drop all per-job bookkeeping without invoking the callback (failure/stale/invalid paths). */
  private abandon(jobId: string): void {
    this.jobs.cancel(jobId);
    this.callbacks.delete(jobId);
    this.requests.delete(jobId);
    this.tokens.delete(jobId);
  }
}
