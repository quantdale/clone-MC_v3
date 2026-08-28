# Design: 045-render-interpolation

## Context / current state

044 emits fixed 50 ms simulation ticks; render frames happen at arbitrary times between them. Rendered
state currently snapshots the latest tick.

## Target state

A `RenderInterpolator` keeps the previous and current simulation snapshots of a numeric state vector
and produces the linearly interpolated render state for an alpha in `[0, 1]` — the fraction into the
current tick. Alpha is derived from the 044 clock accumulator (`alphaFromAccumulator`) and clamped so
the renderer never extrapolates ahead of the simulation (bounded catch-up: when frames are late,
rendering sits at the latest state until ticks catch up).

## Invariants

- `setState(state)` moves `previous = current` and `current = state`; the first call sets `current`
  only.
- `interpolate(alpha)` returns `previous + (current - previous) * clamp(alpha, 0, 1)` per component.
- `alphaFromAccumulator(a)` returns `clamp(a / TICK_MS, 0, 1)`.
- With no previous state, `interpolate` returns `current` unchanged (no lerp).
- `reset()` clears both snapshots; `hasState` reflects whether a current state exists.
- The interpolator never mutates the supplied snapshots (copies them).

## API and data model

```ts
// src/engine/RenderInterpolator.ts
export type RenderState = readonly number[];
export function alphaFromAccumulator(accumulatorMs: number): number;
export class RenderInterpolator {
  setState(state: RenderState): void;
  interpolate(alpha: number): number[];
  get hasState(): boolean;
  reset(): void;
}
```

## Control / data flow

1. Each fixed tick, the simulation produces an authoritative state snapshot; the game calls
   `setState(snapshot)`.
2. Each render frame, the game calls `interpolate(alphaFromAccumulator(clock.accumulatorMs))` and
   applies the result to the rendered object.
3. Alpha `0` renders the previous tick's state; alpha `1` renders the current tick's state; values in
   between are linear blends. Alpha is clamped to `[0, 1]`, so a render frame that is behind (large
   accumulator pending catch-up) renders the current state rather than extrapolating.

## Detailed behavior

- Snapshots are copied on `setState` (the caller may reuse its array).
- Component counts must match between previous/current; if they differ, `interpolate` falls back to
  `current` (defensive).
- Non-finite alpha → treated as `0` (defensive).

## Failure modes

- Component-count mismatch → returns `current` (no crash).
- Non-finite alpha → returns `current`.

## Compatibility / migration

Additive; no existing behavior changes.

## Performance / resource constraints

`interpolate` is O(n) in the state size (typically 3); called per render frame per interpolated
object.

## Testing seams

- `tests/unit/RenderInterpolator.test.ts`:
  - endpoints: alpha 0 → previous, alpha 1 → current;
  - midpoint: alpha 0.5 → component-wise average;
  - multi-component vectors;
  - `alphaFromAccumulator`: 0 → 0, TICK_MS/2 → 0.5, TICK_MS → 1, 2×TICK_MS → 1 (clamped), negative → 0;
  - first state renders current; `reset()` clears; `hasState` transitions;
  - component-count mismatch fallback;
  - input snapshots are not mutated.

## Observability / debugging

`hasState` exposes readiness for debug overlays.

## Affected files / symbols

- `src/engine/RenderInterpolator.ts` — NEW.
- `tests/unit/RenderInterpolator.test.ts` — NEW.

## Rejected alternatives

- *Extrapolation beyond the current tick*: renders ahead of simulation truth at low FPS; clamping is
  the safe bounded-catch-up policy.
- *Interpolating inside simulation systems*: couples sim to render; the interpolator is a pure
  render-side read of snapshots.

## Downstream dependencies

046 (pause) freezes interpolation; entity replication (229) and player movement (227) consume the
interpolator pattern.
