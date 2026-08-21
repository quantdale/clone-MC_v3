import {
  ChunkLifecycleStage,
  canTransition,
} from './ChunkStatus';
import {
  ChunkStreamPriority,
  ChunkTicket,
  isTicketExpired,
  isTicketStale,
  ticketPriority,
} from './ChunkTicket';

// ── Module-level tuning constants ────────────────────────────────────────────
// Kept here rather than in config/index.ts so the pipeline is self-contained;
// the later World.ts integration pass may lift them into CONFIG unchanged.

/** Hard safety cap per work queue. Mirrors World.ts's `CONFIG.maxQueueSize` role per stage. */
export const CHUNK_PIPELINE_QUEUE_CAPS: Readonly<Record<PipelineStage, number>> = {
  generate: 64,
  features: 64,
  light: 64,
  mesh: 96,
  upload: 32,
};

/**
 * Load/unload hysteresis: chunks unload at `loadRadius + UNLOAD_HYSTERESIS_CHUNKS` so a player
 * oscillating around a ring boundary cannot churn allocations (audit 04 "Streaming priorities").
 */
export const UNLOAD_HYSTERESIS_CHUNKS = 1;

/** Bit width of each packed axis; 16 bits signed-offset gives a ±32767 chunk range per axis. */
const PACKED_BITS = 16;
const PACKED_BIAS = 1 << (PACKED_BITS - 1);
const PACKED_MASK = (1 << PACKED_BITS) - 1;

/**
 * Pack a chunk coordinate triple into a single safe-integer key (48 bits).
 * Numeric fast path for hot maps; string keys remain the canonical external API.
 */
export function packChunkCoords(cx: number, cy: number, cz: number): number {
  return (
    ((cx + PACKED_BIAS) & PACKED_MASK) * 2 ** 32 +
    ((cy + PACKED_BIAS) & PACKED_MASK) * 2 ** 16 +
    ((cz + PACKED_BIAS) & PACKED_MASK)
  );
}

/** Unpack a {@link packChunkCoords} key back into chunk coordinates. */
export function unpackPackedKey(packed: number): [number, number, number] {
  const x = (Math.floor(packed / 2 ** 32) & PACKED_MASK) - PACKED_BIAS;
  const y = (Math.floor(packed / 2 ** 16) & PACKED_MASK) - PACKED_BIAS;
  const z = (packed & PACKED_MASK) - PACKED_BIAS;
  return [x, y, z];
}

// ── Lifecycle records ────────────────────────────────────────────────────────

/** Work stages that own a bounded, prioritized queue in the pipeline. */
export type PipelineStage = 'generate' | 'features' | 'light' | 'mesh' | 'upload';

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  'generate',
  'features',
  'light',
  'mesh',
  'upload',
];

/** Stage entered when work on `stage` begins (`null` = no dedicated in-progress status). */
const STAGE_BEGIN_STATUS: Record<PipelineStage, ChunkLifecycleStage | null> = {
  generate: null,
  features: null,
  light: null,
  mesh: ChunkLifecycleStage.MeshQueued,
  upload: ChunkLifecycleStage.UploadQueued,
};

/** Stage reached when work on `stage` completes successfully. */
const STAGE_DONE_STATUS: Record<PipelineStage, ChunkLifecycleStage> = {
  generate: ChunkLifecycleStage.Generated,
  features: ChunkLifecycleStage.Features,
  light: ChunkLifecycleStage.Lighted,
  mesh: ChunkLifecycleStage.MeshReadyCpu,
  upload: ChunkLifecycleStage.ActiveGpu,
};

/** A job waiting in one of the bounded stage queues. */
export interface QueuedJob {
  readonly key: string;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly stage: PipelineStage;
  /** Streaming priority at enqueue time; lower dispatches first. */
  priority: ChunkStreamPriority;
  /** Lifecycle generation captured at enqueue; stale jobs are dropped at dispatch. */
  readonly version: number;
  /** `performance.now()`-style ms timestamp of enqueue, for age tracking. */
  readonly enqueuedAtMs: number;
}

/** Authoritative per-chunk lifecycle record owned by the pipeline. */
export interface ChunkLifecycleRecord {
  readonly key: string;
  readonly packedKey: number;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  status: ChunkLifecycleStage;
  /**
   * Generation/version token. Bumped on every reset, failed stage, or cancellation so that
   * captured tokens (tickets, queued jobs, async results) can be rejected as stale.
   */
  generation: number;
  /** Highest-priority live ticket, if any. */
  activeTicket: ChunkTicket | null;
  /** All live tickets for this chunk. */
  readonly tickets: ChunkTicket[];
  /** Neighbor chunk keys this chunk's pending work depends on. */
  readonly neighbors: Set<string>;
  /** Epoch-style ms of the last status change, for timing metrics. */
  statusChangedAtMs: number;
  /** Duration in ms of the most recently completed stage. */
  lastStageDurationMs: number;
  /** Stages with an in-flight (begun, not completed) job. */
  readonly inFlight: Set<PipelineStage>;
}

/** Result of an attempted state mutation. Failures never throw; callers decide policy. */
export interface StageResult {
  ok: boolean;
  /** Machine-readable reason when `ok` is false. */
  reason?: 'unknown-chunk' | 'stale-token' | 'invalid-transition' | 'already-in-flight';
}

const OK: StageResult = { ok: true };

function fail(reason: NonNullable<StageResult['reason']>): StageResult {
  return { ok: false, reason };
}

// ── The pipeline ─────────────────────────────────────────────────────────────

/**
 * Authoritative chunk lifecycle coordinator.
 *
 * Owns one {@link ChunkLifecycleRecord} per resident chunk: its lifecycle status, active ticket,
 * generation token, neighbor dependencies and timing. All work flows through the five bounded,
 * priority-ordered stage queues; every stage transition is validated against the monotonic state
 * machine in `ChunkStatus.ts` and rejected when the caller's token is stale.
 *
 * Storage is keyed by string chunk key (the existing API contract) with a parallel numeric
 * packed-key index for hot lookups. This class deliberately does not touch Three.js, workers or
 * block data — the later World.ts integration pass wires those in behind these primitives.
 */
export class ChunkPipeline {
  private readonly byKey = new Map<string, ChunkLifecycleRecord>();
  private readonly byPackedKey = new Map<number, ChunkLifecycleRecord>();
  private readonly queues: Record<PipelineStage, QueuedJob[]> = {
    generate: [],
    features: [],
    light: [],
    mesh: [],
    upload: [],
  };
  /** Queued jobs evicted by strictly-more-urgent enqueues since the last `takeDisplacedCount`. */
  private displacedCount = 0;
  private readonly queuedKeys: Record<PipelineStage, Set<string>> = {
    generate: new Set(),
    features: new Set(),
    light: new Set(),
    mesh: new Set(),
    upload: new Set(),
  };
  private clock: () => number;

  constructor(clock: () => number = () => performance.now()) {
    this.clock = clock;
  }

  // ── Registration / lookup ──────────────────────────────────────────────────

  /** Create the lifecycle record for a chunk at `Allocated`. Returns the existing record if present. */
  register(cx: number, cy: number, cz: number): ChunkLifecycleRecord {
    const key = `${cx},${cy},${cz}`;
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const record: ChunkLifecycleRecord = {
      key,
      packedKey: packChunkCoords(cx, cy, cz),
      cx,
      cy,
      cz,
      status: ChunkLifecycleStage.Allocated,
      generation: 0,
      activeTicket: null,
      tickets: [],
      neighbors: new Set(),
      statusChangedAtMs: this.clock(),
      lastStageDurationMs: 0,
      inFlight: new Set(),
    };
    this.byKey.set(key, record);
    this.byPackedKey.set(record.packedKey, record);
    return record;
  }

  /** Lifecycle record for a chunk key, or undefined when not resident. */
  getRecord(key: string): ChunkLifecycleRecord | undefined {
    return this.byKey.get(key);
  }

  /** Numeric-keyed fast path; avoids string construction in hot loops. */
  getRecordByCoords(cx: number, cy: number, cz: number): ChunkLifecycleRecord | undefined {
    return this.byPackedKey.get(packChunkCoords(cx, cy, cz));
  }

  /** Current lifecycle status of a resident chunk, or `Absent`. */
  getStatus(cx: number, cy: number, cz: number): ChunkLifecycleStage {
    return this.getRecordByCoords(cx, cy, cz)?.status ?? ChunkLifecycleStage.Absent;
  }

  /** Number of resident lifecycle records. */
  get size(): number {
    return this.byKey.size;
  }

  /** Iterate all resident records. */
  forEachRecord(fn: (record: ChunkLifecycleRecord) => void): void {
    for (const record of this.byKey.values()) fn(record);
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  /**
   * Attach a ticket to a resident chunk. The ticket is stamped with the chunk's current
   * generation unless it already carries one. Expired or version-stale tickets are refused.
   * Returns the record, or undefined when the chunk is not resident / the ticket was refused.
   */
  acquireTicket(cx: number, cy: number, cz: number, ticket: ChunkTicket): ChunkLifecycleRecord | undefined {
    const record = this.getRecordByCoords(cx, cy, cz);
    if (!record) return undefined;
    const now = this.clock();
    if (ticket.expiresAt !== undefined && ticket.issuedAt === undefined) {
      ticket = { ...ticket, issuedAt: now };
    }
    if (isTicketExpired(ticket, now)) return undefined;
    if (isTicketStale(ticket, record.generation)) return undefined;
    if (ticket.version === undefined) ticket = { ...ticket, version: record.generation };
    record.tickets.push(ticket);
    this.refreshActiveTicket(record);
    return record;
  }

  /**
   * Remove the first ticket equal to `ticket` (same type/level/priority/version). Returns true
   * when a ticket was removed. Does NOT evict automatically — callers drive eviction explicitly
   * through {@link markEvicting}.
   */
  releaseTicket(cx: number, cy: number, cz: number, ticket: ChunkTicket): boolean {
    const record = this.getRecordByCoords(cx, cy, cz);
    if (!record) return false;
    const idx = record.tickets.findIndex(
      (t) =>
        t.type === ticket.type &&
        t.level === ticket.level &&
        ticketPriority(t) === ticketPriority(ticket) &&
        t.version === ticket.version,
    );
    if (idx < 0) return false;
    record.tickets.splice(idx, 1);
    this.refreshActiveTicket(record);
    return true;
  }

  /** Drop expired tickets across all records; returns how many were removed. */
  expireTickets(): number {
    const now = this.clock();
    let removed = 0;
    for (const record of this.byKey.values()) {
      const before = record.tickets.length;
      if (before === 0) continue;
      let write = 0;
      for (let i = 0; i < record.tickets.length; i++) {
        const t = record.tickets[i]!;
        if (!isTicketExpired(t, now)) {
          record.tickets[write++] = t;
        }
      }
      record.tickets.length = write;
      removed += before - write;
      if (write !== before) this.refreshActiveTicket(record);
    }
    return removed;
  }

  /** Live tickets for a chunk (snapshot). Empty when not resident. */
  getTickets(cx: number, cy: number, cz: number): readonly ChunkTicket[] {
    return [...(this.getRecordByCoords(cx, cy, cz)?.tickets ?? [])];
  }

  /** True when the chunk holds at least one live ticket. */
  hasTicket(cx: number, cy: number, cz: number): boolean {
    const record = this.getRecordByCoords(cx, cy, cz);
    return record !== undefined && record.tickets.length > 0;
  }

  private refreshActiveTicket(record: ChunkLifecycleRecord): void {
    let best: ChunkTicket | null = null;
    for (const t of record.tickets) {
      if (best === null || t.level < best.level || (t.level === best.level && ticketPriority(t) < ticketPriority(best))) {
        best = t;
      }
    }
    record.activeTicket = best;
  }

  /** Streaming priority contribution of a chunk's active ticket (worst-case default when unticketed). */
  effectivePriority(cx: number, cy: number, cz: number): ChunkStreamPriority {
    const record = this.getRecordByCoords(cx, cy, cz);
    const ticket = record?.activeTicket;
    return ticket ? ticketPriority(ticket) : ChunkStreamPriority.Preload;
  }

  // ── Neighbor dependencies ──────────────────────────────────────────────────

  /** Declare neighbor keys a chunk's pending work depends on. Replaces the previous set. */
  setNeighbors(key: string, neighbors: Iterable<string>): void {
    const record = this.byKey.get(key);
    if (!record) return;
    record.neighbors.clear();
    for (const n of neighbors) record.neighbors.add(n);
  }

  /** True when every declared neighbor is at least `min`. Unknown chunks count as not ready. */
  neighborsReady(key: string, min: ChunkLifecycleStage): boolean {
    const record = this.byKey.get(key);
    if (!record) return false;
    for (const n of record.neighbors) {
      const neighbor = this.byKey.get(n);
      if (!neighbor || neighbor.status < min) return false;
    }
    return true;
  }

  // ── Stage transitions ──────────────────────────────────────────────────────

  /**
   * Begin work on `stage` for `key`. Validates the transition, records the in-flight marker and
   * (for mesh/upload) advances to the stage's in-progress status. When `expectedVersion` is given
   * it must match the record's current generation, else the call is rejected as `stale-token`.
   */
  beginStage(key: string, stage: PipelineStage, expectedVersion?: number): StageResult {
    const record = this.byKey.get(key);
    if (!record) return fail('unknown-chunk');
    if (expectedVersion !== undefined && expectedVersion !== record.generation) {
      return fail('stale-token');
    }
    if (record.inFlight.has(stage)) return fail('already-in-flight');
    const beginStatus = STAGE_BEGIN_STATUS[stage];
    const target = beginStatus ?? STAGE_DONE_STATUS[stage];
    if (!canTransition(record.status, target)) return fail('invalid-transition');
    if (beginStatus !== null) {
      record.status = beginStatus;
      record.statusChangedAtMs = this.clock();
    }
    record.inFlight.add(stage);
    return OK;
  }

  /**
   * Complete an in-flight stage: advance the status one step, stamp timing, leave the generation
   * untouched (a successful stage does not invalidate sibling in-flight work). Rejects stale
   * tokens and stages that were not begun.
   */
  completeStage(key: string, stage: PipelineStage, expectedVersion?: number): StageResult {
    const record = this.byKey.get(key);
    if (!record) return fail('unknown-chunk');
    if (expectedVersion !== undefined && expectedVersion !== record.generation) {
      return fail('stale-token');
    }
    if (!record.inFlight.has(stage)) return fail('already-in-flight');
    const doneStatus = STAGE_DONE_STATUS[stage];
    const beginStatus = STAGE_BEGIN_STATUS[stage];
    const from = beginStatus ?? record.status;
    if (!canTransition(from, doneStatus)) return fail('invalid-transition');
    const now = this.clock();
    record.lastStageDurationMs = now - record.statusChangedAtMs;
    record.status = doneStatus;
    record.statusChangedAtMs = now;
    record.inFlight.delete(stage);
    return OK;
  }

  /**
   * Fail an in-flight stage: roll back any in-progress status, clear the marker and bump the
   * generation so every captured token for this chunk becomes stale (results must be discarded).
   */
  failStage(key: string, stage: PipelineStage): StageResult {
    const record = this.byKey.get(key);
    if (!record) return fail('unknown-chunk');
    if (!record.inFlight.has(stage)) return fail('already-in-flight');
    record.inFlight.delete(stage);
    const beginStatus = STAGE_BEGIN_STATUS[stage];
    if (beginStatus !== null && record.status === beginStatus) {
      // Roll back to the pre-stage status: the predecessor in the order.
      record.status = PREVIOUS_STAGE[beginStatus];
      record.statusChangedAtMs = this.clock();
    }
    record.generation++;
    return OK;
  }

  // ── Bounded priority queues ────────────────────────────────────────────────

  /**
   * Enqueue work for `stage`. Deduplicates by chunk key per stage. When the queue is at its cap:
   * the new job displaces the lowest-priority oldest queued job if it is strictly more urgent,
   * otherwise it is rejected (`false`) — the caller retries, mirroring World.ts's retry queue.
   *
   * A displaced job's chunk would otherwise strand (its only queued copy was just deleted), so
   * every displacement is recorded; callers poll {@link takeDisplacedCount} to force a re-scan.
   */
  enqueue(stage: PipelineStage, cx: number, cy: number, cz: number, priority: ChunkStreamPriority): boolean {
    const key = `${cx},${cy},${cz}`;
    const record = this.byKey.get(key);
    if (!record) return false;
    if (this.queuedKeys[stage].has(key)) return true; // already queued: keep earliest entry
    const queue = this.queues[stage];
    const cap = CHUNK_PIPELINE_QUEUE_CAPS[stage];
    const job: QueuedJob = {
      key,
      cx,
      cy,
      cz,
      stage,
      priority,
      version: record.generation,
      enqueuedAtMs: this.clock(),
    };
    if (queue.length >= cap) {
      const worstIndex = this.worstJobIndex(queue);
      const worst = queue[worstIndex]!;
      if (priority >= worst.priority) return false;
      this.queuedKeys[stage].delete(worst.key);
      queue[worstIndex] = job;
      this.queuedKeys[stage].add(key);
      this.displacedCount++;
      return true;
    }
    queue.push(job);
    this.queuedKeys[stage].add(key);
    return true;
  }

  /**
   * Number of queued jobs displaced by higher-urgency enqueues since the last call, resetting the
   * counter. A displaced entry lost its only queued copy, so callers must re-scan the area to
   * re-queue it (World sets `needsEnsure` when this is non-zero).
   */
  takeDisplacedCount(): number {
    const n = this.displacedCount;
    this.displacedCount = 0;
    return n;
  }

  /** Number of pending jobs in a stage queue. */
  queueDepth(stage: PipelineStage): number {
    return this.queues[stage].length;
  }

  /**
   * Dequeue the most urgent job for `stage` (lowest priority value, then oldest). Drops stale
   * entries (generation moved on, chunk gone, or already in flight) along the way. Returns
   * undefined when nothing dispatchable remains.
   */
  dequeue(stage: PipelineStage): QueuedJob | undefined {
    const queue = this.queues[stage];
    let bestIndex = -1;
    for (let i = 0; i < queue.length; i++) {
      const job = queue[i]!;
      const record = this.byKey.get(job.key);
      const stale =
        record === undefined ||
        record.generation !== job.version ||
        record.inFlight.has(stage);
      if (stale) {
        this.queuedKeys[stage].delete(job.key);
        queue.splice(i, 1);
        i--;
        continue;
      }
      const best = bestIndex >= 0 ? queue[bestIndex]! : undefined;
      if (
        best === undefined ||
        job.priority < best.priority ||
        (job.priority === best.priority && job.enqueuedAtMs < best.enqueuedAtMs)
      ) {
        bestIndex = i;
      }
    }
    if (bestIndex < 0) return undefined;
    const job = queue.splice(bestIndex, 1)[0]!;
    this.queuedKeys[stage].delete(job.key);
    return job;
  }

  /**
   * Cancel every queued job whose priority is strictly worse than `maxPriorityValue`
   * (e.g. `cancelJobsBelowPriority(ChunkStreamPriority.Interaction)` cancels corridor/ring/preload
   * work). Returns the number of cancelled jobs. In-flight work is unaffected — use
   * {@link cancelForKey} to invalidate that.
   */
  cancelJobsBelowPriority(maxPriorityValue: ChunkStreamPriority): number {
    let cancelled = 0;
    for (const stage of PIPELINE_STAGES) {
      const queue = this.queues[stage];
      let write = 0;
      for (let i = 0; i < queue.length; i++) {
        const job = queue[i]!;
        if (job.priority > maxPriorityValue) {
          this.queuedKeys[stage].delete(job.key);
          cancelled++;
        } else {
          queue[write++] = job;
        }
      }
      queue.length = write;
    }
    return cancelled;
  }

  /**
   * Cancel all queued and in-flight work for a key and detach its tickets. Bumps the chunk's
   * generation so any async result captured under an older token is rejected by
   * `beginStage`/`completeStage`. Returns false when the chunk is not resident.
   */
  cancelForKey(key: string): boolean {
    const record = this.byKey.get(key);
    if (!record) return false;
    for (const stage of PIPELINE_STAGES) {
      this.queuedKeys[stage].delete(key);
      const queue = this.queues[stage];
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i]!.key === key) queue.splice(i, 1);
      }
    }
    record.inFlight.clear();
    record.tickets.length = 0;
    record.activeTicket = null;
    record.generation++;
    return true;
  }

  // ── Eviction / memory lifecycle ────────────────────────────────────────────

  /**
   * Start eviction: cancel outstanding work, then move the record to `Evicting` (legal from any
   * resident stage). GPU/CPU resource release happens between this and {@link finalizeEviction}.
   */
  markEvicting(key: string): StageResult {
    const record = this.byKey.get(key);
    if (!record) return fail('unknown-chunk');
    this.cancelForKey(key);
    if (!canTransition(record.status, ChunkLifecycleStage.Evicting)) {
      return fail('invalid-transition');
    }
    record.status = ChunkLifecycleStage.Evicting;
    record.statusChangedAtMs = this.clock();
    return OK;
  }

  /**
   * Finish eviction: remove the lifecycle record entirely (back to `Absent`). Only valid from
   * `Evicting`; the caller must already have released CPU/GPU resources.
   */
  finalizeEviction(key: string): StageResult {
    const record = this.byKey.get(key);
    if (!record) return fail('unknown-chunk');
    if (record.status !== ChunkLifecycleStage.Evicting) return fail('invalid-transition');
    this.byKey.delete(key);
    this.byPackedKey.delete(record.packedKey);
    return OK;
  }

  /** Reset a chunk to a fresh `Allocated` record after eviction/regeneration, with a new generation. */
  resetForRegeneration(key: string): ChunkLifecycleRecord | undefined {
    const old = this.byKey.get(key);
    if (!old) return undefined;
    const generation = old.generation + 1;
    const { cx, cy, cz } = old;
    this.byKey.delete(key);
    this.byPackedKey.delete(old.packedKey);
    const record = this.register(cx, cy, cz);
    record.generation = generation;
    return record;
  }

  // ── Hysteresis ─────────────────────────────────────────────────────────────

  /** Chebyshev ring distance of `(dx, dz)` from the stream center. */
  private static ringDistance(dx: number, dz: number): number {
    return Math.max(Math.abs(dx), Math.abs(dz));
  }

  /** True when the chunk offset is inside the load radius (inclusive). */
  shouldLoad(dx: number, dz: number, loadRadius: number): boolean {
    return ChunkPipeline.ringDistance(dx, dz) <= loadRadius;
  }

  /**
   * True when the chunk offset is outside the unload radius, which is the load radius widened by
   * {@link UNLOAD_HYSTERESIS_CHUNKS}. Chunks between the two radii are held: neither loaded nor
   * unloaded, which prevents boundary churn.
   */
  shouldUnload(dx: number, dz: number, loadRadius: number): boolean {
    return ChunkPipeline.ringDistance(dx, dz) > loadRadius + UNLOAD_HYSTERESIS_CHUNKS;
  }

  // ── Observability ──────────────────────────────────────────────────────────

  /** Age in ms of the oldest queued job in `stage`, or 0 when empty. */
  oldestQueueAgeMs(stage: PipelineStage): number {
    const queue = this.queues[stage];
    if (queue.length === 0) return 0;
    const now = this.clock();
    let oldest = Infinity;
    for (const job of queue) {
      if (job.enqueuedAtMs < oldest) oldest = job.enqueuedAtMs;
    }
    return Math.max(0, now - oldest);
  }

  /** Age in ms of the oldest queued job across all stages, or 0 when idle. */
  oldestJobAgeMs(): number {
    const now = this.clock();
    let oldest = Infinity;
    for (const stage of PIPELINE_STAGES) {
      for (const job of this.queues[stage]) {
        if (job.enqueuedAtMs < oldest) oldest = job.enqueuedAtMs;
      }
    }
    return oldest === Infinity ? 0 : Math.max(0, now - oldest);
  }

  /** Snapshot of pipeline depths and counts for telemetry. */
  stats(): {
    residents: number;
    evicting: number;
    depths: Record<PipelineStage, number>;
    oldestJobAgeMs: number;
  } {
    let evicting = 0;
    for (const record of this.byKey.values()) {
      if (record.status === ChunkLifecycleStage.Evicting) evicting++;
    }
    return {
      residents: this.byKey.size,
      evicting,
      depths: {
        generate: this.queueDepth('generate'),
        features: this.queueDepth('features'),
        light: this.queueDepth('light'),
        mesh: this.queueDepth('mesh'),
        upload: this.queueDepth('upload'),
      },
      oldestJobAgeMs: this.oldestJobAgeMs(),
    };
  }

  /** Drop everything (records and queues). Used by dispose paths. */
  clear(): void {
    this.byKey.clear();
    this.byPackedKey.clear();
    for (const stage of PIPELINE_STAGES) {
      this.queues[stage].length = 0;
      this.queuedKeys[stage].clear();
    }
  }

  /** Index of the least-urgent, oldest job in `queue` (assumed non-empty). */
  private worstJobIndex(queue: QueuedJob[]): number {
    let worst = 0;
    for (let i = 1; i < queue.length; i++) {
      const w = queue[worst]!;
      const c = queue[i]!;
      if (c.priority > w.priority || (c.priority === w.priority && c.enqueuedAtMs < w.enqueuedAtMs)) {
        worst = i;
      }
    }
    return worst;
  }
}

/** Predecessor of each stage in the ascending order (Absent maps to itself). */
const PREVIOUS_STAGE: Record<ChunkLifecycleStage, ChunkLifecycleStage> = {
  [ChunkLifecycleStage.Absent]: ChunkLifecycleStage.Absent,
  [ChunkLifecycleStage.Allocated]: ChunkLifecycleStage.Absent,
  [ChunkLifecycleStage.Generated]: ChunkLifecycleStage.Allocated,
  [ChunkLifecycleStage.Features]: ChunkLifecycleStage.Generated,
  [ChunkLifecycleStage.Lighted]: ChunkLifecycleStage.Features,
  [ChunkLifecycleStage.MeshQueued]: ChunkLifecycleStage.Lighted,
  [ChunkLifecycleStage.MeshReadyCpu]: ChunkLifecycleStage.MeshQueued,
  [ChunkLifecycleStage.UploadQueued]: ChunkLifecycleStage.MeshReadyCpu,
  [ChunkLifecycleStage.ActiveGpu]: ChunkLifecycleStage.UploadQueued,
  [ChunkLifecycleStage.Evicting]: ChunkLifecycleStage.ActiveGpu,
};
