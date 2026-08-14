# Proposal: 083-fluid-surface-meshing

## Problem

Fluids exist (076-082) but have no geometry: no level-aware surface quads and no side faces with
correct heights. The renderer cannot draw water.

## Goals

- `meshFluidSurface` generates deterministic quads for one fluid cell: a top face at the 076
  surface height when the cell above is not the same fluid, and side faces against air/blocks/
  different fluids (full depth) or against lower same-fluid surfaces (step height).
- Quads reuse the 062 `OpaqueFaceQuad` shape with 070 light and 071 AO attached; fixed emission
  order (up, then sides `-x, +x, -z, +z`).

## Non-goals

- Down/underwater faces (a later refinement; documented).
- Texture/UV mapping and atlas wiring (a renderer concern).
- Waterlogged-cell surfaces (081 coexistence handled by the wiring).

## Preconditions

- Change 082 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 082 baseline (935 unit / 19 e2e).

## Dependencies

- 076 `fluidSurfaceHeight`; 062 `OpaqueFaceQuad`; 070/071 light/AO sampling; 074 translucent
  handling (water quads partition as translucent via the wiring's layer resolver).

## Proposed change

- `src/rendering/FluidSurfaceMesher.ts` (NEW): `FluidSurfaceWorld`,
  `meshFluidSurface(world, fluidId, light, x, y, z)`, `meshFluidSurfaces(world, fluidId, light,
  positions)`.
- `tests/unit/FluidSurfaceMesher.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Side-face step heights between adjacent same-fluid cells of different levels must match the
  surface-height function exactly (single source: 076).

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Top face emitted only when the cell above is not the same fluid; plane at
  `y + fluidSurfaceHeight(level)`.
- Sides: air/block/different-fluid neighbors → quad spanning `[y, y + surface]`; same-fluid
  neighbor with a lower surface → quad spanning `[neighborTop, ownTop]`; same-fluid with
  equal/higher surface → no side; zero-height sides never emitted.
- No fluid (or different fluid) at the cell → no quads.
- Quads carry 070/071 corner data; emission order fixed; determinism.
- Full gate green.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 083 suite; E2E stays 19/19.
