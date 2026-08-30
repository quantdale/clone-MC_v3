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
import {
  DEFAULT_MAX_PENDING,
  WorkerPool,
  computeWorkerPoolSize,
} from '../engine/WorkerPool';
import { ChunkColumn, type SerializedChunkColumn } from '../world/ChunkColumn';
import { validateSerializedChunkColumn } from '../storage/ChunkSectionRepository';
import { CanonicalWorldStorage, type GeneratedColumnCommitResult } from '../world/CanonicalWorldStorage';
import { createDefaultBlockRegistry } from '../world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../world/BlockStateRegistry';
import { validateGenerationStage } from './GenerationPipeline';
import { ChunkStatus, chunkStatusOrdinal } from '../world/ChunkStatus';
import { TERRAIN_GENERATION_VERSION, TerrainGenerator } from '../world/TerrainGenerator';

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
  /** Production column layout; omitted by the legacy identity-only harness. */
  sectionCount?: number;
  /** Production column layout; omitted by the legacy identity-only harness. */
  minSectionY?: number;
  /** Stable worldgen implementation version used by production column jobs. */
  worldgenVersion?: string;
  /** Runtime canonical status captured when a production baseline job was admitted. */
  columnStatus?: ChunkStatus;
  /** Runtime canonical mutation revision captured when a production baseline job was admitted. */
  columnRevision?: number;
}

/** The versioned result envelope echoing the request identity. */
export interface WorldgenResultPayload {
  columnX: number;
  columnZ: number;
  seed: number;
  stage: string;
  generationVersion: number;
  /** Serialized canonical column returned by production worker generation. */
  serializedColumn?: SerializedChunkColumn;
  /** Stable worldgen implementation version returned by production jobs. */
  worldgenVersion?: string;
  /** Runtime canonical status captured when this production result was generated. */
  columnStatus?: ChunkStatus;
  /** Runtime canonical mutation revision captured when this production result was generated. */
  columnRevision?: number;
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function validateOptionalCommitMetadata(
  input: Record<string, unknown>,
  name: 'WorldgenRequest' | 'WorldgenResult',
): { columnStatus?: ChunkStatus; columnRevision?: number } {
  const hasStatus = input.columnStatus !== undefined;
  const hasRevision = input.columnRevision !== undefined;
  if (!hasStatus && !hasRevision) return {};
  if (!hasStatus || !hasRevision) {
    throw new Error(`${name}: columnStatus and columnRevision must be supplied together`);
  }
  if (!isInteger(input.columnStatus) || chunkStatusOrdinal(input.columnStatus as ChunkStatus) < 0) {
    throw new Error(`${name}: columnStatus must be a valid ChunkStatus`);
  }
  if (!isInteger(input.columnRevision) || (input.columnRevision as number) < 0) {
    throw new Error(`${name}: columnRevision must be a non-negative integer`);
  }
  return {
    columnStatus: input.columnStatus as ChunkStatus,
    columnRevision: input.columnRevision as number,
  };
}

function validateOptionalLayout(input: Record<string, unknown>): { sectionCount?: number; minSectionY?: number } {
  if (input.sectionCount === undefined && input.minSectionY === undefined) return {};
  if (!isInteger(input.sectionCount) || (input.sectionCount as number) < 1) {
    throw new Error('WorldgenRequest: sectionCount must be a positive integer');
  }
  if (!isInteger(input.minSectionY)) {
    throw new Error('WorldgenRequest: minSectionY must be an integer');
  }
  return { sectionCount: input.sectionCount, minSectionY: input.minSectionY };
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
  const layout = validateOptionalLayout(r);
  const commitMetadata = validateOptionalCommitMetadata(r, 'WorldgenRequest');
  if (r.worldgenVersion !== undefined && typeof r.worldgenVersion !== 'string') {
    throw new Error('WorldgenRequest: worldgenVersion must be a string');
  }
  return {
    columnX: r.columnX,
    columnZ: r.columnZ,
    seed: r.seed,
    stage,
    ...layout,
    ...commitMetadata,
    ...(r.worldgenVersion === undefined ? {} : { worldgenVersion: r.worldgenVersion as string }),
  };
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
  let serializedColumn: SerializedChunkColumn | undefined;
  if (r.serializedColumn !== undefined) {
    serializedColumn = validateSerializedChunkColumn(r.serializedColumn);
    if (serializedColumn.chunkX !== r.columnX || serializedColumn.chunkZ !== r.columnZ) {
      throw new Error('WorldgenResult: serialized column identity does not match result');
    }
  }
  const commitMetadata = validateOptionalCommitMetadata(r, 'WorldgenResult');
  if (r.worldgenVersion !== undefined && typeof r.worldgenVersion !== 'string') {
    throw new Error('WorldgenResult: worldgenVersion must be a string');
  }
  if (serializedColumn !== undefined) {
    if (commitMetadata.columnStatus !== ChunkStatus.Empty || commitMetadata.columnRevision !== 0) {
      throw new Error('WorldgenResult: serialized columns require an empty column at revision 0');
    }
    if (r.worldgenVersion !== TERRAIN_GENERATION_VERSION) {
      throw new Error(
        `WorldgenResult: serialized columns require worldgenVersion ${TERRAIN_GENERATION_VERSION}`,
      );
    }
  }
  return {
    columnX: r.columnX,
    columnZ: r.columnZ,
    seed: r.seed,
    stage,
    generationVersion: WORLDGEN_PROTOCOL_VERSION,
    ...(serializedColumn === undefined ? {} : { serializedColumn }),
    ...(r.worldgenVersion === undefined ? {} : { worldgenVersion: r.worldgenVersion as string }),
    ...commitMetadata,
  };
}

export interface WorldgenCommitOptions {
  /** Optional world seed expected by the live world owning the canonical storage. */
  expectedSeed?: number;
}

export type WorldgenCommitResult =
  | GeneratedColumnCommitResult
  | { committed: false; reason: 'invalid-result' | 'seed-mismatch' };

/**
 * Validate and atomically commit a worker-generated canonical column. This is the only adapter
 * that turns untrusted worker data into a canonical write; all identity, layout, status, and
 * mutation-revision checks still happen inside `CanonicalWorldStorage` at replacement time.
 */
export function commitWorldgenResult(
  storage: CanonicalWorldStorage,
  input: unknown,
  options: WorldgenCommitOptions = {},
): WorldgenCommitResult {
  let result: WorldgenResultPayload;
  try {
    result = validateWorldgenResult(input);
  } catch {
    return { committed: false, reason: 'invalid-result' };
  }
  if (options.expectedSeed !== undefined && result.seed !== options.expectedSeed) {
    return { committed: false, reason: 'seed-mismatch' };
  }
  if (
    result.serializedColumn === undefined ||
    result.columnStatus === undefined ||
    result.columnRevision === undefined
  ) {
    return { committed: false, reason: 'invalid-result' };
  }
  return storage.commitGeneratedColumn(result.serializedColumn, {
    chunkX: result.columnX,
    chunkZ: result.columnZ,
    generationRevision: result.columnRevision,
    status: result.columnStatus,
  });
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
    ...(request.worldgenVersion === undefined ? {} : { worldgenVersion: request.worldgenVersion }),
  };
}

/**
 * Production worker job for a complete canonical column. The worker owns only a temporary
 * column and returns plain serialized data; it never receives or mutates live storage.
 */
export function processWorldgenColumnRequest(payload: WorldgenRequestPayload): WorldgenResultPayload {
  const request = validateWorldgenRequest(payload);
  if (request.worldgenVersion !== TERRAIN_GENERATION_VERSION) {
    throw new Error(`WorldgenColumnRequest: worldgenVersion must be ${TERRAIN_GENERATION_VERSION}`);
  }
  if (
    request.sectionCount === undefined ||
    request.minSectionY === undefined ||
    request.columnStatus !== ChunkStatus.Empty ||
    request.columnRevision !== 0
  ) {
    throw new Error('WorldgenColumnRequest: current layout and empty revision-0 column are required');
  }
  const registry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  const column = new ChunkColumn({
    chunkX: request.columnX,
    chunkZ: request.columnZ,
    sectionCount: request.sectionCount,
    minSectionY: request.minSectionY,
    registry: stateRegistry,
    blockRegistry: registry,
  });
  new TerrainGenerator(registry, request.seed).generateColumn(column, stateRegistry);
  return {
    columnX: request.columnX,
    columnZ: request.columnZ,
    seed: request.seed,
    stage: request.stage,
    generationVersion: WORLDGEN_PROTOCOL_VERSION,
    worldgenVersion: TERRAIN_GENERATION_VERSION,
    columnStatus: request.columnStatus,
    columnRevision: request.columnRevision,
    serializedColumn: column.serialize(),
  };
}

/** Options for the dedicated production worldgen pool. */
export interface WorldgenWorkerRuntimeOptions {
  /** Worker slots; defaults to the shared hardware-concurrency sizing policy. */
  size?: number;
  /** Hard cap for queued worldgen jobs; defaults to the generic pool cap. */
  maxPending?: number;
  /** Per-worker in-flight cap; defaults to the generic worker cap. */
  maxInFlightPerWorker?: number;
  /** Test/integration seam; production uses the Vite module worker entry below. */
  workerFactory?: () => Worker;
}

/** A dedicated worldgen client and pool with one lifecycle owner. */
export interface WorldgenWorkerRuntime {
  readonly pool: WorkerPool;
  readonly client: WorldgenWorkerClient;
  dispose(): void;
}

/**
 * Construct the production worldgen runtime. It deliberately owns a separate pool from section
 * meshing so a saturated render workload cannot starve interactive column generation. The pool
 * remains bounded and the client preserves identity/token validation and cancellation semantics.
 */
export function createWorldgenWorkerRuntime(
  options: WorldgenWorkerRuntimeOptions = {},
): WorldgenWorkerRuntime {
  const pool = new WorkerPool({
    size: options.size ?? computeWorkerPoolSize(),
    maxPending: options.maxPending ?? DEFAULT_MAX_PENDING,
    maxInFlightPerWorker: options.maxInFlightPerWorker,
    spawn: options.workerFactory ?? (() =>
      new Worker(new URL('./WorldgenWorkerEntry.ts', import.meta.url), { type: 'module' })),
  });
  const client = new WorldgenWorkerClient({ pool });
  return {
    pool,
    client,
    dispose: () => {
      client.dispose();
      pool.dispose();
    },
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
  /** Pool job ids are distinct from protocol ids and must be cancelled explicitly. */
  private readonly poolJobIds = new Map<string, string>();
  private pool: WorkerPool | null = null;
  private generationToken = 0;
  private disposed = false;

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
  submit(
    payload: WorldgenRequestPayload,
    onResult: (result: WorldgenResultPayload) => void,
    options: { priority?: number; onFailure?: (error: string) => void } = {},
  ): string {
    if (this.disposed) throw new Error('WorldgenWorkerClient.submit: client is disposed');
    const request = validateWorldgenRequest(payload);
    const token = this.generationToken;
    const jobId = this.jobs.submit('worldgen', token);
    this.callbacks.set(jobId, onResult);
    this.requests.set(jobId, request);
    this.tokens.set(jobId, token);
    if (this.pool) {
      try {
        const poolJobId = this.pool.submit({
          kind: 'worldgen',
          generationToken: token,
          payload: request,
          priority: options.priority,
          onResult: (payload) => {
            this.poolJobIds.delete(jobId);
            let result: WorldgenResultPayload;
            try {
              result = validateWorldgenResult(payload);
            } catch {
              this.abandon(jobId);
              options.onFailure?.('invalid worldgen result');
              return;
            }
            if (!this.matches(jobId, result)) {
              this.abandon(jobId);
              options.onFailure?.('foreign or stale worldgen result');
              return;
            }
            this.complete(jobId, result);
          },
          onFailure: (error) => {
            this.poolJobIds.delete(jobId);
            this.abandon(jobId);
            options.onFailure?.(error);
          },
        });
        this.poolJobIds.set(jobId, poolJobId);
      } catch (err) {
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
      request.stage === result.stage &&
      request.worldgenVersion === result.worldgenVersion &&
      request.columnStatus === result.columnStatus &&
      request.columnRevision === result.columnRevision &&
      (request.sectionCount === undefined ||
        result.serializedColumn?.sectionCount === request.sectionCount) &&
      (request.minSectionY === undefined ||
        result.serializedColumn?.minSectionY === request.minSectionY)
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
      this.abandon(outcome.jobId);
      return null;
    }
    if (!this.matches(outcome.jobId, result)) {
      this.abandon(outcome.jobId);
      return null;
    }
    return this.complete(outcome.jobId, result);
  }

  /** Cancel a pending job (its late result becomes stale). */
  cancel(jobId: string): boolean {
    const poolJobId = this.poolJobIds.get(jobId);
    const poolCancel = this.pool && (this.pool as WorkerPool & { cancel?: (id: string) => boolean }).cancel;
    if (poolJobId !== undefined) poolCancel?.call(this.pool, poolJobId);
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
    for (const [jobId, token] of [...this.tokens]) {
      if (token === generationToken) {
        if (this.cancel(jobId)) cancelled++;
      }
    }
    return cancelled;
  }

  /**
   * Dispose the client and cancel every owned pool job before the pool is terminated. Idempotent so
   * callers may safely dispose the runtime from both world unload and application shutdown paths.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const jobId of [...this.tokens.keys()]) this.cancel(jobId);
    this.poolJobIds.clear();
    this.callbacks.clear();
    this.requests.clear();
    this.tokens.clear();
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
    this.poolJobIds.delete(jobId);
    this.jobs.cancel(jobId);
    this.callbacks.delete(jobId);
    this.requests.delete(jobId);
    this.tokens.delete(jobId);
  }
}
