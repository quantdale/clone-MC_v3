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
  /**
   * Optional per-system wall-time budget, aligning the process with the 238 TickBudgetMonitor
   * and the fixed-tick driver pipeline (audit 02 §3). When set, every system's tick is timed in
   * registration order; overruns are recorded (never thrown) and surfaced through
   * `lastSystemTickMillis`, `systemBudgetOverruns`, and `withinTickBudget`.
   */
  readonly perSystemBudget?: TickBudgetSettings;
}

/** Per-system budget settings mirroring `TickBudgetConfig` without importing it (avoids a cycle). */
export interface TickBudgetSettings {
  /** Maximum wall time for one wrapped system tick, in milliseconds. */
  readonly maxTickMillis: number;
  /** Injectable time source; defaults to `performance.now()` when available, else `Date.now()`. */
  readonly now?: () => number;
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
  /** Non-null iff `perSystemBudget` was configured; same order/length as `systems`. */
  private readonly timed: TimedSystem[] | null;
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

    let effective: readonly TickSystem[] = systems;
    let timed: TimedSystem[] | null = null;
    const budget = options.perSystemBudget;
    if (budget !== undefined) {
      const maxTickMillis = budget.maxTickMillis;
      if (typeof maxTickMillis !== 'number' || !Number.isFinite(maxTickMillis) || maxTickMillis <= 0) {
        throw new Error(
          `WorldTickProcess: perSystemBudget.maxTickMillis must be a positive finite number, got ${String(maxTickMillis)}`,
        );
      }
      const now = budget.now ?? defaultNow();
      timed = new Array<TimedSystem>(systems.length);
      for (let i = 0; i < systems.length; i++) {
        timed[i] = new TimedSystem(systems[i]!, maxTickMillis, now);
      }
      effective = timed;
    }

    this.timed = timed;
    this.systems = effective;
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

  /** The effective systems in their fixed execution order (post budget wrapping, if configured). */
  get systemsInOrder(): readonly TickSystem[] {
    return this.systems;
  }

  /** Longest single-system elapsed wall time on the last completed tick, in ms (0 without a budget). */
  get lastSystemTickMillis(): number {
    if (this.timed === null) return 0;
    let worst = 0;
    for (let i = 0; i < this.timed.length; i++) {
      const ms = this.timed[i]!.lastMs;
      if (ms > worst) worst = ms;
    }
    return worst;
  }

  /** Total recorded overruns across all timed systems (always 0 without a budget). */
  get systemBudgetOverruns(): number {
    if (this.timed === null) return 0;
    let total = 0;
    for (let i = 0; i < this.timed.length; i++) {
      total += this.timed[i]!.overruns;
    }
    return total;
  }

  /** Whether the last completed tick's slowest system was within `perSystemBudget` (true without one). */
  get withinTickBudget(): boolean {
    if (this.timed === null) return true;
    const budget = this.timed[0]?.budgetMillis ?? Number.POSITIVE_INFINITY;
    return this.lastSystemTickMillis <= budget;
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

  /** Clear the stopped/error state, zero the counter, reset the clock and budget counters (the
   *  next `update` re-anchors returning 0; the next `step` restarts numbering at 1). */
  reset(): void {
    this.stopped = false;
    this.error = null;
    this.tickCounter = 0;
    this.clock.reset();
    if (this.timed !== null) {
      for (let i = 0; i < this.timed.length; i++) {
        this.timed[i]!.resetCounters();
      }
    }
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

function defaultNow(): () => number {
  return typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
}

/**
 * Local per-system timing wrapper (alignment with the 238 TickBudgetMonitor, kept here to avoid a
 * runtime import cycle). Times each inner tick; overruns are recorded, never thrown.
 */
class TimedSystem implements TickSystem {
  lastMs = 0;
  overruns = 0;

  constructor(
    private readonly inner: TickSystem,
    readonly budgetMillis: number,
    private readonly now: () => number,
  ) {}

  tick(tick: number): void {
    const start = this.now();
    this.inner.tick(tick);
    const elapsed = Math.max(0, this.now() - start);
    this.lastMs = elapsed;
    if (elapsed > this.budgetMillis) this.overruns++;
  }

  resetCounters(): void {
    this.lastMs = 0;
    this.overruns = 0;
  }
}
