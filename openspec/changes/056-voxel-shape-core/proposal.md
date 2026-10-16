# Proposal: 056-voxel-shape-core

## Problem

Collision, selection, and occlusion currently assume full cubes. Slabs, stairs, panes, and doors need
per-block collision/selection volumes, but no shape primitive exists.

## Goals

- Provide an immutable `VoxelShape`: an ordered list of axis-aligned boxes within a block's unit cube
  `[0, 1]³`.
- Composition: `union(other)` returns a new shape (originals untouched); `FULL_CUBE`/`EMPTY`
  constants.
- Queries for collision/selection/occlusion: `intersects(aabb)`, `contains(x, y, z)`, `maxY()`,
  `isEmpty`, `boxes`.

## Non-goals

- Shape *definitions* per block (059 block-model data / later content define them).
- Ray casting (058) and player collision (057) — separate changes consuming this primitive.
- Union simplification/merging of overlapping boxes (kept as an ordered list, Minecraft-like).

## Preconditions

- Change 055 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 055 baseline (674 unit / 19 e2e).

## Dependencies

- None beyond the standard library.

## Proposed change

- `src/world/VoxelShape.ts` (NEW): `Aabb`, `VoxelShape` (`of`, `EMPTY`, `FULL_CUBE`, `isEmpty`,
  `boxes`, `union`, `intersects`, `contains`, `maxY`).
- `tests/unit/VoxelShape.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- Malformed boxes (NaN, min > max) must be rejected at construction; immutability prevents later
  corruption.

## Rollback strategy

Revert the commit; the shape is additive.

## Definition of Done

- `of` validates (finite, min ≤ max per axis) and freezes boxes; inputs are copied.
- `union` returns a new shape with the concatenated box list; originals unchanged.
- `intersects` is an axis-aligned overlap test (touching counts as intersecting at the boundary).
- `contains(x, y, z)` is true inside any box (boundary inclusive).
- `maxY()` returns the highest `maxY` across boxes (`0` when empty).
- Unit tests cover constants, validation, union immutability, intersects, contains, and maxY.
- Full gate green; 056 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 056 suite; E2E stays 19/19.
