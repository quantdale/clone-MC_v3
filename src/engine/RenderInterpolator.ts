/**
 * Render interpolation (045). Rendered state is interpolated between the previous and current fixed
 * simulation tick snapshots using the 044 clock's accumulator as the alpha (`accumulatorMs / TICK_MS`),
 * clamped to `[0, 1]` so the renderer never extrapolates ahead of simulation truth (bounded catch-up:
 * when frames are late, rendering sits at the latest state until ticks catch up). The interpolator is
 * read-only over simulation snapshots — simulation truth is never changed — and copies snapshots on
 * set so callers can reuse their arrays.
 */
import { TICK_MS } from './SimulationClock';

/** A numeric state vector, e.g. `[x, y, z]`. */
export type RenderState = readonly number[];

/**
 * Render alpha from the 044 clock accumulator, clamped to `[0, 1]`: `0` = previous tick,
 * `1` = current tick, anything in between is a blend. Values beyond one tick (catch-up pending) clamp
 * to `1` rather than extrapolating.
 */
export function alphaFromAccumulator(accumulatorMs: number): number {
  if (!Number.isFinite(accumulatorMs)) return 0;
  const alpha = accumulatorMs / TICK_MS;
  if (alpha < 0) return 0;
  if (alpha > 1) return 1;
  return alpha;
}

/** Linearly interpolates between previous and current simulation snapshots for rendering. */
export class RenderInterpolator {
  private previous: number[] | null = null;
  private current: number[] | null = null;

  /**
   * Feed the latest authoritative simulation snapshot. The previous snapshot is retained for
   * interpolation; the input array is copied, never aliased.
   */
  setState(state: RenderState): void {
    this.previous = this.current;
    this.current = [...state];
  }

  /**
   * Rendered state for `alpha` in `[0, 1]` (clamped). With no previous snapshot — or on a
   * component-count mismatch — returns the current snapshot unchanged.
   */
  interpolate(alpha: number): number[] {
    if (this.current === null) return [];
    const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;

    if (this.previous === null || this.previous.length !== this.current.length) {
      return [...this.current];
    }

    const prev = this.previous;
    const curr = this.current;
    const out: number[] = new Array(curr.length);
    for (let i = 0; i < curr.length; i++) {
      out[i] = prev[i]! + (curr[i]! - prev[i]!) * a;
    }
    return out;
  }

  /** True once a current snapshot exists. */
  get hasState(): boolean {
    return this.current !== null;
  }

  /** Clear the interpolation history; the next `setState` behaves like the first. */
  reset(): void {
    this.previous = null;
    this.current = null;
  }
}
