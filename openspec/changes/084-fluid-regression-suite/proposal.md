# Proposal: 084-fluid-regression-suite

## Problem

076-083 are individually tested, but no integration fixtures exercise the fluid stack together:
flow across many cells, boundaries, unload/reload continuity, and bounded work. Regressions in the
wiring patterns (077 dispatcher + 078/079 engines + 080 interactions + 081 waterlogging) would go
unnoticed.

## Goals

- A deterministic integration regression suite over the fluid stack:
  - flow fixtures (corridor fill, waterfall pool, source-pool formation, decay after removal);
  - boundary fixtures (world edges, block walls);
  - unload/reload continuity (047 queue serialization round-trip mid-flow);
  - performance/determinism fixtures (large pool, bounded per-tick updates, exact steady-state
    tick counts, no wall-clock assertions).

## Non-goals

- New production code (the suite is tests + a test-local fixture world; any production fix it
  uncovers is a follow-up commit).
- Real-time benchmarks (deterministic work-count assertions instead).

## Preconditions

- Change 083 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 083 baseline (945 unit / 19 e2e).

## Dependencies

- 076 `FluidState`; 077 `FluidTickDispatcher`; 078 `WaterFlowEngine`; 080 `FluidInteraction`;
  081 `Waterlogging`; 047 `ScheduledTickQueue` (serialize/deserialize).

## Proposed change

- `tests/unit/FluidRegression.test.ts` (NEW): shared in-memory fixture world + deterministic
  wiring (dispatcher handler = water step + lava-contact check + waterlogging interception +
  re-schedule) and the fixture matrix above.

## Compatibility and migration

Test-only; no production changes.

## Risks

- Integration tests encode the wiring pattern that a future world-wiring change will formalize;
  the suite doubles as the wiring's regression oracle.

## Rollback strategy

Revert the commit (test-only).

## Definition of Done

- Corridor fill: exact steady-state tick count and levels (1..7, edge empty).
- Waterfall: falling column, base conversion, pool spread — exact final state.
- Source pool: two sources fill the gap and form a source.
- Decay: removing the source dries the pool to empty within a bounded tick count.
- Boundaries: edges and walls contain flow (no out-of-bounds writes).
- Unload/reload: a 047 serialize/deserialize round-trip mid-flow produces the same final state as
  no round-trip.
- Performance: a 64×64 pool reaches steady state within a documented tick bound with a small
  per-tick budget; two runs produce identical states; total processed steps are bounded and
  reported.
- Full gate green; 084 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 084 suite; E2E stays 19/19.
