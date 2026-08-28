/**
 * Per-tick budget monitor (238, frame-tick-budget-enforcement). Wraps a 224 `TickSystem` and times
 * each `tick` call with an injectable clock, recording a wall-time overrun when the elapsed time
 * exceeds `maxTickMillis` (intentionally well below the 50 ms `TICK_MS`). An overrun is recorded, not
 * thrown, and does not stop the process on its own; a system that throws still propagates per 224
 * semantics. `sample()` exposes the verdict; `evaluateTickBudget` is a pure single-dimension verdict
 * helper mirroring 075. Pure and headless-safe.
 */
import type { TickSystem } from './WorldTickProcess';

/** Per-tick wall-time budget. */
export interface TickBudgetConfig {
  /** Maximum wall time for one wrapped `TickSystem.tick`, in milliseconds. */
  maxTickMillis: number;
}

/** Default per-tick budget (8.33 ms), well below `TICK_MS = 50` so an overrun is caught early. */
export const DEFAULT_TICK_BUDGET: TickBudgetConfig = {
  maxTickMillis: 8.33,
};

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Validate an unknown value as `TickBudgetConfig`. Throws a descriptive error for any non-positive/
 * non-finite/non-numeric `maxTickMillis` or non-object input.
 */
export function validateTickBudgetConfig(input: unknown): TickBudgetConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error('TickBudgetConfig: must be an object');
  }
  const r = input as Record<string, unknown>;
  if (!isPositiveFinite(r.maxTickMillis)) {
    throw new Error(`TickBudgetConfig: maxTickMillis must be a positive finite number, got ${String(r.maxTickMillis)}`);
  }
  return input as TickBudgetConfig;
}

/** One dimension of a tick budget evaluation. */
export interface TickBudgetEntry {
  dimension: 'tick';
  budget: number;
  actual: number;
  withinBudget: boolean;
}

function withinLatency(budget: number, actual: number): boolean {
  if (typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0) return false;
  return actual <= budget;
}

/**
 * Evaluate the last tick's elapsed time against the tick budget. A dimension is within iff
 * `actual <= budget`; malformed actuals violate.
 */
export function evaluateTickBudget(
  config: TickBudgetConfig,
  actual: { lastTickMillis: number },
): TickBudgetEntry {
  const cfg = validateTickBudgetConfig(config);
  return {
    dimension: 'tick',
    budget: cfg.maxTickMillis,
    actual: actual.lastTickMillis,
    withinBudget: withinLatency(cfg.maxTickMillis, actual.lastTickMillis),
  };
}

/** Snapshot of the tick monitor's verdict. */
export interface TickSample {
  lastTickMillis: number;
  overruns: number;
  lastOverrunMillis: number;
  withinBudget: boolean;
}

export interface TickBudgetMonitorOptions {
  now: () => number;
  config: TickBudgetConfig;
}

/**
 * Times a wrapped `TickSystem` per tick and records overruns without throwing. Implements `TickSystem`
 * so it can be registered inside a `WorldTickProcess`. A system that throws propagates the exception
 * (per 224, it stops the process) and is not recorded as an overrun.
 */
export class TickBudgetMonitor {
  private readonly now: () => number;
  private readonly budgetMillis: number;
  private readonly system: TickSystem;
  private lastMs = 0;
  private overrunCount = 0;
  private lastOverrunMs = 0;

  constructor(system: TickSystem, opts: TickBudgetMonitorOptions) {
    const cfg = validateTickBudgetConfig(opts.config);
    this.system = system;
    this.now = opts.now;
    this.budgetMillis = cfg.maxTickMillis;
  }

  /** Time the wrapped system's tick; record an overrun (non-throwing) if it exceeds the budget. */
  tick(tick: number): void {
    const start = this.now();
    this.system.tick(tick);
    const elapsed = Math.max(0, this.now() - start);
    this.lastMs = elapsed;
    if (elapsed > this.budgetMillis) {
      this.overrunCount++;
      this.lastOverrunMs = elapsed;
    }
  }

  /** The last tick's elapsed wall time, in milliseconds. */
  get lastTickMillis(): number {
    return this.lastMs;
  }

  /** The per-tick budget, in milliseconds. */
  get maxTickMillis(): number {
    return this.budgetMillis;
  }

  /** Number of ticks that exceeded the budget. */
  get overruns(): number {
    return this.overrunCount;
  }

  /** Elapsed time of the most recent overrun, in milliseconds (0 if none). */
  get lastOverrunMillis(): number {
    return this.lastOverrunMs;
  }

  /** Clear the timing/overrun counters (e.g. alongside a process `reset`); the budget is kept. */
  reset(): void {
    this.lastMs = 0;
    this.overrunCount = 0;
    this.lastOverrunMs = 0;
  }

  /** A verdict snapshot: last tick time, overruns, last overrun, and whether the last tick was in budget. */
  sample(): TickSample {
    return {
      lastTickMillis: this.lastMs,
      overruns: this.overrunCount,
      lastOverrunMillis: this.lastOverrunMs,
      withinBudget: withinLatency(this.budgetMillis, this.lastMs),
    };
  }
}

/**
 * Alignment helper for the fixed-tick driver pipeline (audit 02 §3): wraps any `TickSystem` in a
 * {@link TickBudgetMonitor} so it can be registered — in order — inside a `WorldTickProcess` or
 * driven from a `FixedTickDriver` tick callback while still reporting per-tick budget verdicts.
 */
export function wrapSystemWithBudget(system: TickSystem, opts: TickBudgetMonitorOptions): TickBudgetMonitor {
  if (!isTickSystemValue(system)) {
    throw new Error('wrapSystemWithBudget: system must have a callable tick');
  }
  return new TickBudgetMonitor(system, opts);
}

function isTickSystemValue(value: unknown): value is TickSystem {
  return typeof value === 'object' && value !== null && typeof (value as TickSystem).tick === 'function';
}
