# Proposal: 079-lava-flow-simulation

## Problem

078 gives deterministic water flow. Lava needs the same engine shape with different parameters:
slower cadence and a dimension-dependent horizontal spread range (MC: 3 blocks in the Overworld,
7 in the Nether).

## Goals

- `stepLavaCell(world, lavaFluidId, x, y, z, spreadRange)`: the 078 rule set parameterized by an
  explicit, validated spread range — downward propagation, ground conversion to flowing
  `spreadRange`, capped horizontal spread, source formation, and the decay ladder.
- `LAVA_FLOW_INTERVAL = 30` (MC-like slower cadence) for the 077 wiring.

## Non-goals

- Water/lava interactions (080), waterlogging (081).
- Dimension lookup plumbing (the caller passes the range: 3 overworld / 7 nether).
- Random tick order (deterministic engine, like 078).

## Preconditions

- Change 078 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 078 baseline (886 unit / 19 e2e).

## Dependencies

- 078 `WaterWorldAccess`/`WaterStepResult` types (reused); 076 fluid levels.

## Proposed change

- `src/simulation/LavaFlowEngine.ts` (NEW): `LAVA_FLOW_INTERVAL = 30`,
  `stepLavaCell(world, lavaFluidId, x, y, z, spreadRange)` (validated positive-integer range;
  reuses 078 world/result types).
- `tests/unit/LavaFlowEngine.test.ts` (NEW).

## Compatibility and migration

Additive; 078 untouched (the lava engine reuses its types, not its internals).

## Risks

- Rule drift between the water and lava engines; mitigated by identical rule order and the 084
  regression suite later consolidating fixtures.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Lava steps follow the corrected 078 rule order with `spreadRange` as the level cap: spread
  proposal `L+1` for levels below `spreadRange` (range-level cells never spread), ground conversion
  to flowing `spreadRange - 1`, decay removal at `spreadRange`.
- Range 3 (overworld) spreads ≤ 3 blocks; range 7 (nether) spreads ≤ 7.
- Invalid ranges (non-positive/non-integer) throw at call time.
- Water cells are no-ops for the lava step (and vice versa).
- Deterministic; full gate green.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 079 suite; E2E stays 19/19.
