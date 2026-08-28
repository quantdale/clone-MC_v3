# Proposal: 057-shape-aware-player-collision

## Problem

Player movement treats every block as a full cube. With 056 shapes available (slabs, stairs, panes),
collision must resolve against the block's actual collision shape — an entity should land on a slab's
top face (y = 0.5), not the full cube's.

## Goals

- Provide a `CollisionResolver` that moves an axis-aligned entity box through a `ShapeWorld`
  (cell → `VoxelShape`), resolving movement axis-separated (X, then Y, then Z) with face snapping.
- Report per-axis collision flags so the caller (physics) can stop movement on the touched axes.
- Be shape-aware: resolution uses each block's collision shape boxes, not full-cube assumptions.
- Deterministic and headless-testable with fixture shape worlds.

## Non-goals

- Player physics integration (the game's `PlayerPhysics` adopts the resolver later; 057 is the
  primitive + tests).
- Entities other than axis-aligned boxes (130 handles general entity physics).
- Ray casting (058) and selection — separate changes.

## Preconditions

- Change 056 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 056 baseline (681 unit / 19 e2e).

## Dependencies

- 056 `VoxelShape` (`Aabb`, `intersects`, `boxes`).

## Proposed change

- `src/world/CollisionResolver.ts` (NEW): `ShapeWorld`, `CollisionBox` (x, y, z, width, height, depth),
  `MovementResult` (final position + per-axis flags), `CollisionResolver` (`move(world, box, dx, dy,
  dz)`, `collides(world, box)`).
- `tests/unit/CollisionResolver.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- Epsilon handling at face boundaries must avoid both tunneling and sticky snap-back; a small
  tolerance (`epsilon`, default 0.001) is applied consistently.

## Rollback strategy

Revert the commit; the resolver is additive.

## Definition of Done

- `move` resolves X, then Y, then Z independently: hitting a wall stops that axis and sets its flag;
  other axes keep moving.
- Shape-awareness: on a half-slab block, an entity stops at y = 0.5 (the shape top), not y = 1.
- `collides` reports overlap with any shape box in the touched cells.
- Empty-space movement is unrestricted; falling onto a floor stops at the floor top.
- Unit tests cover wall stops, floor landing, slab tops, axis separation, and empty space.
- Full gate green; 057 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 057 suite; E2E stays 19/19.
