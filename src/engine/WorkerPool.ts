/**
 * Generic Web Worker pool over the unified worker job protocol (see
 * `src/rendering/WorkerJobProtocol.ts`). Workers are created by a caller-supplied `spawn` callback
 * so the Vite bundler pattern stays at the call site:
 *
 * ```ts
 * new WorkerPool({
 *   spawn: () => new Worker(new URL('../rendering/MeshWorkerEntry.ts', import.meta.url), { type: 'module' }),
 * });
 * ```
 *
 * Features: bounded in-flight + pending queues, priority dispatch (higher `priority` first, FIFO
 * within equal priority), cancellation by jobId and by stale generation token, stale-result
 * rejection before any caller callback, graceful dispose, per-worker error recovery (respawn on
 * error/close with in-flight jobs requeued), and utilization/job counters for observability.
 * Pending capacity is hard-capped (no unbounded arrays) and request envelope objects are reused
 * from a small free list.
 */
import {
  WORKER_PROTOCOL_VERSION,
  validateWorkerResult,
  type WorkerJobKind,
  type WorkerRequest,
} from '../rendering/WorkerJobProtocol';

// Module-level sizing constants (audit 04 Phase B): keep cores for the UI thread and the browser.
const MIN_POOL_SIZE = 1;
const MAX_POOL_SIZE = 4;
const FALLBACK_POOL_SIZE = 2;

/** Default cap on queued-but-undispatched jobs across the whole pool. */
export const DEFAULT_MAX_PENDING = 64;
/** Default cap on simultaneously in-flight jobs per worker (worldgen/meshing are chunky). */
export const DEFAULT_MAX_IN_FLIGHT_PER_WORKER = 2;
/** Envelope free-list bound; beyond this, completed request objects are simply dropped. */
const REQUEST_FREELIST_CAP = 64;

/** Conservative pool size: clamp(hardwareConcurrency - 2, 1, 4), fallback 2 when unavailable. */
export function computeWorkerPoolSize(hardwareConcurrency?: number): number {
  const cores = hardwareConcurrency ?? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined);
  if (typeof cores !== 'number' || !Number.isFinite(cores) || cores < 1) return FALLBACK_POOL_SIZE;
  return Math.min(MAX_POOL_SIZE, Math.max(MIN_POOL_SIZE, cores - 2));
}

/** Immutable pool observability snapshot. */
export interface WorkerPoolStats {
  workerCount: number;
  /** Jobs dispatched to workers and not yet resolved. */
  inFlight: number;
  /** Jobs queued but not yet dispatched. */
  pending: number;
  submitted: number;
  completed: number;
  failed: number;
  /** Results rejected as stale/cancelled before reaching a caller callback. */
  stale: number;
  cancelled: number;
  /** Worker respawns after error/close. */
  respawns: number;
}

interface PendingEntry {
  jobId: string;
  kind: WorkerJobKind;
  generationToken: number;
  payload: unknown;
  transfer?: ArrayBuffer[];
  priority: number;
  seq: number;
  onResult: (payload: unknown, jobId: string) => void;
  onFailure: (error: string, jobId: string) => void;
}

export interface SubmitOptions {
  kind: WorkerJobKind;
  /** Version/generation token stamped on the request; results must echo it. */
  generationToken: number;
  payload: unknown;
  /** ArrayBuffers to move out of the main thread (ownership transfers; do not reuse after submit). */
  transfer?: ArrayBuffer[];
  /** Higher dispatches first; ties break FIFO. Default 0. */
  priority?: number;
  onResult: (payload: unknown, jobId: string) => void;
  onFailure?: (error: string, jobId: string) => void;
}

interface WorkerSlot {
  worker: Worker;
  inFlight: Set<string>;
}

/**
 * Bounded priority queue (max-heap on `priority`, FIFO on `seq` for ties). Capacity is fixed at
 * construction; `push` returns false when full instead of growing.
 */
class BoundedPriorityQueue {
  private readonly heap: PendingEntry[] = [];

  constructor(private readonly capacity: number) {}

  get size(): number {
    return this.heap.length;
  }

  get isFull(): boolean {
    return this.heap.length >= this.capacity;
  }

  push(entry: PendingEntry): boolean {
    if (this.isFull) return false;
    this.heap.push(entry);
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.before(this.heap[i]!, this.heap[parent]!)) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent]!, this.heap[i]!];
        i = parent;
      } else {
        break;
      }
    }
    return true;
  }

  pop(): PendingEntry | undefined {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let best = i;
        if (left < this.heap.length && this.before(this.heap[left]!, this.heap[best]!)) best = left;
        if (right < this.heap.length && this.before(this.heap[right]!, this.heap[best]!)) best = right;
        if (best === i) break;
        [this.heap[i], this.heap[best]] = [this.heap[best]!, this.heap[i]!];
        i = best;
      }
    }
    return top;
  }

  /** Drain every entry (heap order irrelevant for cancellation sweeps). */
  drainAll(): PendingEntry[] {
    const all = this.heap.slice();
    this.heap.length = 0;
    return all;
  }

  private before(a: PendingEntry, b: PendingEntry): boolean {
    return a.priority > b.priority || (a.priority === b.priority && a.seq < b.seq);
  }
}

export class WorkerPool {
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: BoundedPriorityQueue;
  /** jobId -> entry, populated from dispatch until the result arrives. */
  private readonly inFlight = new Map<string, { entry: PendingEntry; slotIndex: number }>();
  private readonly freelist: PendingEntry[] = [];
  private nextSeq = 0;
  private disposed = false;
  private statsInternal: Omit<WorkerPoolStats, 'workerCount' | 'inFlight' | 'pending'> = {
    submitted: 0,
    completed: 0,
    failed: 0,
    stale: 0,
    cancelled: 0,
    respawns: 0,
  };

  constructor(
    private readonly opts: {
      /** Creates one worker; called per slot and per respawn. Must use the Vite module-worker pattern. */
      spawn: () => Worker;
      size?: number;
      maxPending?: number;
      maxInFlightPerWorker?: number;
    },
  ) {
    const size = opts.size ?? computeWorkerPoolSize();
    const maxInFlight = opts.maxInFlightPerWorker ?? DEFAULT_MAX_IN_FLIGHT_PER_WORKER;
    if (!Number.isInteger(size) || size < MIN_POOL_SIZE) {
      throw new Error(`WorkerPool: size must be an integer >= ${MIN_POOL_SIZE}`);
    }
    if (!Number.isInteger(maxInFlight) || maxInFlight < 1) {
      throw new Error('WorkerPool: maxInFlightPerWorker must be an integer >= 1');
    }
    this.queue = new BoundedPriorityQueue(opts.maxPending ?? DEFAULT_MAX_PENDING);
    for (let i = 0; i < size; i++) this.slots.push(this.spawnSlot());
  }

  /**
   * Queue a job. Throws a descriptive `RangeError` when the pending queue is full (backpressure:
   * callers should skip/re-prioritize, never await an unbounded queue). The result is delivered to
   * `onResult` exactly once unless the job is cancelled, superseded, or lost — then `onFailure`
   * fires once instead.
   */
  submit(options: SubmitOptions): string {
    if (this.disposed) throw new Error('WorkerPool.submit: pool is disposed');
    if (this.queue.isFull) {
      throw new RangeError(`WorkerPool.submit: pending queue is full (${this.queue.size})`);
    }
    const jobId = `wp-${++this.nextSeq}`;
    const entry: PendingEntry =
      this.freelist.pop() ??
      ({
        jobId: '',
        kind: options.kind,
        generationToken: 0,
        payload: null,
        priority: 0,
        seq: 0,
        onResult: options.onResult,
        onFailure: options.onFailure ?? (() => undefined),
      } satisfies PendingEntry);
    entry.jobId = jobId;
    entry.kind = options.kind;
    entry.generationToken = options.generationToken;
    entry.payload = options.payload;
    entry.transfer = options.transfer;
    entry.priority = options.priority ?? 0;
    entry.seq = this.nextSeq;
    entry.onResult = options.onResult;
    entry.onFailure = options.onFailure ?? (() => undefined);

    this.statsInternal.submitted++;
    this.queue.push(entry);
    this.dispatch();
    return jobId;
  }

  /** Cancel a pending or in-flight job; its late result is rejected as stale. True if it existed. */
  cancel(jobId: string): boolean {
    if (this.disposed) return false;
    if (this.inFlight.delete(jobId)) {
      this.statsInternal.cancelled++;
      return true;
    }
    // Rebuild the heap minus the cancelled entry. Every non-matching entry MUST
    // be re-pushed before returning — an early return would silently drop all
    // queued jobs behind the cancelled one, stranding their callers.
    let found = false;
    for (const entry of this.queue.drainAll()) {
      if (entry.jobId !== jobId) {
        this.queue.push(entry);
      } else {
        this.recycle(entry);
        this.statsInternal.cancelled++;
        found = true;
      }
    }
    return found;
  }

  /**
   * Cancel every job (pending or in-flight) still carrying `generationToken`. Returns how many
   * were cancelled. Use this when the world/mesh revision advances so superseded results can never
   * reach caller callbacks.
   */
  cancelByToken(generationToken: number): number {
    if (this.disposed) return 0;
    let cancelled = 0;
    for (const entry of this.queue.drainAll()) {
      if (entry.generationToken === generationToken) {
        this.recycle(entry);
        cancelled++;
      } else {
        this.queue.push(entry);
      }
    }
    for (const [jobId, record] of this.inFlight) {
      if (record.entry.generationToken === generationToken) {
        this.inFlight.delete(jobId);
        this.recycle(record.entry);
        cancelled++;
      }
    }
    this.statsInternal.cancelled += cancelled;
    return cancelled;
  }

  /** Terminate all workers and fail every outstanding job. The pool is unusable afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.queue.drainAll()) {
      entry.onFailure('disposed', entry.jobId);
      this.recycle(entry);
    }
    for (const [jobId, record] of this.inFlight) {
      record.entry.onFailure('disposed', jobId);
      this.inFlight.delete(jobId);
    }
    for (const slot of this.slots) {
      slot.worker.onmessage = null;
      slot.worker.onerror = null;
      slot.worker.onmessageerror = null;
      slot.worker.terminate();
    }
    this.slots.length = 0;
  }

  stats(): WorkerPoolStats {
    return {
      ...this.statsInternal,
      workerCount: this.slots.length,
      inFlight: this.inFlight.size,
      pending: this.queue.size,
    };
  }

  get pendingCount(): number {
    return this.queue.size;
  }

  get inFlightCount(): number {
    return this.inFlight.size;
  }

  // --- internals -------------------------------------------------------------

  private spawnSlot(): WorkerSlot {
    const worker = this.opts.spawn();
    const slot: WorkerSlot = { worker, inFlight: new Set() };
    const slotIndex = this.slots.length;
    worker.onmessage = (event: MessageEvent) => this.handleMessage(event.data, slotIndex);
    worker.onerror = () => this.recoverSlot(slotIndex, 'worker error');
    worker.onmessageerror = () => this.recoverSlot(slotIndex, 'worker message serialization failure');
    worker.addEventListener?.('close', () => this.recoverSlot(slotIndex, 'worker closed'));
    return slot;
  }

  /** Dispatch queued jobs to any worker with spare in-flight capacity, highest priority first. */
  private dispatch(): void {
    if (this.disposed) return;
    for (;;) {
      const entry = this.queue.pop();
      if (!entry) return;
      const slotIndex = this.pickSlot();
      if (slotIndex === -1) {
        this.queue.push(entry); // all workers saturated; retry on the next completion
        return;
      }
      const slot = this.slots[slotIndex]!;
      slot.inFlight.add(entry.jobId);
      this.inFlight.set(entry.jobId, { entry, slotIndex });

      // Reuse envelope objects where practical; buffers always travel fresh via the transfer list.
      const request: WorkerRequest = {
        protocolVersion: WORKER_PROTOCOL_VERSION,
        jobId: entry.jobId,
        kind: entry.kind,
        generationToken: entry.generationToken,
        payload: entry.payload,
      };
      slot.worker.postMessage(request, entry.transfer ?? []);
    }
  }

  private pickSlot(): number {
    let best = -1;
    let bestLoad = Number.POSITIVE_INFINITY;
    const cap = this.opts.maxInFlightPerWorker ?? DEFAULT_MAX_IN_FLIGHT_PER_WORKER;
    for (let i = 0; i < this.slots.length; i++) {
      const load = this.slots[i]!.inFlight.size;
      if (load < bestLoad && load < cap) {
        best = i;
        bestLoad = load;
      }
    }
    return best;
  }

  /**
   * Single resolution path: validate the envelope, drop anything stale (unknown id, cancelled,
   * token mismatch) BEFORE invoking any caller callback, then deliver exactly once.
   */
  private handleMessage(input: unknown, slotIndex: number): void {
    let result: ReturnType<typeof validateWorkerResult>;
    try {
      result = validateWorkerResult(input);
    } catch {
      this.statsInternal.stale++; // malformed message: nothing to correlate
      return;
    }

    const record = this.inFlight.get(result.jobId);
    if (record === undefined) {
      this.statsInternal.stale++; // unknown / cancelled / already resolved
      return;
    }
    const { entry } = record;
    // Stale-result rejection happens here, before any caller callback can observe the payload.
    if (result.generationToken !== UNVERSIONED_TOKEN_SENTINEL && result.generationToken !== entry.generationToken) {
      this.inFlight.delete(result.jobId);
      this.slots[slotIndex]?.inFlight.delete(result.jobId);
      this.recycle(entry);
      this.statsInternal.stale++;
      return;
    }
    const jobId = result.jobId;
    const ok = result.ok;
    const payload = result.payload;
    const error = result.error;

    this.inFlight.delete(jobId);
    this.slots[slotIndex]?.inFlight.delete(jobId);
    this.recycle(entry);
    if (ok) {
      this.statsInternal.completed++;
      try {
        entry.onResult(payload, jobId);
      } catch {
        // Caller callbacks must not break the pool loop.
      }
    } else {
      this.statsInternal.failed++;
      entry.onFailure(error ?? 'unknown worker failure', jobId);
    }
    this.dispatch(); // freed capacity: drain the queue immediately
  }

  /** Respawn a broken worker slot; requeue its in-flight jobs (or fail them if the queue is full). */
  private recoverSlot(slotIndex: number, reason: string): void {
    if (this.disposed) return;
    const slot = this.slots[slotIndex];
    if (!slot) return;
    this.slots[slotIndex] = this.spawnSlot();
    this.statsInternal.respawns++;

    for (const jobId of slot.inFlight) {
      const record = this.inFlight.get(jobId);
      if (record === undefined) continue;
      this.inFlight.delete(jobId);
      if (this.queue.push(record.entry)) {
        // requeued; keep its callbacks intact
      } else {
        this.statsInternal.failed++;
        record.entry.onFailure(`${reason}; pending queue full, job dropped`, jobId);
        this.recycle(record.entry);
      }
    }
    this.dispatch();
  }

  /** Return a finished entry object to the free list (bounded reuse; no unbounded retention). */
  private recycle(entry: PendingEntry): void {
    if (this.freelist.length < REQUEST_FREELIST_CAP) {
      entry.payload = null;
      entry.transfer = undefined;
      this.freelist.push(entry);
    }
  }
}

/**
 * Re-exported sentinel: results stamped with this token bypass strict token matching (used only by
 * the synchronous harness path). Kept here so pool callers need not import the protocol separately.
 */
export const UNVERSIONED_TOKEN_SENTINEL = -1;
