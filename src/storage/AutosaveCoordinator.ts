/**
 * Crash-resistant periodic autosave + pagehide flush policy (039). It drives a 038 `DirtySaveQueue`
 * through a `SaveSink` (typically `RepositorySaveSink`) on a periodic interval with bounded work, and
 * flushes best-effort on `pagehide` / `visibilitychange`(hidden). The interval timer and the flush
 * event target are injectable so the coordinator is fully unit-testable in Node (fake timers + fake
 * event target) with no browser dependency.
 *
 * Semantics:
 * - `start()` is idempotent: one interval, registered once.
 * - Each interval fire calls `tick()`: drains at most `limitPerTick` units; empty queues cost a `size`
 *   check only.
 * - `pagehide`/hidden fires `flush()`: drains to empty bounded by a zero-progress guard AND a hard
 *   round cap (`FLUSH_MAX_ROUNDS`), so continuous concurrent marking cannot extend a close-time
 *   flush indefinitely; excess units stay queued for the next tick.
 * - `stop()` clears the interval and listeners; `markDirty` after `stop()` re-arms (wake-on-dirty).
 */
import { DirtySaveQueue, type SaveSink, type SaveUnit } from './DirtySaveQueue';

/** Minimal timer surface; satisfied by `globalThis` or a test double. */
export interface TimerLike {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

/** Minimal event-target surface for `pagehide`/`visibilitychange`; satisfied by `window` or a test double. */
export interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Constructor options; all timings/dependencies are injectable. */
export interface AutosaveCoordinatorOptions {
  queue: DirtySaveQueue;
  sink: SaveSink;
  /** Max units written per scheduled tick. */
  limitPerTick?: number;
  /** Milliseconds between periodic ticks. */
  intervalMs?: number;
  /** Injectable timer (defaults to `globalThis`). */
  timer?: TimerLike;
  /** Event target for flush listeners; `null` disables listener registration. */
  flushTarget?: EventTargetLike | null;
  /**
   * Called after every productive drain with the unit keys durably committed by
   * that drain (hardening 2026-08-23). Lets owners release in-memory pending
   * copies as soon as the durable write lands, instead of only on facade flush.
   */
  onUnitsCommitted?: (keys: readonly string[]) => void;
}

/** Consecutive zero-progress drains that end a `flush` (persistent failure guard). */
const FLUSH_ZERO_PROGRESS_LIMIT = 3;

/**
 * Hard cap on drain rounds within one `flush`. Progress-positive rounds reset the zero-progress
 * guard, so continuous concurrent `markDirty` traffic could otherwise keep a flush draining
 * indefinitely; the cap bounds worst-case flush work regardless of incoming rate (SAVE-FAIL-4
 * boundedness; pagehide/dispose flushes are best-effort and must always return).
 */
const FLUSH_MAX_ROUNDS = 128;

function defaultTimer(): TimerLike {
  return globalThis as TimerLike;
}

function defaultFlushTarget(): EventTargetLike | null {
  const g = globalThis as { window?: EventTargetLike };
  return typeof g.window !== 'undefined' && g.window !== null ? g.window : null;
}

/** Periodic autosave + pagehide flush policy over a 038 dirty-save queue. */
export class AutosaveCoordinator {
  private readonly queue: DirtySaveQueue;
  private readonly sink: SaveSink;
  private readonly limitPerTick: number;
  private readonly intervalMs: number;
  private readonly timer: TimerLike;
  private readonly flushTarget: EventTargetLike | null;
  private readonly onUnitsCommitted?: (keys: readonly string[]) => void;
  private intervalId: unknown | null = null;
  private started = false;
  private readonly onFlush = (): void => {
    void this.flush().catch(() => undefined);
  };

  constructor(opts: AutosaveCoordinatorOptions) {
    this.queue = opts.queue;
    this.sink = opts.sink;
    this.limitPerTick = opts.limitPerTick ?? 64;
    this.intervalMs = opts.intervalMs ?? 5000;
    this.timer = opts.timer ?? defaultTimer();
    this.flushTarget = opts.flushTarget === undefined ? defaultFlushTarget() : opts.flushTarget;
    this.onUnitsCommitted = opts.onUnitsCommitted;
  }

  /** Enqueue a dirty unit (and re-arm the interval if it was stopped). */
  markDirty(unit: SaveUnit): void {
    this.queue.markDirty(unit);
    if (!this.started) {
      this.start();
    }
  }

  /** Begin periodic saves and register flush listeners. Idempotent. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.intervalId = this.timer.setInterval(() => {
      void this.tick().catch(() => undefined);
    }, this.intervalMs);
    if (this.flushTarget) {
      this.flushTarget.addEventListener('pagehide', this.onFlush);
      this.flushTarget.addEventListener('visibilitychange', this.onFlush);
    }
  }

  /** Stop periodic saves and remove flush listeners. Safe to call when not started. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.intervalId !== null) {
      this.timer.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.flushTarget) {
      this.flushTarget.removeEventListener('pagehide', this.onFlush);
      this.flushTarget.removeEventListener('visibilitychange', this.onFlush);
    }
  }

  /** Drain one bounded batch. Returns the number of units written. */
  async tick(): Promise<number> {
    if (this.queue.size === 0) return 0;
    const result = await this.queue.drainReport(this.sink, this.limitPerTick);
    if (result.written > 0 && this.onUnitsCommitted && result.committedKeys.length > 0) {
      try {
        this.onUnitsCommitted(result.committedKeys);
      } catch {
        // Bookkeeping callbacks must never break the save loop.
      }
    }
    return result.written;
  }

  /**
   * Best-effort drain-to-empty with a zero-progress guard and a hard round cap. Returns the number
   * of units written; units beyond the cap remain queued for the next tick/flush.
   */
  async flush(): Promise<number> {
    let total = 0;
    let zeroProgressRuns = 0;
    let rounds = 0;
    while (this.queue.size > 0 && zeroProgressRuns < FLUSH_ZERO_PROGRESS_LIMIT && rounds < FLUSH_MAX_ROUNDS) {
      const result = await this.queue.drainReport(this.sink, this.limitPerTick);
      total += result.written;
      rounds++;
      zeroProgressRuns = result.written === 0 ? zeroProgressRuns + 1 : 0;
      if (result.written > 0 && this.onUnitsCommitted && result.committedKeys.length > 0) {
        try {
          this.onUnitsCommitted(result.committedKeys);
        } catch {
          // Bookkeeping callbacks must never break the save loop.
        }
      }
    }
    return total;
  }

  /** Number of pending (not-yet-persisted) units. */
  get size(): number {
    return this.queue.size;
  }
}
