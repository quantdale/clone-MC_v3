# Proposal: 058-shape-aware-raycast

## Problem

Selection and interactions (breaking/placing, entity aiming) currently raycast against full cubes
(`raycastVoxel` in `src/math/DDA.ts`). With 056 shapes available, the crosshair should align with a
slab's or stair's *selection* volume — clicking through the air half of a slab cell must not select
it, and the highlighted face must be the shape's actual face.

## Goals

- Provide a shape-aware `raycastSelection`: DDA cell traversal (mirroring the proven `raycastVoxel`)
  that tests the ray against each visited cell's selection `VoxelShape` boxes (slab method), returning
  the nearest hit with its cell, entry face normal, exact hit point, and distance.
- Empty/EMPTY-shape cells never hit; non-empty cells hit only where the ray crosses an actual box.

## Non-goals

- Replacing `raycastVoxel` (collision-adjacent code still uses it; 058 is the selection/interaction
  raycast primitive).
- Wiring into `PlayerInteraction` (a later consumer change).

## Preconditions

- Change 057 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 057 baseline (688 unit / 19 e2e).

## Dependencies

- 056 `VoxelShape` (`Aabb`, `boxes`, `isEmpty`).

## Proposed change

- `src/world/ShapeRaycast.ts` (NEW): `SelectionShapeWorld`, `ShapeRayHit` (cell, normal, point,
  distance), `raycastSelection(...)`.
- `tests/unit/ShapeRaycast.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- Degenerate rays (zero length) and non-finite inputs must return `null` (mirroring DDA guards).
- Box faces parallel to the ray must not produce spurious hits (slab method handles zero-direction
  axes).

## Rollback strategy

Revert the commit; the raycast is additive.

## Definition of Done

- `raycastSelection` returns the nearest box hit across visited cells with exact distance, entry-face
  normal (DDA convention: pointing toward the ray origin), and hit point.
- Shape-aware: a ray through the air part of a slab cell (above y = 0.5) does not hit; a ray at slab
  height hits the slab's side face.
- Full-cube cells behave like `raycastVoxel` (near face, correct distance/normal).
- `maxDistance` bounds the search; misses return `null`; zero-length and non-finite inputs return
  `null`.
- Unit tests cover full-cube hits, slab pass-through and slab hits, nearest-cell selection, face
  normals, maxDistance, and degenerate inputs.
- Full gate green; 058 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 058 suite; E2E stays 19/19.
