import { SimulationClock } from '../engine/SimulationClock';

/**
 * Headless authoritative world tick process (224): the production counterpart to the
 * test-side SimulationHarness (055). Owns a fixed-timestep clock (SimulationClock, 044) and
 * a completed-tick counter, and drives an ordered set of TickSystems exactly once per tick
 * with monotonic 1-based tick numbers. Drivable by wall time (`update(nowMs)`, clock-fed,
 * bounded catch-up) or directly (`step(times)`, authoritative replay). A throwing system
 * stops the process: the failed tick is never counted, the error is recorded in `lastError`
 * and rethrown from the driving call, and every subsequent driving call rethrows the same
 * value until `reset()`. Pure and headless-safe: no DOM, no timers, no IO.
 */
export interface TickSystem {
  /** Called once per fixed tick, in registration order, with the 1-based tick number. */
  tick(tick: number): void;
}

export interface WorldTickProcessOptions {
  /** Systems ticked in registration order, exactly once per tick. Captured at construction;
   *  later mutations are ignored. Default []. */
  readonly systems?: readonly TickSystem[];
  /** Fixed-timestep clock; defaults to a fresh SimulationClock. Must provide callable
   *  update, isRunning, and reset. */
  readonly clock?: SimulationClock;
}

function isTickSystem(value: unknown): value is TickSystem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TickSystem).tick === 'function'
  );
}

function isClock(value: unknown): value is SimulationClock {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  // The process invokes update/reset; isRunning is read (SimulationClock exposes it as a
  // getter returning a boolean, so it is not checked as a function).
  return typeof c.update === 'function' && typeof c.reset === 'function';
}

/** Headless authoritative world tick process. */
export class WorldTickProcess {
  private readonly systems: readonly TickSystem[];
  private readonly clock: SimulationClock;
  private tickCounter = 0;
  private stopped = false;
  private error: unknown = null;

  constructor(options: WorldTickProcessOptions = {}) {
    const systems = options.systems ?? [];
    if (!Array.isArray(systems)) {
      throw new Error('WorldTickProcess: systems must be an array');
    }
    for (let i = 0; i < systems.length; i++) {
      if (!isTickSystem(systems[i])) {
        throw new Error(`WorldTickProcess: systems ${i} must have a callable tick`);
      }
    }
    const clock = options.clock ?? new SimulationClock();
    if (!isClock(clock)) {
      throw new Error('WorldTickProcess: clock must provide callable update and reset');
    }
    this.systems = systems;
    this.clock = clock;
  }

  /**
   * Feed one wall-clock timestamp. Runs exactly the ticks the clock emits (bounded by the
   * clock's maxTicksPerFrame; the first call anchors the clock and returns 0). Returns the
   * number of ticks run. Rethrows any system failure after stopping the process.
   */
  update(nowMs: number): number {
    this.throwIfStopped();
    try {
      const emitted = this.clock.update(nowMs);
      this.runTicks(emitted);
      return emitted;
    } catch (err) {
      this.stopped = true;
      this.error = err;
      throw err;
    }
  }

  /**
   * Run exactly `times` ticks directly, bypassing the clock (authoritative headless
   * stepping). Non-integer or `<= 0` times is a no-op returning 0. Returns the number of
   * ticks run. Rethrows any system failure after stopping the process.
   */
  step(times: number = 1): number {
    this.throwIfStopped();
    if (!Number.isInteger(times) || times <= 0) return 0;
    try {
      this.runTicks(times);
      return times;
    } catch (err) {
      this.stopped = true;
      this.error = err;
      throw err;
    }
  }

  /** Completed ticks (a failed tick is never counted). */
  get tick(): number {
    return this.tickCounter;
  }

  /** True once the clock has been anchored by an `update` (and not reset). */
  get isRunning(): boolean {
    return this.clock.isRunning;
  }

  /** True after a system failure, until `reset()`. */
  get isStopped(): boolean {
    return this.stopped;
  }

  /** The error that stopped the process, or null. */
  get lastError(): unknown {
    return this.error;
  }

  /** Clear the stopped/error state, zero the counter, and reset the clock (the next
   *  `update` re-anchors returning 0; the next `step` restarts numbering at 1). */
  reset(): void {
    this.stopped = false;
    this.error = null;
    this.tickCounter = 0;
    this.clock.reset();
  }

  private throwIfStopped(): void {
    if (this.stopped) {
      throw this.error;
    }
  }

  /** Advance exactly `times` ticks: each tick calls every system with `tickCounter + 1`,
   *  and the counter advances only when every system returned. */
  private runTicks(times: number): void {
    for (let i = 0; i < times; i++) {
      const next = this.tickCounter + 1;
      for (const system of this.systems) {
        system.tick(next);
      }
      this.tickCounter++;
    }
  }
}
