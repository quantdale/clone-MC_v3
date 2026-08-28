# Proposal: 081-waterlogging-state

## Problem

076-080 model fluids in cells, but MC also lets water coexist with non-full blocks (slabs,
stairs, fences): a waterlogged cell holds both a block and water. No such state or coexistence
semantics exist.

## Goals

- A validated `WaterloggedCell` value: `{ blockId, waterLevel }` where the water level is a
  source (0) or falling (8-15) — flowing levels 1-7 never coexist with a block (MC semantics).
- Deterministic coexistence helpers: level conversion between fluid levels and waterlogged
  levels, waterlog/unwaterlog transitions, and a waterloggable-block predicate.

## Non-goals

- Flow behavior through waterlogged cells (the wiring layers it on 078/079).
- Block-state registry integration (block waterloggability is a caller-supplied set).
- Rendering of waterlogged surfaces.

## Preconditions

- Change 080 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 080 baseline (905 unit / 19 e2e).

## Dependencies

- 076 `FluidLevel`/`FluidState` (levels 0 source, 1-7 flowing, 8-15 falling).

## Proposed change

- `src/world/Waterlogging.ts` (NEW): `WaterloggedCell`, `validateWaterloggingLevel`,
  `waterlog(blockId, level)`, `waterloggingLevelFromFluid(fluidLevel)`,
  `fluidLevelFromWaterlogging(waterLevel)`, `withWaterLevel(cell, level | null)`,
  `isWaterloggable(blockId, waterloggableIds)`.
- `tests/unit/Waterlogging.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Flowing levels (1-7) in waterlogged cells are rejected by design (MC waterlogged water is a
  source); the conversion rule (flowing water entering a waterloggable cell waterlogs at level 0)
  is explicit and tested.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- `validateWaterloggingLevel` accepts exactly 0 and 8-15; everything else throws descriptively.
- `waterlog` validates block id and level; `withWaterLevel` returns a new cell or null.
- Level conversions: fluid 0/1-7 → 0; fluid 8-15 → unchanged; waterlogged 0 → fluid 0;
  waterlogged 8-15 → unchanged.
- `isWaterloggable` is pure set membership.
- Full gate green; 081 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 081 suite; E2E stays 19/19.
