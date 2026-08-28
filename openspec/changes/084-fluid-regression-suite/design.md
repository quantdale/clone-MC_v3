# Design: 084-fluid-regression-suite

## Context / current state

076-083 unit suites pass individually; no integration fixture drives the stack together through
the 077 dispatcher wiring.

## Target state

`tests/unit/FluidRegression.test.ts` owns a fixture world and a deterministic wiring, and asserts
exact outcomes for flow, boundaries, unload/reload, and bounded work.

## Invariants

- The wiring is deterministic: fixed neighbor orders, 077 scheduling at `WATER_FLOW_INTERVAL`,
  interaction checks after each water step in fixed order.
- Fixtures assert exact final states and exact/bounded tick counts (no wall-clock timing).
- Waterlogged cells (081) act as water sources for flow reads and are never decayed (level 0).
- Unload/reload round-trips the 047 queue mid-flow; both paths must converge to the same state.

## Test-local model

- `RegressionWorld implements WaterWorldAccess, FluidInteractionWorld, FluidSurfaceWorld`:
  - fluids map + solids set + waterlogged map; configurable bounds;
  - `setFluidState` on a waterloggable-block cell stores a waterlogged record
    (`waterloggingLevelFromFluid`);
  - `getFluidState` surfaces waterlogged water as level 0 (source-like);
  - `isReplaceable`: air, water, and waterloggable-block cells are replaceable; solids are not;
    out-of-bounds cells are not replaceable.
- `makeWiring(world, queue, ids, opts)`: 077 handler = `stepWaterCell` → lava-contact checks
  (fixed 6-neighbor order) via `applyFluidContact` → re-schedule `affected` at
  `WATER_FLOW_INTERVAL`.

## Control / data flow

1. Fixtures seed fluids/solids, create a dispatcher with the wiring handler, and tick a scripted
   number of times.
2. Assertions compare final worlds (snapshots) and dispatch reports (processed counts).

## Fixture matrix

1. **Corridor fill**: source at the mouth of a 7-cell corridor → levels 1..7, edge empty, exactly
   7 ticks to steady state.
2. **Waterfall pool**: elevated source → falling column, base converts to 6, pool spreads 7s;
   exact final state within a bounded tick count.
3. **Source pool**: two sources with a gap → gap fills and becomes a source.
4. **Decay**: corridor pool with the source removed → dries to empty within a bounded tick count.
5. **Boundaries**: world-edge source → no out-of-bounds writes; L-shaped wall keeps water in a
   pocket.
6. **Unload/reload**: corridor mid-flow → `queue.serialize()` → new queue `deserialize` →
   continue → final state equals the no-roundtrip run.
7. **Bounded work**: 64×64 pool with `maxPerTick` 50 → steady state within a documented tick
   bound; two runs identical; total processed steps reported and bounded.

## Failure modes

- Any production regression in 076-083 or 047 surfaces as an exact-state assertion failure with a
  named fixture.

## Performance / resource constraints

The largest fixture is 64×64 cells × ≤ ~70 ticks — well under a second.

## Testing seams

The suite itself; no production seams.

## Affected files / symbols

- `tests/unit/FluidRegression.test.ts` — NEW (test-only).

## Rejected alternatives

- *Wall-clock performance assertions*: flaky; deterministic work-count/tick-count bounds instead.
- *Production wiring module*: the real world wiring belongs to a later change; the suite encodes
  the pattern and will become its regression oracle.

## Downstream dependencies

The future world wiring replaces the test wiring; the fixtures stay as its regression suite.
