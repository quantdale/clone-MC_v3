/**
 * Worker worldgen (086). Versioned off-main-thread generation jobs over the 064 worker protocol:
 * `WorldgenRequestPayload { columnX, columnZ, seed, stage }` (stage from the 085 vocabulary) and
 * `WorldgenResultPayload` echoing the identity with `generationVersion`. `processWorldgenRequest`
 * is the pure worker-side job (stage bodies arrive in 087+). `WorldgenWorkerClient` dispatches
 * valid, identity-matching results exactly once and drops stale, duplicate, and mismatched
 * results (mirroring 065).
 */
import { WORKER_PROTOCOL_VERSION, WorkerJobClient, type ResolvedOutcome } from '../rendering/WorkerJobProtocol';
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

/** Main-thread dispatcher for worldgen jobs over the 064 protocol. */
export class WorldgenWorkerClient {
  private readonly jobs = new WorkerJobClient();
  private readonly callbacks = new Map<string, (result: WorldgenResultPayload) => void>();
  private readonly requests = new Map<string, WorldgenRequestPayload>();

  /** Submit a worldgen job; `onResult` fires exactly once on a valid, identity-matching result. */
  submit(payload: WorldgenRequestPayload, onResult: (result: WorldgenResultPayload) => void): string {
    const jobId = this.jobs.submit('worldgen', payload);
    this.callbacks.set(jobId, onResult);
    this.requests.set(jobId, payload);
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
   * Handle a worker message: validate + resolve via 064, then require identity match; on success
   * invoke the job's callback once and return the result. Stale/invalid/mismatched messages
   * return null and invoke nothing.
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

    const callback = this.callbacks.get(outcome.jobId);
    this.callbacks.delete(outcome.jobId);
    this.requests.delete(outcome.jobId);
    if (callback) callback(result);
    return result;
  }

  /** Cancel a pending job (its late result becomes stale). */
  cancel(jobId: string): boolean {
    const removed = this.jobs.cancel(jobId);
    this.callbacks.delete(jobId);
    this.requests.delete(jobId);
    return removed;
  }

  /** Number of pending (unresolved) jobs. */
  get pendingCount(): number {
    return this.jobs.pendingCount;
  }

  /** Build a 064 result message for `jobId` (helper for worker-side wiring). */
  static resultMessage(jobId: string, payload: WorldgenResultPayload): unknown {
    return { protocolVersion: WORKER_PROTOCOL_VERSION, jobId, ok: true, payload };
  }
}
