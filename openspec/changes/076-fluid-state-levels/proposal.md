# Proposal: 076-fluid-state-levels

## Problem

015 defines fluid *types* (water/lava, source/flowing variants) but no per-cell fluid *state*: the
Minecraft level model (source, flowing with surface height, falling) does not exist, so fluid
simulation (077) has nothing to operate on.

## Goals

- A validated `FluidState` value: `{ fluidId, level }` with the MC level convention — 0 = source,
  1-7 = flowing (surface height `(8 - level) / 8`), 8-15 = falling (`fallingHeight = level - 8`,
  full-height render).
- Pure, deterministic helpers: `isFluidSource`, `isFluidFalling`, `fluidSurfaceHeight`,
  `fluidFallingHeight`, strict `validateFluidLevel`.

## Non-goals

- Flow/tick simulation (077-fluid-tick-dispatch).
- Block-state integration or serialization (later wiring).
- Rendering of fluid surfaces (a later change).

## Preconditions

- Change 075 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 075 baseline (851 unit / 19 e2e).

## Dependencies

- 015 `FluidTypeDefinition` (the state references a fluid by runtime id; the level model is
  orthogonal).

## Proposed change

- `src/world/FluidState.ts` (NEW): `FluidLevel` (0-15), `FluidState { fluidId: number; level:
  FluidLevel }`, level constants, `validateFluidLevel(input)`, `createFluidState(fluidId, level)`,
  `isFluidSource(state)`, `isFluidFalling(state)`, `fluidSurfaceHeight(state)`,
  `fluidFallingHeight(state)`.
- `tests/unit/FluidState.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- The falling-level range (8-15) is this project's explicit, documented convention (vanilla water
  uses 0-8 in practice; the model is self-consistent either way).

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- `validateFluidLevel` accepts exactly integers in [0, 15] and rejects everything else with a
  descriptive error.
- `createFluidState` validates level and fluidId (non-negative integer).
- Helpers match the convention on hand-computed cases: source 0 only; falling exactly 8-15;
  surface height 1 / `(8-level)/8` / 1; falling height `level - 8` (0 below 8).
- Pure and deterministic.
- Full gate green; 076 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 076 suite; E2E stays 19/19.
