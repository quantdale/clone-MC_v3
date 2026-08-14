# Proposal: 044-fixed-20tps-clock

## Problem

Simulation currently advances with the render loop, so game logic speed depends on frame rate. A
deterministic simulation needs a canonical fixed-timestep clock: exactly 20 ticks per second,
decoupled from render FPS, with bounded catch-up after stalls so a long frame cannot cause a
"spiral of death".

## Goals

- Provide a `SimulationClock` (20 TPS / 50 ms per tick) driven by wall-clock timestamps from the
  render loop.
- Accumulate fractional frames and emit whole ticks only; the number of ticks per frame is a pure
  function of elapsed time.
- Bound catch-up: at most `maxTicksPerFrame` ticks per `update`, and cap the accumulator after a
  stall so the simulation cannot fall arbitrarily far behind.
- Track deterministic counters: total ticks, total simulated milliseconds, and remaining accumulator.
- Be pure and fully unit-testable with scripted timestamps (no timers, no `Date.now` dependence at
  construction).

## Non-goals

- Driving the actual simulation systems (a consumer change; 044 is the clock primitive + tests).
- Pause semantics (046) or render interpolation (045) — separate changes.
- Modifying `GameLoop` (the render loop) or `Game`; wiring is a later consumer change.

## Preconditions

- Change 043 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 043 baseline (592 unit / 19 e2e).

## Dependencies

- None beyond the standard library.

## Proposed change

- `src/engine/SimulationClock.ts` (NEW): `TICK_RATE = 20`, `TICK_MS = 50`,
  `SimulationClock({ maxTicksPerFrame?, now? })` with `update(nowMs)`, `totalTicks`, `totalMs`,
  `accumulatorMs`, `isRunning`, and `reset()`.
- `tests/unit/SimulationClock.test.ts` (NEW).

## Compatibility and migration

No existing behavior changes; the clock is additive and unused by the game until a later change wires
it.

## Risks

- Floating-point accumulation drift over very long sessions; mitigated by integer-ish tick accounting
  (accumulator in ms, subtracted in fixed 50 ms steps).
- Clock jumping backward (`nowMs < lastTime`): the delta is clamped to 0.

## Rollback strategy

Revert the commit; the clock is additive and has no consumers yet.

## Definition of Done

- `update(nowMs)` returns the exact number of whole 50 ms ticks due, with the remainder accumulated.
- Irregular frame timings produce the same total ticks as regular ones for equal elapsed time.
- A stall (`nowMs` far ahead) yields at most `maxTicksPerFrame` ticks and caps the accumulator.
- `reset()` restores the initial state; the first `update` after construction/reset never emits a
  catch-up burst.
- Unit tests cover exactness, frame-rate independence, bounded catch-up, backward time, and reset.
- Full gate green; 044 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 044 suite; E2E stays 19/19.
