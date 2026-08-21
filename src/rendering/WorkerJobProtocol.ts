/**
 * Unified, versioned worker job protocol (shared by worldgen + meshing jobs). Requests and results
 * travel between the main thread and workers as validated envelopes carrying
 * `WORKER_PROTOCOL_VERSION`, a `jobId` for correlation, and a `generationToken` that stamps the
 * world/mesh revision a job was submitted against. A `WorkerJobClient` tracks pending jobs, resolves
 * each exactly once, and deterministically rejects stale results (unknown, cancelled,
 * already-resolved job ids, or results whose token no longer matches the submission token) so
 * out-of-order, duplicate, or superseded worker messages can never corrupt main-thread state.
 *
 * Transfer/ownership semantics (no SharedArrayBuffer):
 * - Large job data travels as typed arrays over `ArrayBuffer`s listed in the message's `transfer`
 *   array. Ownership moves with the transfer: after `postMessage(msg, msg.transfer)` the sender's
 *   buffers are detached (length 0) and MUST NOT be read or written again.
 * - The receiving side owns the buffers on arrival. A worker owns request buffers for the duration
 *   of the job; the main thread owns result buffers once the result message arrives and may wrap
 *   them in typed-array views for direct BufferGeometry consumption.
 * - Buffers are not pooled/recycled yet; add recycling only after profiling proves allocation
 *   pressure (audit 04, Phase A).
 */

/** Current protocol version; bump with migration rules when the envelope changes. */
export const WORKER_PROTOCOL_VERSION = 2;

/** The job kinds the unified protocol carries. */
export type WorkerJobKind = 'worldgen' | 'mesh-section';

const JOB_KINDS: ReadonlySet<string> = new Set<WorkerJobKind>(['worldgen', 'mesh-section']);

/**
 * Sentinel token stamped on results built without version knowledge (e.g. the synchronous harness
 * path, where submit and resolve happen in the same tick and no other generation can intervene).
 * `WorkerJobClient` accepts it as a wildcard; real worker results must echo their request's token.
 */
export const UNVERSIONED_TOKEN = -1;

/** A job request sent to a worker. */
export interface WorkerRequest {
  protocolVersion: 2;
  /** Unique job id (correlates with the result). */
  jobId: string;
  kind: WorkerJobKind;
  /** Version/generation token the job was submitted under (echoed by the result). */
  generationToken: number;
  /** Opaque job payload; large data rides in transferable ArrayBuffers. */
  payload: unknown;
}

/** A job result posted back from a worker. */
export interface WorkerResult {
  protocolVersion: 2;
  jobId: string;
  kind: WorkerJobKind;
  ok: boolean;
  /** Echo of the request's `generationToken`; the main thread rejects mismatches as stale. */
  generationToken: number;
  /** ArrayBuffers moved by the transfer list (positions/normals/uv/light/index data, etc.). */
  transfer?: ArrayBuffer[];
  /** Present when `ok` is true. */
  payload?: unknown;
  /** Present when `ok` is false. */
  error?: string;
}

/** Advisory cancel message (main -> worker). Workers may ignore it; staleness is enforced on return. */
export interface WorkerCancelMessage {
  protocolVersion: 2;
  type: 'cancel';
  /** Cancel these job ids... */
  jobIds: string[];
  /** ...or every job still carrying this token (`undefined` = id-based cancel only). */
  generationToken?: number;
}

/** The outcome of a successfully resolved job. */
export interface ResolvedOutcome {
  jobId: string;
  kind: WorkerJobKind;
  ok: boolean;
  /** Echoed generation token of the resolved result. */
  generationToken: number;
  payload?: unknown;
  error?: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateEnvelopeCommon(r: Record<string, unknown>, name: string): void {
  if (r.protocolVersion !== WORKER_PROTOCOL_VERSION) {
    throw new Error(`${name}: unsupported protocol version ${String(r.protocolVersion)}`);
  }
  if (!isNonEmptyString(r.jobId)) {
    throw new Error(`${name}: jobId must be a non-empty string`);
  }
  if (typeof r.kind !== 'string' || !JOB_KINDS.has(r.kind)) {
    throw new Error(`${name}: kind must be one of ${[...JOB_KINDS].join(', ')}`);
  }
  if (!isFiniteNumber(r.generationToken)) {
    throw new Error(`${name}: generationToken must be a finite number`);
  }
}

/** Validate an unknown value as a `WorkerRequest`; throws on any invalid field. */
export function validateWorkerRequest(input: unknown): WorkerRequest {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WorkerRequest: expected an object');
  }
  const r = input as Record<string, unknown>;
  validateEnvelopeCommon(r, 'WorkerRequest');
  return {
    protocolVersion: WORKER_PROTOCOL_VERSION,
    jobId: r.jobId as string,
    kind: r.kind as WorkerJobKind,
    generationToken: r.generationToken as number,
    payload: r.payload,
  };
}

/** Validate an unknown value as a `WorkerResult`; throws on any invalid field. */
export function validateWorkerResult(input: unknown): WorkerResult {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WorkerResult: expected an object');
  }
  const r = input as Record<string, unknown>;
  validateEnvelopeCommon(r, 'WorkerResult');
  if (typeof r.ok !== 'boolean') {
    throw new Error('WorkerResult: ok must be a boolean');
  }
  if (r.ok && r.payload === undefined) {
    throw new Error('WorkerResult: ok results must carry a payload');
  }
  if (!r.ok && !isNonEmptyString(r.error)) {
    throw new Error('WorkerResult: failed results must carry a non-empty error');
  }
  let transfer: ArrayBuffer[] | undefined;
  if (r.transfer !== undefined) {
    if (!Array.isArray(r.transfer) || r.transfer.some((b) => !(b instanceof ArrayBuffer))) {
      throw new Error('WorkerResult: transfer must be an array of ArrayBuffers');
    }
    transfer = r.transfer as ArrayBuffer[];
  }
  const out: WorkerResult = {
    protocolVersion: WORKER_PROTOCOL_VERSION,
    jobId: r.jobId as string,
    kind: r.kind as WorkerJobKind,
    ok: r.ok as boolean,
    generationToken: r.generationToken as number,
  };
  if (transfer) out.transfer = transfer;
  if (r.ok) out.payload = r.payload;
  else out.error = r.error as string;
  return out;
}

/** Whether an unknown message is an advisory cancel message. */
export function isWorkerCancelMessage(input: unknown): input is WorkerCancelMessage {
  if (typeof input !== 'object' || input === null) return false;
  const r = input as Record<string, unknown>;
  return (
    r.protocolVersion === WORKER_PROTOCOL_VERSION &&
    r.type === 'cancel' &&
    Array.isArray(r.jobIds) &&
    r.jobIds.every(isNonEmptyString)
  );
}

/**
 * Collect the unique ArrayBuffers referenced by `values` into a transfer list. Typed-array views
 * over a buffer are transferable via the buffer itself; pass the returned list as postMessage's
 * transfer argument. Buffers appear at most once (duplicate entries throw in some browsers).
 */
export function collectTransferables(values: readonly unknown[]): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const value of values) {
    if (value instanceof ArrayBuffer) {
      buffers.add(value);
    } else if (ArrayBuffer.isView(value)) {
      buffers.add(value.buffer as ArrayBuffer);
    }
  }
  return [...buffers];
}

/** Minimal structural view of a dedicated worker scope (avoids WebWorker lib dependency). */
export interface WorkerMessageScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

/**
 * Worker-side request server: validates incoming envelopes, dispatches to the per-kind handler,
 * and posts back a validated result echoing `jobId` + `generationToken`, transferring any
 * ArrayBuffers the handler declares. Cancel messages are advisory and only clear nothing here —
 * the main thread rejects stale results on arrival. Install once per worker entry:
 * `serveWorkerRequests({ 'mesh-section': handleMeshSection })`.
 */
export function serveWorkerRequests(
  handlers: Partial<Record<WorkerJobKind, (payload: unknown) => { payload: unknown; transfer?: ArrayBuffer[] }>>,
  scope: WorkerMessageScope = self as unknown as WorkerMessageScope,
): void {
  scope.onmessage = (event: { data: unknown }) => {
    let request: WorkerRequest;
    try {
      if (isWorkerCancelMessage(event.data)) return; // advisory only
      request = validateWorkerRequest(event.data);
    } catch {
      return; // malformed envelope: drop silently, never crash the worker loop
    }
    const handler = handlers[request.kind];
    if (!handler) {
      const failure: WorkerResult = {
        protocolVersion: WORKER_PROTOCOL_VERSION,
        jobId: request.jobId,
        kind: request.kind,
        ok: false,
        generationToken: request.generationToken,
        error: `no handler registered for kind '${request.kind}'`,
      };
      scope.postMessage(failure);
      return;
    }
    try {
      const output = handler(request.payload);
      const result: WorkerResult = {
        protocolVersion: WORKER_PROTOCOL_VERSION,
        jobId: request.jobId,
        kind: request.kind,
        ok: true,
        generationToken: request.generationToken,
        payload: output.payload,
      };
      if (output.transfer) result.transfer = output.transfer;
      scope.postMessage(result, result.transfer ?? []);
    } catch (error) {
      const failure: WorkerResult = {
        protocolVersion: WORKER_PROTOCOL_VERSION,
        jobId: request.jobId,
        kind: request.kind,
        ok: false,
        generationToken: request.generationToken,
        error: error instanceof Error ? error.message : String(error),
      };
      scope.postMessage(failure);
    }
  };
}

/** Correlates worker results to pending jobs and rejects stale ones deterministically. */
export class WorkerJobClient {
  private readonly pending = new Map<string, { kind: WorkerJobKind; generationToken: number }>();
  private counter = 0;

  /** Register a pending job and return its unique id. */
  submit(kind: WorkerJobKind, generationToken: number): string {
    if (!JOB_KINDS.has(kind)) {
      throw new Error(`WorkerJobClient.submit: unknown kind '${String(kind)}'`);
    }
    if (!isFiniteNumber(generationToken)) {
      throw new Error('WorkerJobClient.submit: generationToken must be a finite number');
    }
    this.counter++;
    const jobId = `job-${this.counter}`;
    this.pending.set(jobId, { kind, generationToken });
    return jobId;
  }

  /**
   * Validate and resolve a worker result. Returns the outcome exactly once per pending job;
   * returns `null` for stale results (unknown/cancelled/already-resolved ids, or a token mismatch
   * unless the result carries the `UNVERSIONED_TOKEN` wildcard) and invalid messages (never
   * throws, never mutates on invalid input).
   */
  resolveResult(input: unknown): ResolvedOutcome | null {
    let result: WorkerResult;
    try {
      result = validateWorkerResult(input);
    } catch {
      return null;
    }
    const record = this.pending.get(result.jobId);
    if (record === undefined) return null; // stale: unknown / cancelled / already resolved
    if (record.kind !== result.kind) return null; // stale: kind mismatch
    if (result.generationToken !== UNVERSIONED_TOKEN && result.generationToken !== record.generationToken) {
      return null; // stale: superseded generation
    }
    this.pending.delete(result.jobId);

    const outcome: ResolvedOutcome = {
      jobId: result.jobId,
      kind: result.kind,
      ok: result.ok,
      generationToken: result.generationToken,
    };
    if (result.ok) outcome.payload = result.payload;
    else outcome.error = result.error;
    return outcome;
  }

  /** Remove a pending job (returns whether it was pending); its late result becomes stale. */
  cancel(jobId: string): boolean {
    return this.pending.delete(jobId);
  }

  /**
   * Cancel every pending job stamped with `generationToken`. Returns how many were cancelled.
   * Late results for those jobs are rejected as stale by `resolveResult`.
   */
  cancelByToken(generationToken: number): number {
    let cancelled = 0;
    for (const [jobId, record] of this.pending) {
      if (record.generationToken === generationToken) {
        this.pending.delete(jobId);
        cancelled++;
      }
    }
    return cancelled;
  }

  /** Number of pending (unresolved) jobs. */
  get pendingCount(): number {
    return this.pending.size;
  }
}
