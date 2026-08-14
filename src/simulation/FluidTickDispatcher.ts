/**
 * Scheduled fluid tick dispatch (077). `FluidTickDispatcher` layers a validated per-tick budget
 * over a dedicated 047 `ScheduledTickQueue` (the queue instance MUST be fluid-only — 047 entries
 * carry no kind), dispatching due ticks to a caller-supplied handler in the queue's deterministic
 * `(tickTime, insertion)` order. Excess due entries are deferred at their original due tick
 * (fresh insertion order — deterministic). The dispatcher never interprets fluid state; 078/079
 * implement the handler.
 */
import { ScheduledTickQueue } from './ScheduledTickQueue';

/** Owns fluid flow semantics (078/079); invoked once per due fluid tick. */
export type FluidTickHandler = (x: number, y: number, z: number, dueTick: number) => void;

/** Per-tick dispatch outcome. */
export interface FluidTickDispatchReport {
  /** Handlers invoked this tick. */
  processed: number;
  /** Due entries deferred to a later tick (kept at their original due tick). */
  deferred: number;
  /** Entries still pending after this tick. */
  pending: number;
}

/** Default cap on fluid handlers per tick. */
export const DEFAULT_MAX_FLUID_TICKS_PER_TICK = 1000;

/** Bounded, deterministic dispatch of scheduled fluid ticks. */
export class FluidTickDispatcher {
  private readonly queue: ScheduledTickQueue;
  private readonly handler: FluidTickHandler;
  private readonly maxPerTick: number;

  constructor(queue: ScheduledTickQueue, handler: FluidTickHandler, maxPerTick: number = DEFAULT_MAX_FLUID_TICKS_PER_TICK) {
    if (!Number.isInteger(maxPerTick) || maxPerTick <= 0) {
      throw new RangeError(`FluidTickDispatcher: maxPerTick must be a positive integer, got ${maxPerTick}`);
    }
    this.queue = queue;
    this.handler = handler;
    this.maxPerTick = maxPerTick;
  }

  /** Schedule fluid work `delayTicks` after `currentTick` (position dedupe via 047). */
  schedule(x: number, y: number, z: number, delayTicks: number, currentTick: number): void {
    this.queue.scheduleIn(x, y, z, delayTicks, currentTick);
  }

  /**
   * Dispatch due fluid ticks: at most `maxPerTick` handlers run in the queue's deterministic
   * order; the excess is deferred at its original due tick. Returns the outcome report.
   */
  tick(nowTick: number): FluidTickDispatchReport {
    const due = this.queue.tick(nowTick);
    const processedCount = Math.min(due.length, this.maxPerTick);
    for (let i = 0; i < processedCount; i++) {
      const entry = due[i]!;
      this.handler(entry.x, entry.y, entry.z, entry.tickTime);
    }
    for (let i = processedCount; i < due.length; i++) {
      const entry = due[i]!;
      this.queue.schedule(entry.x, entry.y, entry.z, entry.tickTime);
    }
    return {
      processed: processedCount,
      deferred: due.length - processedCount,
      pending: this.queue.size,
    };
  }

  /** Number of pending fluid ticks. */
  get pendingCount(): number {
    return this.queue.size;
  }

  /** Remove all pending fluid ticks. */
  clear(): void {
    this.queue.clear();
  }
}
