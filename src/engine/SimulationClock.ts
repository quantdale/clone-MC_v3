/**
 * Canonical deterministic 20 TPS simulation clock (044), decoupled from render FPS. The render loop
 * feeds wall-clock timestamps via `update(nowMs)`; the clock accumulates frame deltas and emits
 * exactly whole 50 ms ticks, bounding catch-up (`maxTicksPerFrame`) and capping the accumulator after
 * a stall so a long frame cannot cause a spiral of death. The clock is pure: all state is a function
 * of the supplied timestamps, so it is fully unit-testable headlessly with scripted time.
 */
export const TICK_RATE = 20;

/** Milliseconds per fixed simulation tick. */
export const TICK_MS = 50;

export interface SimulationClockOptions {
  /** Maximum ticks emitted per `update` (default 10). */
  maxTicksPerFrame?: number;
}

/** Fixed-timestep accumulator clock for simulation ticks. */
export class SimulationClock {
  private readonly maxTicksPerFrame: number;
  private accumulator = 0;
  private lastTime: number | null = null;
  private ticks = 0;
  private simulatedMs = 0;

  constructor(opts: SimulationClockOptions = {}) {
    this.maxTicksPerFrame = opts.maxTicksPerFrame ?? 10;
  }

  /**
   * Feed one frame timestamp. Returns the number of fixed ticks that should run this frame:
   * `floor(accumulated / TICK_MS)`, bounded by `maxTicksPerFrame`, with the remainder accumulated.
   * The first call (and any call after `reset()`) anchors the clock and returns 0.
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
    this.accumulator += delta;

    let emitted = 0;
    while (this.accumulator >= TICK_MS && emitted < this.maxTicksPerFrame) {
      this.accumulator -= TICK_MS;
      this.ticks++;
      this.simulatedMs += TICK_MS;
      emitted++;
    }

    // Cap the remainder after a capped frame so the next frame starts below one tick.
    if (this.accumulator >= TICK_MS) {
      this.accumulator = TICK_MS - 1;
    }

    return emitted;
  }

  /** Total fixed ticks emitted since construction (or last `reset`). */
  get totalTicks(): number {
    return this.ticks;
  }

  /** Total simulated milliseconds (`totalTicks * TICK_MS`). */
  get totalMs(): number {
    return this.simulatedMs;
  }

  /** Un-emitted accumulated milliseconds. */
  get accumulatorMs(): number {
    return this.accumulator;
  }

  /** True once a timestamp has been fed (and not reset). */
  get isRunning(): boolean {
    return this.lastTime !== null;
  }

  /** Restore the initial state (anchor the next `update`). */
  reset(): void {
    this.accumulator = 0;
    this.lastTime = null;
    this.ticks = 0;
    this.simulatedMs = 0;
  }
}
