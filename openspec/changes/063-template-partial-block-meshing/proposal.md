# Proposal: 063-template-partial-block-meshing

## Problem

062 merges full-cube faces, but slabs, stairs, panes, and doors are *partial* blocks: their geometry
comes from 059 `BlockModel` elements with `from`/`to` boxes and per-face data. Nothing meshes those
models into quads yet.

## Goals

- Provide `meshBlockModel`: convert a 059 `BlockModel` at a world position into `OpaqueFaceQuad`s in
  world units, without full-cube assumptions.
- Face culling against opaque neighbors: a boundary face whose outward neighbor is opaque is skipped.
- Provide `isFullCubeModel` (one element covering `[0,0,0]..[16,16,16]` with all six faces) so callers
  can apply cube-specific optimizations.

## Non-goals

- Greedy merging of template quads (062 handles opaque-cube merging; template quad merging is a later
  refinement).
- Texture atlas/UV emission (vertex emission is a later consumer step).
- Rotated/variant models (a later model-resolution concern).

## Preconditions

- Change 062 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 062 baseline (717 unit / 19 e2e).

## Dependencies

- 059 `BlockModel`/`BlockModelFace`/`ModelFace`.
- 062 `OpaqueFaceQuad` (shared quad shape).

## Proposed change

- `src/rendering/TemplateMesher.ts` (NEW): `meshBlockModel(model, blockId, x, y, z, isOpaqueCell)`,
  `isFullCubeModel(model)`.
- `tests/unit/TemplateMesher.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- Culling must only apply to faces at the block's outer boundary (a stair step's interior underside
  must never be culled by an opaque neighbor).
- Model units (0..16) convert to world units (÷16) exactly; floats are deterministic.

## Rollback strategy

Revert the commit; the mesher is additive.

## Definition of Done

- A full-cube model meshes to six boundary quads in world units (1×1) when isolated; every face is
  culled when its neighbor is opaque.
- A slab model (`[0,0,0]..[16,8,16]`) meshes to five quads (top at y+0.5, bottom, four sides) with
  correct world extents; side faces against opaque neighbors are culled.
- A two-element stair-like model meshes quads from both elements.
- `isFullCubeModel` returns true only for the canonical full cube.
- Unit tests cover these fixtures plus interior-face non-culling.
- Full gate green; 063 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 063 suite; E2E stays 19/19.
