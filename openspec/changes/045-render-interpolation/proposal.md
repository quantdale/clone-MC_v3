# Proposal: 045-render-interpolation

## Problem

044 provides a fixed 20 TPS simulation clock, but rendered state (player position/rotation, moving
entities, etc.) still snaps to simulation ticks. At 60+ FPS that causes visible stutter, while at low
FPS the renderer should never run ahead of the simulation.

## Goals

- Provide a `RenderInterpolator` that linearly interpolates numeric state vectors (e.g. `[x, y, z]`)
  between the previous and current simulation states.
- Derive the interpolation factor from the 044 clock's accumulator (`alpha = accumulatorMs / TICK_MS`),
  clamped to `[0, 1]` — rendering never extrapolates past the latest simulated tick (bounded catch-up).
- Keep simulation truth untouched: the interpolator only *reads* simulation state snapshots.

## Non-goals

- Changing simulation systems or the clock (044 stays authoritative).
- Slerp/quaternion rotation interpolation or physics-aware interpolation (later changes).
- Wiring into `Renderer`/`Game` (a later consumer change; 045 is the primitive + tests).

## Preconditions

- Change 044 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 044 baseline (598 unit / 19 e2e).

## Dependencies

- 044 `SimulationClock` (`TICK_MS`, `accumulatorMs`) for the alpha derivation.

## Proposed change

- `src/engine/RenderInterpolator.ts` (NEW): `RenderInterpolator` (`setState(state)`, `interpolate(alpha)`,
  `hasState`, `reset`) plus `alphaFromAccumulator(accumulatorMs)`.
- `tests/unit/RenderInterpolator.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet. Interpolation is read-only over simulation snapshots.

## Risks

- Interpolating across teleports (large jumps) would smear the render; callers reset on teleport
  (`reset()` then `setState`). Documented.
- Alpha drift from float accumulation is bounded to one tick by clamping.

## Rollback strategy

Revert the commit; the interpolator is additive.

## Definition of Done

- `setState` stores previous/current snapshots; `interpolate(alpha)` returns per-component linear
  interpolation.
- `alphaFromAccumulator` returns `accumulatorMs / TICK_MS` clamped to `[0, 1]`.
- First state (no previous) renders as the current state; `reset()` clears history.
- Unit tests cover endpoints, midpoints, multi-component vectors, clamping, and reset.
- Full gate green; 045 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 045 suite; E2E stays 19/19.
