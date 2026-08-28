/**
 * Deterministic scheduled block/fluid tick queue (047). Per-position work is scheduled at an absolute
 * future game tick; `tick(nowTick)` pops exactly the entries due at `<= nowTick` in deterministic
 * `(tickTime, insertion order)` order. Positions are de-duplicated (re-scheduling updates the due tick
 * in place), and the queue serializes to a versioned, validated shape so pending ticks survive
 * save/reload. The queue is pure simulation state — no I/O, no timers.
 */
export interface ScheduledTick {
  x: number;
  y: number;
  z: number;
  /** Absolute game tick at which the entry becomes due. */
  tickTime: number;
}

/** Serialized shape version; bump with migration rules when the format changes. */
export const SCHEDULED_TICK_QUEUE_VERSION = 1;

/** Versioned serialized form of the queue, for the save layer. */
export interface SerializedScheduledTickQueue {
  version: 1;
  entries: ScheduledTick[];
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/**
 * Validate an unknown value as a `SerializedScheduledTickQueue`. Returns the same value (narrowed) on
 * success; throws a descriptive `Error` on any invalid field. Does not coerce types.
 */
export function validateSerializedScheduledTickQueue(input: unknown): SerializedScheduledTickQueue {
  if (typeof input !== 'object' || input === null) {
    throw new Error('SerializedScheduledTickQueue: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== SCHEDULED_TICK_QUEUE_VERSION) {
    throw new Error(`SerializedScheduledTickQueue: unsupported version ${String(r.version)}`);
  }
  if (!Array.isArray(r.entries)) {
    throw new Error('SerializedScheduledTickQueue: entries must be an array');
  }
  const entries: ScheduledTick[] = [];
  for (const raw of r.entries as unknown[]) {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('SerializedScheduledTickQueue: entry must be an object');
    }
    const e = raw as Record<string, unknown>;
    if (!isInteger(e.x) || !isInteger(e.y) || !isInteger(e.z) || !isInteger(e.tickTime)) {
      throw new Error('SerializedScheduledTickQueue: entry fields must be integers');
    }
    entries.push({ x: e.x as number, y: e.y as number, z: e.z as number, tickTime: e.tickTime as number });
  }
  return { version: SCHEDULED_TICK_QUEUE_VERSION as 1, entries };
}

/** A pending entry with its insertion sequence for deterministic tie-breaking. */
interface PendingEntry {
  tick: ScheduledTick;
  seq: number;
}

function positionKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function assertValidPosition(x: number, y: number, z: number, tickTime: number): void {
  if (!isInteger(x) || !isInteger(y) || !isInteger(z) || !isInteger(tickTime)) {
    throw new RangeError(`ScheduledTickQueue: coordinates and tickTime must be integers (${x},${y},${z} @ ${tickTime})`);
  }
}

/** Deterministic, persistence-ready scheduled tick queue. */
export class ScheduledTickQueue {
  private readonly pending = new Map<string, PendingEntry>();
  private nextSeq = 0;
  private minDueTick = Number.POSITIVE_INFINITY;

  /** Schedule (or re-schedule) a tick at the absolute `dueTick` for `(x, y, z)`. */
  schedule(x: number, y: number, z: number, dueTick: number): void {
    assertValidPosition(x, y, z, dueTick);
    if (dueTick < this.minDueTick) {
      this.minDueTick = dueTick;
    }
    const key = positionKey(x, y, z);
    const existing = this.pending.get(key);
    if (existing) {
      existing.tick = { x, y, z, tickTime: dueTick };
      return;
    }
    this.pending.set(key, { tick: { x, y, z, tickTime: dueTick }, seq: this.nextSeq++ });
  }

  /** Schedule a tick `delayTicks` after `currentTick`. */
  scheduleIn(x: number, y: number, z: number, delayTicks: number, currentTick: number): void {
    if (!isInteger(delayTicks) || !isInteger(currentTick)) {
      throw new RangeError(`ScheduledTickQueue: delayTicks/currentTick must be integers (${delayTicks}, ${currentTick})`);
    }
    this.schedule(x, y, z, currentTick + delayTicks);
  }

  /**
   * Pop and return every entry due at `<= nowTick`, ordered by `(tickTime, seq)`. Returns an empty
   * array when nothing is due.
   */
  tick(nowTick: number): ScheduledTick[] {
    if (this.pending.size === 0 || this.minDueTick > nowTick) {
      return [];
    }
    const due: PendingEntry[] = [];
    let nextMin = Number.POSITIVE_INFINITY;
    for (const entry of this.pending.values()) {
      if (entry.tick.tickTime <= nowTick) {
        due.push(entry);
      } else if (entry.tick.tickTime < nextMin) {
        nextMin = entry.tick.tickTime;
      }
    }
    due.sort((a, b) => a.tick.tickTime - b.tick.tickTime || a.seq - b.seq);
    for (const entry of due) {
      this.pending.delete(positionKey(entry.tick.x, entry.tick.y, entry.tick.z));
    }
    this.minDueTick = this.pending.size === 0 ? Number.POSITIVE_INFINITY : nextMin;
    return due.map((e) => e.tick);
  }

  /** Whether `(x, y, z)` has a pending tick. */
  has(x: number, y: number, z: number): boolean {
    return this.pending.has(positionKey(x, y, z));
  }

  /** Remove a pending tick (idempotent). */
  cancel(x: number, y: number, z: number): void {
    const key = positionKey(x, y, z);
    if (this.pending.delete(key)) {
      if (this.pending.size === 0) {
        this.minDueTick = Number.POSITIVE_INFINITY;
      }
    }
  }

  /** Remove all pending ticks. */
  clear(): void {
    this.pending.clear();
    this.nextSeq = 0;
    this.minDueTick = Number.POSITIVE_INFINITY;
  }

  /** Number of pending ticks. */
  get size(): number {
    return this.pending.size;
  }

  /** Serialize the pending ticks for persistence. */
  serialize(): SerializedScheduledTickQueue {
    const entries = [...this.pending.values()]
      .sort((a, b) => a.seq - b.seq)
      .map((e) => ({ ...e.tick }));
    return { version: SCHEDULED_TICK_QUEUE_VERSION as 1, entries };
  }

  /**
   * Restore from a serialized payload. The whole payload is validated first; on rejection the queue
   * is left unchanged. Sequence numbers are reassigned in payload order (deterministic).
   */
  deserialize(data: unknown): void {
    const valid = validateSerializedScheduledTickQueue(data);
    this.clear();
    for (const tick of valid.entries) {
      const key = positionKey(tick.x, tick.y, tick.z);
      this.pending.set(key, { tick, seq: this.nextSeq++ });
      if (tick.tickTime < this.minDueTick) {
        this.minDueTick = tick.tickTime;
      }
    }
  }
}
