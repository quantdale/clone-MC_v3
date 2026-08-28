# Proposal: 074-translucent-surface-rendering

## Problem

Quads (062/063) carry geometry, light (070) and AO (071), but nothing separates translucent
geometry from solid geometry or defines how translucent quads are ordered. Naive draw order produces
blending artifacts (water, stained glass). MC renders translucent surfaces after solid ones,
sorted back-to-front.

## Goals

- Partition a quad batch into solid and translucent sets via a caller-supplied blockId → render
  layer resolver (061 `RenderLayer` vocabulary).
- Deterministic translucent ordering policy: back-to-front (far-first) by quad centroid distance
  from the camera, ties resolved by stable input order — pure, deterministic, input-preserving.

## Non-goals

- Three.js/scene wiring (a later renderer change consumes this module).
- Cutout/emissive pass policies (their layers exist in 061; only `translucent` is this change's
  scope).
- Frustum culling, per-chunk regions, or camera-move incremental updates.

## Preconditions

- Change 073 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 073 baseline (826 unit / 19 e2e).

## Dependencies

- 061 `RenderLayer`; 062 `OpaqueFaceQuad`; 070 `inPlaneAxes` (centroid math).

## Proposed change

- `src/rendering/TranslucentGeometry.ts` (NEW):
  - `QuadLayerResolver = (blockId: number) => RenderLayer`.
  - `partitionQuadsByLayer(quads, layerOf): { opaque: OpaqueFaceQuad[]; translucent: OpaqueFaceQuad[] }`
    (order-preserving; translucent = layer `'translucent'`; everything else is `opaque`).
  - `quadCentroid(quad): [x, y, z]` (face-plane aware).
  - `sortTranslucentBackToFront(quads, cx, cy, cz): OpaqueFaceQuad[]` — descending centroid
    distance-squared, ties by input index; returns a new array (input untouched).
- `tests/unit/TranslucentGeometry.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module or payload changes (the layer resolver keeps 062/070/071 untouched).

## Risks

- Centroid distance is an approximation of painter's-order depth; adequate for per-quad sorting and
  deterministic. View-space depth is a later refinement.
- The resolver bridges runtime block ids to 061 layer keys; the caller owns that mapping.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Partition separates `'translucent'` quads from all others, preserving input order in both
  buckets; empty input → empty buckets.
- Sorting is far-first, tie-stable (input order), deterministic for identical (quads, camera), and
  never mutates its input.
- Centroid math is correct per face plane (up/down, north/south, east/west extents).
- Full gate green; 074 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 074 suite; E2E stays 19/19.
