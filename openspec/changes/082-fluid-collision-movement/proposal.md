# Proposal: 082-fluid-collision-movement

## Problem

The player/entity movement system has no fluid awareness: no immersion, drag, buoyancy, or
eye-fluid state. MC derives these behaviors from fluid data (density); nothing here does.

## Goals

- Deterministic fluid-movement computations derived from fluid data (015 density):
  - drag: `dragFactor(density) = clamp(1.1 - 0.3 * density, 0, 1)` (water 0.8, lava 0.5);
  - buoyancy: `buoyancyAcceleration(fluidDensity, entityDensity, gravity)` (neutral at equal
    densities, upward when the fluid is denser);
  - immersion: eye-fluid state, fluid height in a column, submerged fraction of an AABB, and
    full-submersion predicate.

## Non-goals

- Player physics integration (the movement system wires these in a later change).
- Swimming control inputs, jump-out-of-water rules.
- Fluid rendering effects (fog, vision tint).

## Preconditions

- Change 081 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 081 baseline (916 unit / 19 e2e).

## Dependencies

- 056 `Aabb`; 076 `FluidState`; 015 fluid `density` data (via a caller-supplied lookup).

## Proposed change

- `src/simulation/FluidMovement.ts` (NEW): `FluidMovementWorld`, `FluidImmersion`,
  `fluidDragFactor(density)`, `applyFluidDrag(velocity, density, tickDelta)`,
  `buoyancyAcceleration(fluidDensity, entityDensity, gravity)`, `eyeFluid(world, x, y, z)`,
  `fluidHeightAt(world, x, z, minY, maxY)`, `submergedFraction(world, aabb)`,
  `isFullySubmerged(world, aabb)`.
- `tests/unit/FluidMovement.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Height scanning bounds: `fluidHeightAt` scans a caller-provided y-window; the wiring must pass
  the entity's relevant range (documented).
- Drag/buoyancy formulas are this project's documented derivation from MC-like constants; they are
  pure and tunable by the wiring.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Drag/buoyancy formulas match the documented derivations on hand-computed cases (water/lava
  factors, neutral/upward buoyancy, clamping, compounding over tick deltas).
- Immersion: eye-fluid returns the fluid id at a point (null in air); fluid height is the topmost
  fluid cell in the window (falling water counts); submerged fraction clamps to [0, 1]; full
  submersion predicate.
- Deterministic; full gate green.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 082 suite; E2E stays 19/19.
