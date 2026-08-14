/**
 * Versioned worker job protocol (064). Requests and results travel between the main thread and
 * workers as validated envelopes carrying `WORKER_PROTOCOL_VERSION` and a `jobId` for correlation. A
 * `WorkerJobClient` tracks pending jobs, resolves each exactly once, and deterministically rejects
 * stale results (unknown, cancelled, or already-resolved job ids) so out-of-order or duplicate worker
 * messages can never corrupt main-thread state.
 */

/** Current protocol version; bump with migration rules when the envelope changes. */
export const WORKER_PROTOCOL_VERSION = 1;

/** A job request sent to a worker. */
export interface WorkerRequest {
  protocolVersion: 1;
  /** Unique job id (correlates with the result). */
  jobId: string;
  /** Job kind, e.g. `'mesh-section'`. */
  kind: string;
  /** Opaque job payload (transferables are a transport concern). */
  payload: unknown;
}

/** A job result posted back from a worker. */
export interface WorkerResult {
  protocolVersion: 1;
  jobId: string;
  ok: boolean;
  /** Present when `ok` is true. */
  payload?: unknown;
  /** Present when `ok` is false. */
  error?: string;
}

/** The outcome of a successfully resolved job. */
export interface ResolvedOutcome {
  jobId: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Validate an unknown value as a `WorkerRequest`; throws on any invalid field. */
export function validateWorkerRequest(input: unknown): WorkerRequest {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WorkerRequest: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.protocolVersion !== WORKER_PROTOCOL_VERSION) {
    throw new Error(`WorkerRequest: unsupported protocol version ${String(r.protocolVersion)}`);
  }
  if (!isNonEmptyString(r.jobId)) {
    throw new Error('WorkerRequest: jobId must be a non-empty string');
  }
  if (!isNonEmptyString(r.kind)) {
    throw new Error('WorkerRequest: kind must be a non-empty string');
  }
  return { protocolVersion: WORKER_PROTOCOL_VERSION as 1, jobId: r.jobId as string, kind: r.kind as string, payload: r.payload };
}

/** Validate an unknown value as a `WorkerResult`; throws on any invalid field. */
export function validateWorkerResult(input: unknown): WorkerResult {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WorkerResult: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.protocolVersion !== WORKER_PROTOCOL_VERSION) {
    throw new Error(`WorkerResult: unsupported protocol version ${String(r.protocolVersion)}`);
  }
  if (!isNonEmptyString(r.jobId)) {
    throw new Error('WorkerResult: jobId must be a non-empty string');
  }
  if (typeof r.ok !== 'boolean') {
    throw new Error('WorkerResult: ok must be a boolean');
  }
  if (r.ok && r.payload === undefined) {
    throw new Error('WorkerResult: ok results must carry a payload');
  }
  if (!r.ok && !isNonEmptyString(r.error)) {
    throw new Error('WorkerResult: failed results must carry a non-empty error');
  }
  const out: WorkerResult = { protocolVersion: WORKER_PROTOCOL_VERSION as 1, jobId: r.jobId as string, ok: r.ok as boolean };
  if (r.ok) out.payload = r.payload;
  else out.error = r.error as string;
  return out;
}

/** Correlates worker results to pending jobs and rejects stale ones deterministically. */
export class WorkerJobClient {
  private readonly version: number;
  private readonly pending = new Map<string, true>();
  private counter = 0;

  constructor(opts: { version?: number } = {}) {
    this.version = opts.version ?? WORKER_PROTOCOL_VERSION;
  }

  /** Register a pending job and return its unique id. */
  submit(kind: string, _payload: unknown): string {
    if (!isNonEmptyString(kind)) {
      throw new Error('WorkerJobClient.submit: kind must be a non-empty string');
    }
    this.counter++;
    const jobId = `job-${this.counter}`;
    this.pending.set(jobId, true);
    return jobId;
  }

  /**
   * Validate and resolve a worker result. Returns the outcome exactly once per pending job; returns
   * `null` for stale results (unknown/cancelled/already-resolved ids) and invalid messages (never
   * throws, never mutates on invalid input).
   */
  resolveResult(input: unknown): ResolvedOutcome | null {
    let result: WorkerResult;
    try {
      result = validateWorkerResult(input);
    } catch {
      return null;
    }
    if (result.protocolVersion !== this.version) return null;
    if (!this.pending.delete(result.jobId)) return null; // stale

    const outcome: ResolvedOutcome = { jobId: result.jobId, ok: result.ok };
    if (result.ok) outcome.payload = result.payload;
    else outcome.error = result.error;
    return outcome;
  }

  /** Remove a pending job (returns whether it was pending); its late result becomes stale. */
  cancel(jobId: string): boolean {
    return this.pending.delete(jobId);
  }

  /** Number of pending (unresolved) jobs. */
  get pendingCount(): number {
    return this.pending.size;
  }
}
