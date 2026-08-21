/**
 * Canonical deterministic 20 TPS simulation clock (044), decoupled from render FPS. The render loop
 * feeds wall-clock timestamps via `update(nowMs)`; the clock accumulates frame deltas and emits
 * exactly whole 50 ms ticks, bounding catch-up (`maxTicksPerFrame`). Backlog beyond that bound is
 * explicitly discarded and counted (`debtDiscardedTicks`) instead of being carried forward, so a
 * long stall can never spiral into unbounded catch-up on later frames. `pause()`/`resume()` freeze
 * emission while keeping the time anchor fresh, so resuming never replays the paused wall time.
 * The clock exposes the latest completed tick index and its predecessor for render interpolation.
 * The clock is pure: all state is a function of the supplied timestamps, so it is fully
 * unit-testable headlessly with scripted time.
 */
export const TICK_RATE = 20;

/** Milliseconds per fixed simulation tick. */
export const TICK_MS = 50;

/** Default maximum ticks emitted per `update` (bounded catch-up, audit 02 §3 recommends 4–5). */
export const DEFAULT_MAX_TICKS_PER_FRAME = 5;

export interface SimulationClockOptions {
  /** Maximum ticks emitted per `update` (default 5). Excess backlog is discarded and counted. */
  maxTicksPerFrame?: number;
}

/** Fixed-timestep accumulator clock for simulation ticks. */
export class SimulationClock {
  private readonly maxTicksPerFrame: number;
  private accumulator = 0;
  private lastTime: number | null = null;
  private ticks = 0;
  private simulatedMs = 0;
  private paused = false;
  private discardedTicks = 0;
  private discardedMs = 0;

  constructor(opts: SimulationClockOptions = {}) {
    this.maxTicksPerFrame = opts.maxTicksPerFrame ?? DEFAULT_MAX_TICKS_PER_FRAME;
  }

  /**
   * Feed one frame timestamp. Returns the number of fixed ticks that should run this frame:
   * `floor(accumulated / TICK_MS)`, bounded by `maxTicksPerFrame`; backlog beyond the bound is
   * discarded (see `debtDiscardedTicks`) rather than accumulated. While paused the anchor still
   * advances but no time is accumulated and 0 is returned. The first call (and any call after
   * `reset()`) anchors the clock and returns 0.
   */
  update(nowMs: number): number {
    if (!Number.isFinite(nowMs)) return 0;
    if (this.lastTime === null) {
      this.lastTime = nowMs;
      return 0;
    }

    const delta = nowMs - this.lastTime;
    if (delta < 0) return 0; // backward time: ignore, keep the anchor
    this.lastTime = nowMs;
    if (this.paused) return 0; // discard paused wall time; resume continues from "now"
    this.accumulator += delta;

    let emitted = 0;
    while (this.accumulator >= TICK_MS && emitted < this.maxTicksPerFrame) {
      this.accumulator -= TICK_MS;
      this.ticks++;
      this.simulatedMs += TICK_MS;
      emitted++;
    }

    // Excess-debt accounting: whole ticks beyond the catch-up bound are dropped, leaving less than
    // one tick of remainder so the next frame starts clean instead of chasing the stall forever.
    if (this.accumulator >= TICK_MS) {
      const excess = Math.floor(this.accumulator / TICK_MS);
      this.discardedTicks += excess;
      this.discardedMs += excess * TICK_MS;
      this.accumulator -= excess * TICK_MS;
    }

    return emitted;
  }

  /** Stop emitting ticks. Wall time keeps flowing through `update` (the anchor stays fresh). */
  pause(): void {
    this.paused = true;
  }

  /** Resume emission; the paused interval itself is never replayed. */
  resume(): void {
    this.paused = false;
  }

  /** Total fixed ticks emitted since construction (or last `reset`). */
  get totalTicks(): number {
    return this.ticks;
  }

  /** Total simulated milliseconds (`totalTicks * TICK_MS`). */
  get totalMs(): number {
    return this.simulatedMs;
  }

  /** Un-emitted accumulated milliseconds (drives render alpha). */
  get accumulatorMs(): number {
    return this.accumulator;
  }

  /** True once a timestamp has been fed (and not reset). */
  get isRunning(): boolean {
    return this.lastTime !== null;
  }

  /** True while tick emission is suspended by `pause()`. */
  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Index of the latest completed tick state (equals `totalTicks`): the "current" snapshot for
   * interpolation. `0` before the first tick.
   */
  get currentTickIndex(): number {
    return this.ticks;
  }

  /** Index of the tick preceding `currentTickIndex`; `-1` when no previous tick exists. */
  get previousTickIndex(): number {
    return this.ticks - 1;
  }

  /** Whole ticks dropped after stalls because they exceeded `maxTicksPerFrame`. */
  get debtDiscardedTicks(): number {
    return this.discardedTicks;
  }

  /** Simulated milliseconds represented by the dropped ticks. */
  get debtDiscardedMs(): number {
    return this.discardedMs;
  }

  /** Restore the initial state (anchor the next `update`, clear pause and debt counters). */
  reset(): void {
    this.accumulator = 0;
    this.lastTime = null;
    this.ticks = 0;
    this.simulatedMs = 0;
    this.paused = false;
    this.discardedTicks = 0;
    this.discardedMs = 0;
  }
}
