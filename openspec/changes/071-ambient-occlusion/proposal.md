# Proposal: 071-ambient-occlusion

## Problem

Generated quads carry per-vertex light (070) but no local occlusion: corners of blocks next to other
blocks look the same as corners in open air. Minecraft's smooth lighting darkens vertices whose
neighboring blocks crowd the corner (vertex AO), giving surfaces depth.

## Goals

- `OpaqueFaceQuad` carries a per-vertex AO level (0-3, Minecraft scale) in the same corner order as
  070 light.
- Deterministic AO sampling: the classic 3-cell rule (two in-plane side cells + the diagonal corner
  cell in the outward layer) with the Minecraft 0-3 table; out-of-section cells are treated as
  non-occluding.
- Both meshers and the worker pipeline emit quads with AO; no new worker payload data (AO derives
  from the existing `cells`/`opaqueIds`).

## Non-goals

- Combining AO with light into a final shade (a renderer concern).
- Changing the 070 light sampling rule.
- Per-corner AO for translucent/emissive rendering (a later concern).

## Preconditions

- Change 070 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 070 baseline (792 unit / 19 e2e).

## Dependencies

- 070 `OpaqueFaceQuad.vertexLights`, `LightSampler`, `FaceLightContext` (the AO module reuses the
  same outward-layer and corner math); 062/063 quad producers; 065 worker pipeline.

## Proposed change

- `src/rendering/GreedyMesher.ts`: add `AOLevel` (0 | 1 | 2 | 3) and required `vertexAO`
  (4-tuple, same corner order as `vertexLights`) on `OpaqueFaceQuad`.
- `src/rendering/AmbientOcclusion.ts` (NEW): `sampleCornerAO(light, ctx, u, v)`,
  `quadVertexAO(light, ctx, minU, minV, width, height)` — Minecraft 0-3 table over the 3-cell
  neighborhood (side1, side2, corner) in the outward layer; fractional corners snap to
  `floor()`; out-of-section cells do not occlude.
- `src/rendering/GreedyMesher.ts` / `TemplateMesher.ts`: emit `vertexAO` alongside `vertexLights`
  using the existing per-quad `FaceLightContext`.
- Worker: `processMeshSectionRequest` emits AO automatically (no payload change).
- `tests/unit/AmbientOcclusion.test.ts` (NEW); 062/063/065 test call sites updated.

## Compatibility and migration

`OpaqueFaceQuad` gains a required field; all producers in the repo are updated in this change.
No worker payload or stored-data changes.

## Risks

- Fractional (partial-block) corners have no exact Minecraft analog; the spec defines the
  deterministic `floor()`-snapped rule.
- Out-of-section cells cannot be checked against real neighbor sections; treating them as
  non-occluding avoids dark seams at section borders and mirrors 070's out-of-bounds decision.
  A future wiring may supply neighbor-section opacity through the caller-supplied sampler.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Every quad from `greedyMergeOpaqueFaces`, `enumerateOpaqueFacesNaive`, `meshBlockModel`, and
  `processMeshSectionRequest` carries `vertexAO` (4 entries, values in {0,1,2,3}, 070 corner order).
- AO matches the Minecraft 0-3 table on hand-computed fixtures (0/1/2/3 cases, one-side+corner,
  side-only, corner-only, none); out-of-section cells never occlude; deterministic.
- 070 behavior unchanged (existing tests still pass).
- Full gate green; 071 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 071 suite; E2E stays 19/19.
