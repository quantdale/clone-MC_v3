/**
 * Render interpolation (045). Rendered state is interpolated between the previous and current fixed
 * simulation tick snapshots using the 044 clock's accumulator as the alpha (`accumulatorMs / TICK_MS`),
 * clamped to `[0, 1]` so the renderer never extrapolates ahead of simulation truth (bounded catch-up:
 * when frames are late, rendering sits at the latest state until ticks catch up). The interpolator is
 * read-only over simulation snapshots — simulation truth is never changed — and copies snapshots on
 * set into grow-only scratch buffers, so steady-state per-frame use performs no allocations.
 * `interpolate` returns a reused scratch array (consume it before the next call; use
 * `interpolateInto` to own the storage). Teleports must call `notifyTeleport()` so the renderer
 * never blends across the discontinuity.
 */
import { TICK_MS } from './SimulationClock';

/** A numeric state vector, e.g. `[x, y, z]`. */
export type RenderState = readonly number[];

/**
 * Render alpha from the 044 clock accumulator, clamped to `[0, 1]`: `0` = previous tick,
 * `1` = current tick, anything in between is a blend. Values beyond one tick (catch-up pending) clamp
 * to `1` rather than extrapolating. `tickMs` defaults to the canonical 50 ms tick.
 */
export function alphaFromAccumulator(accumulatorMs: number, tickMs: number = TICK_MS): number {
  if (!Number.isFinite(accumulatorMs) || !Number.isFinite(tickMs) || tickMs <= 0) return 0;
  const alpha = accumulatorMs / tickMs;
  if (alpha < 0) return 0;
  if (alpha > 1) return 1;
  return alpha;
}

/** Linearly interpolates between previous and current simulation snapshots for rendering. */
export class RenderInterpolator {
  /** Grow-only scratch buffers; roles swap on `setState` so only one copy happens per tick. */
  private previousBuf: number[] = [];
  private currentBuf: number[] = [];
  private outBuf: number[] = [];
  private size = -1;
  /** Logical component count of the retained previous snapshot (`-1` when none). */
  private previousSize = -1;
  private hasPrevious = false;
  private prevTickIndex = -1;
  private currTickIndex = -1;

  /**
   * Feed the latest authoritative simulation snapshot. The previous snapshot is retained for
   * interpolation; the input is copied into reusable scratch, never aliased. `tickIndex` tags the
   * snapshot for continuity checks (defaults to the internally tracked next index).
   */
  setState(state: RenderState, tickIndex?: number): void {
    const n = state.length;
    // The snapshot being demoted to "previous" carries the old logical size.
    this.previousSize = this.size;
    // Swap buffer roles: the old current becomes the previous without copying it.
    const swap = this.previousBuf;
    this.previousBuf = this.currentBuf;
    this.currentBuf = swap;
    if (this.currentBuf.length < n) this.currentBuf.length = n;
    for (let i = 0; i < n; i++) {
      this.currentBuf[i] = state[i]!;
    }
    this.size = n;
    this.hasPrevious = true;
    this.prevTickIndex = this.currTickIndex;
    this.currTickIndex =
      typeof tickIndex === 'number' && Number.isFinite(tickIndex) ? Math.trunc(tickIndex) : this.prevTickIndex + 1;
  }

  /**
   * Rendered state for `alpha` in `[0, 1]` (clamped). With no previous snapshot — on a
   * component-count mismatch — or across a non-consecutive tick pair (teleport/reset), returns the
   * current snapshot unblended. The returned array is reused internal scratch: consume it before
   * the next `interpolate`/`setState` call, or use `interpolateInto` to own the storage.
   */
  interpolate(alpha: number): number[] {
    return this.interpolateInto(this.outBuf, alpha);
  }

  /**
   * Same blend as `interpolate`, written into the caller's array (grown to the component count).
   * Returns `target`. Allocation-free when `target` is already sized.
   */
  interpolateInto(target: number[], alpha: number): number[] {
    const n = this.size;
    if (n < 0) {
      target.length = 0;
      return target;
    }
    const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
    const curr = this.currentBuf;

    const canBlend =
      this.hasPrevious &&
      this.previousSize === this.size &&
      this.prevTickIndex >= 0 &&
      this.currTickIndex === this.prevTickIndex + 1;

    if (!canBlend) {
      if (target.length < n) target.length = n;
      for (let i = 0; i < n; i++) target[i] = curr[i]!;
      return target;
    }

    const prev = this.previousBuf;
    if (target.length < n) target.length = n;
    for (let i = 0; i < n; i++) {
      target[i] = prev[i]! + (curr[i]! - prev[i]!) * a;
    }
    return target;
  }

  /** True once a current snapshot exists. */
  get hasState(): boolean {
    return this.size >= 0;
  }

  /** Tick index tagged on the latest snapshot (`-1` before the first `setState`). */
  get currentTickIndex(): number {
    return this.currTickIndex;
  }

  /** Tick index tagged on the retained previous snapshot (`-1` when none). */
  get previousTickIndex(): number {
    return this.prevTickIndex;
  }

  /**
   * Alpha-reset hook for teleports/respawns: drop the retained previous snapshot so the next
   * render shows the current state unblended instead of sweeping across the map.
   */
  notifyTeleport(): void {
    this.hasPrevious = false;
    this.previousSize = -1;
    this.prevTickIndex = -1;
  }

  /** Clear the interpolation history; the next `setState` behaves like the first. */
  reset(): void {
    this.previousBuf.length = 0;
    this.currentBuf.length = 0;
    this.outBuf.length = 0;
    this.size = -1;
    this.previousSize = -1;
    this.hasPrevious = false;
    this.prevTickIndex = -1;
    this.currTickIndex = -1;
  }
}
