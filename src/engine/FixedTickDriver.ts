import { SimulationClock } from './SimulationClock';

/**
 * FixedTickDriver: the single owner that turns rAF frame deltas into deterministic fixed ticks
 * (audit 02 §3). Per rendered frame it advances a {@link SimulationClock} by the frame delta,
 * runs 0..N fixed ticks through an injected callback in strictly ascending tick-index order, and
 * reports the render alpha for interpolating between the previous and current tick states.
 *
 * Deterministic ordering guarantees:
 * - Input may be sampled every frame, but is consumed only inside `tick` callbacks at tick
 *   boundaries — never mid-tick and never during rendering.
 * - Ticks execute in ascending, gap-free `tickIndex` order starting at 0; every catch-up tick
 *   completes before `advance` returns, so rendering always observes a whole number of applied
 *   ticks.
 * - Catch-up is bounded (`maxCatchUpTicks`); simulated time beyond that bound is discarded
 *   deterministically (same frame-delta sequence ⇒ same tick schedule) instead of spiraling.
 * - Alpha is computed after all of the frame's ticks have run, so it always blends between the
 *   two most recent completed tick states.
 *
 * The driver owns its monotonic time base: `advance(frameDtSeconds)` feeds synthetic timestamps
 * to the clock, so callers never pass wall-clock stamps and paused/backward frames are handled
 * uniformly. Hot path is allocation-light: `advance` returns a reused result object.
 */

/** Default fixed simulation rate (Minecraft-style 20 TPS). */
const DEFAULT_TICK_RATE_HZ = 20;

/** Default bounded catch-up: at most this many ticks run per rendered frame. */
const DEFAULT_MAX_CATCH_UP_TICKS = 5;

export interface FixedTickDriverOptions {
  /** Fixed simulation rate in hertz (default 20). Must be positive and finite. */
  readonly tickRateHz?: number;
  /** Maximum catch-up ticks per `advance` (default 5). Excess debt is discarded and reported. */
  readonly maxCatchUpTicks?: number;
  /**
   * The fixed-tick body, called once per tick with the 0-based `tickIndex`. Route player, world,
   * entity, fluid, and random ticks through one ordered pipeline inside this callback (e.g. via
   * `WorldTickProcess`) so their relative order is fixed.
   */
  readonly tick: (tickIndex: number) => void;
}

/** Per-frame outcome of `FixedTickDriver.advance`. */
export interface FixedTickFrameResult {
  /** Fixed ticks executed this frame (0..maxCatchUpTicks). */
  readonly ticksExecuted: number;
  /** Whole ticks dropped this frame because they exceeded the catch-up bound. */
  readonly debtDiscarded: number;
  /** Render alpha in [0, 1]: 0 = previous tick state, 1 = current tick state. */
  readonly alpha: number;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Drives N deterministic fixed ticks per rendered frame behind a narrow API. */
export class FixedTickDriver {
  private readonly clock: SimulationClock;
  private readonly tickFn: (tickIndex: number) => void;
  private readonly tickIntervalMs: number;
  /** Synthetic monotonic clock fed to the SimulationClock (never regresses). */
  private syntheticNowMs = 0;
  /** Index the next executed tick receives. */
  private nextTickIndex = 0;
  /** Debt counter watermark so `debtDiscarded` reports only new drops per frame. */
  private lastDebtSeen = 0;
  /** Reused per-frame result (invalidated by the next `advance`). */
  private readonly frameResult: { ticksExecuted: number; debtDiscarded: number; alpha: number } = {
    ticksExecuted: 0,
    debtDiscarded: 0,
    alpha: 0,
  };

  constructor(options: FixedTickDriverOptions) {
    if (typeof options.tick !== 'function') {
      throw new Error('FixedTickDriver: tick must be a function');
    }
    const tickRateHz = options.tickRateHz ?? DEFAULT_TICK_RATE_HZ;
    if (!isPositiveFinite(tickRateHz)) {
      throw new Error(`FixedTickDriver: tickRateHz must be a positive finite number, got ${String(options.tickRateHz)}`);
    }
    const maxCatchUpTicks = options.maxCatchUpTicks ?? DEFAULT_MAX_CATCH_UP_TICKS;
    if (!Number.isInteger(maxCatchUpTicks) || maxCatchUpTicks < 1) {
      throw new Error(
        `FixedTickDriver: maxCatchUpTicks must be an integer >= 1, got ${String(options.maxCatchUpTicks)}`,
      );
    }
    this.tickFn = options.tick;
    this.tickIntervalMs = 1000 / tickRateHz;
    this.clock = new SimulationClock({ maxTicksPerFrame: maxCatchUpTicks });
  }

  /**
   * Advance the simulation by one rendered frame's delta (seconds). Runs the bounded number of
   * fixed ticks owed by the delta, then computes alpha from the leftover accumulator. Non-finite
   * or non-positive deltas are treated as zero-length frames (no ticks, unchanged alpha).
   */
  advance(frameDtSeconds: number): FixedTickFrameResult {
    const result = this.frameResult;
    if (!Number.isFinite(frameDtSeconds) || frameDtSeconds <= 0) {
      result.ticksExecuted = 0;
      result.debtDiscarded = 0;
      result.alpha = this.alpha;
      return result;
    }

    this.syntheticNowMs += frameDtSeconds * 1000;
    const emitted = this.clock.update(this.syntheticNowMs);
    for (let i = 0; i < emitted; i++) {
      this.tickFn(this.nextTickIndex++);
    }

    const totalDebt = this.clock.debtDiscardedTicks;
    result.ticksExecuted = emitted;
    result.debtDiscarded = totalDebt - this.lastDebtSeen;
    this.lastDebtSeen = totalDebt;
    result.alpha = this.alpha;
    return result;
  }

  /** Current render alpha in [0, 1] from the leftover accumulator (no ticks run). */
  get alpha(): number {
    const raw = this.clock.accumulatorMs / this.tickIntervalMs;
    if (!Number.isFinite(raw)) return 0;
    return raw < 0 ? 0 : raw > 1 ? 1 : raw;
  }

  /** Index of the latest completed tick state (for interpolation "current"). */
  get currentTickIndex(): number {
    return this.clock.currentTickIndex;
  }

  /** Index of the previous completed tick state (`-1` before the first tick). */
  get previousTickIndex(): number {
    return this.clock.previousTickIndex;
  }

  /** Total fixed ticks executed since construction (or last `reset`). */
  get totalTicks(): number {
    return this.clock.totalTicks;
  }

  /** True once any frame has been advanced (and not reset). */
  get isRunning(): boolean {
    return this.clock.isRunning;
  }

  /** Suspend tick emission; subsequent deltas keep the time anchor fresh and run no ticks. */
  pause(): void {
    this.clock.pause();
  }

  /** Resume tick emission; the paused interval itself is never replayed. */
  resume(): void {
    this.clock.resume();
  }

  get isPaused(): boolean {
    return this.clock.isPaused;
  }

  /** Restore initial state: tick numbering restarts at 0 on the next anchored frame. */
  reset(): void {
    this.clock.reset();
    this.syntheticNowMs = 0;
    this.nextTickIndex = 0;
    this.lastDebtSeen = 0;
    this.frameResult.ticksExecuted = 0;
    this.frameResult.debtDiscarded = 0;
    this.frameResult.alpha = 0;
  }
}
