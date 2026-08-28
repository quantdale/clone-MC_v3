# Proposal: 055-simulation-test-harness

## Problem

The fixed-tick primitives (044-054) are individually testable, but *integration* behavior — systems
ticking together in order, replaying identically from a checkpoint, and stepping until a condition —
has no headless harness. Future simulation changes (fluids, redstone, mobs) need a deterministic
tick-stepping test bed.

## Goals

- Provide a `SimulationHarness` that steps a set of `HarnessSystem`s in deterministic order on a fixed
  tick counter (tick 1, 2, 3, ...).
- Deterministic replay hooks: `snapshot()` captures the tick counter and each system's serializable
  state; `restore(snapshot)` resumes; stepping from equal snapshots produces identical results.
- `stepUntil(predicate, maxSteps)` bounds condition-driven stepping.
- `reset()` restores the initial state; `run(fn)` offers a scoped deterministic session.

## Non-goals

- Driving real browser/game systems (the harness is for headless simulation tests).
- Time/clock semantics (044 owns the clock; the harness owns an integer tick counter).
- Recording/replay of *input* streams (241 is the replay suite; 055 provides the harness hooks).

## Preconditions

- Change 054 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 054 baseline (667 unit / 19 e2e).

## Dependencies

- None beyond the standard library.

## Proposed change

- `src/simulation/SimulationHarness.ts` (NEW): `TickableSystem`, `HarnessSystem` (adds `snapshot`/
  `restore`), `HarnessSnapshot`, `SimulationHarness` (`step`/`stepUntil`/`tick`/`snapshot`/`restore`/
  `reset`/`run`).
- `tests/unit/SimulationHarness.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- Systems must snapshot/restore their *own* state faithfully; the harness copies references, so
  systems must return fresh objects from `snapshot()` (documented contract).

## Rollback strategy

Revert the commit; the harness is additive.

## Definition of Done

- `step(n)` advances the tick counter by exactly `n` and ticks systems in registration order with the
  correct tick numbers.
- `snapshot`/`restore` round-trip: restore-then-step equals fresh-run results (deterministic replay).
- `stepUntil` stops exactly when the predicate passes (or at `maxSteps`) and reports steps taken.
- `reset` restores the initial tick and system states; `run(fn)` provides a scoped session.
- Unit tests cover order, counts, replay determinism, stepUntil bounds, and reset.
- Full gate green; 055 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 055 suite; E2E stays 19/19.
