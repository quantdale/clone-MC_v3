# Proposal: 078-water-flow-simulation

## Problem

076/077 give fluid states and bounded tick dispatch, but no water behavior: water cannot fall,
spread, form sources, or dry out.

## Goals

- A deterministic single-cell water step engine (`stepWaterCell`) with MC-like rules:
  - downward propagation (a column of falling water; falling converts to flowing at ground);
  - horizontal propagation with level+1 falloff (sources spread level 1; falling cells are never
    horizontally overwritten);
  - source rules (sources persist; a flowing cell with ≥ 2 horizontal source neighbors becomes a
    source);
  - decay (unfed flowing water thickens and vanishes at level 7).
- Fixed neighbor order and pure per-cell steps: identical worlds → identical results.

## Non-goals

- Lava rules (079), water/lava interactions (080), waterlogging (081).
- Random tick order (this engine is deterministic by design; 084 fixtures rely on it).
- World wiring/scheduling (the engine returns affected positions; 078 wiring binds it to 077).

## Preconditions

- Change 077 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 077 baseline (868 unit / 19 e2e).

## Dependencies

- 076 `FluidState` (levels 0 source / 1-7 flowing / 8-15 falling); 077 handler contract (the
  engine is the handler's implementation).

## Proposed change

- `src/simulation/WaterFlowEngine.ts` (NEW): `WaterWorldAccess`, `WaterStepResult`, constants
  (`WATER_FLOW_INTERVAL 5`, `MAX_FLOW_LEVEL 7`, `FALLING_LEVEL 8`), `stepWaterCell(world,
  waterFluidId, x, y, z)`.
- `tests/unit/WaterFlowEngine.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- The decay rule must not fight the spread rule (spread adds neighbors, decay thins unfed cells);
  the invariants below pin the order: spread → source formation → decay.
- Falling cells must not be horizontally overwritten or the model's waterfall behavior breaks.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Downward: any water with an empty replaceable cell below spawns falling water (level 8) there;
  falling water converts to flowing level 7 when its below is blocked.
- Horizontal: sources spread level 1; flowing level L spreads L+1 (cap 7) into replaceable
  non-water cells or worse flowing water (1-7 only; falling never overwritten).
- Sources persist; flowing with ≥ 2 horizontal source neighbors becomes a source.
- Decay: flowing L with no water above and no level-<L horizontal neighbor becomes L+1; level 7
  decays to removal.
- `affected` lists exactly the positions the caller must re-schedule; no change → empty list.
- Deterministic (fixed neighbor order `-x, +x, -z, +z`); full gate green.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 078 suite; E2E stays 19/19.
