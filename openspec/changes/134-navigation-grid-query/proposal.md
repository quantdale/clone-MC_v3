# Proposal: 134-navigation-grid-query

## Problem
Nothing in the catalog can answer "can an entity stand at this cell, and how costly is moving
through it?" — the per-cell primitive real Minecraft calls `PathType`/`WalkNodeEvaluator`. The 056
`VoxelShape`/057 `CollisionResolver` answer "is this box colliding," and 076's `FluidState` model
exists, but no module combines block collision + hazard blocks (lava, fire) + fluid (water) into a
walkability classification and a movement cost a future pathfinder (135) can consume.

## Goals
- `classifyNode(world, x, y, z): PathNodeType` — classify one cell as `Open` (clear, no hazard),
  `Water` (swimmable), `DamageFire` (passable but hazardous), `Lava` (impassable hazard), or
  `Blocked` (solid obstruction), from the cell's collision shape and block id.
- `nodeCost(type: PathNodeType): number` — a fixed movement-cost weight per node type (`Open = 0`,
  `Water = 8`, `DamageFire = 16`, `Blocked`/`Lava = Infinity`), matching vanilla's "prefer open
  ground, tolerate water reluctantly, avoid fire, never cross lava" cost ordering.
- `isPassable(type): boolean` — `true` for `Open`/`Water`/`DamageFire`, `false` for `Blocked`/`Lava`.
- `canStandAt(world, x, y, z, height): boolean` — whether an entity `height` cells tall can occupy
  the vertical column at `(x, y..y+height-1, z)`: every occupied cell must be passable, and the
  entity must have support (`(x, y-1, z)` is solid) or be in water at `(x, y, z)` (floats/swims).
- `movementCost(world, x, y, z, height): number` — `Infinity` when `!canStandAt(...)`, otherwise
  `nodeCost(classifyNode(world, x, y, z))` for the feet cell.

## Non-goals
- **No pathfinding.** Search (A*, node graph, open/closed sets) is 135's scope
  (`135-a-star-pathfinding`); 134 delivers only the per-cell query primitives.
- **No entity/mob-specific movement rules** (e.g. flying mobs ignoring gravity, amphibious mobs
  treating water as free). 134 models one generic ground-walker profile; per-mob profiles are a
  later, explicitly scoped change if ever needed.
- **No full vanilla `PathType` parity.** Real Minecraft has ~20 path-node types (trapdoors, rails,
  cauldrons, powder snow, etc.); 134 models the five that matter for a baseline ground walker
  (`Open`/`Water`/`DamageFire`/`Lava`/`Blocked`), documented as a deliberate simplification.
- **No `Game`/`World` wiring.** The `NavigationWorld` access interface is minimal and adapter-free;
  no live consumer wires a concrete `World` into it yet.

## Preconditions
- Change 133 (`entity-data-tracker`) is VERIFIED.
- Change 056 (`voxel-shape-core`) and change 076 (`fluid-state-levels`) are VERIFIED and unchanged.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/world/VoxelShape.ts` (056) — `VoxelShape.isEmpty` for the collision check.
- `src/world/BlockRegistry.ts` — `BlockId.Water`/`BlockId.Lava`/`BlockId.Fire` for hazard/fluid
  classification.

## Proposed change
1. `src/simulation/NavigationGridQuery.ts` (NEW):
   - `NavigationWorld` interface: `getCollisionShape(x, y, z): VoxelShape`, `getBlockId(x, y, z): number`.
   - `const enum PathNodeType { Blocked, Open, Water, DamageFire, Lava }`.
   - `classifyNode`, `nodeCost`, `isPassable`, `canStandAt`, `movementCost` as described in Goals.
2. No other file is edited.

## Compatibility and migration
- One new, additive file with no consumer yet. No schema/save-format change, no registry change, no
  migration.

## Risks
- **Cost constants feeling arbitrary without a real consumer to tune against.** Mitigation: the
  ordering (`Open < Water < DamageFire < Blocked/Lava = Infinity`) is the load-bearing property for
  135's A* (cheaper paths preferred, impassable cells never entered); the exact finite values are
  documented as deliberately vanilla-inspired but simplified, adjustable later without an API change.
- **`canStandAt`'s "solid support OR water" rule being too permissive/restrictive for a future flying
  or amphibious mob.** Mitigation: documented explicitly as modeling one generic ground-walker
  profile (proposal Non-goals); per-mob profiles are future, separately scoped work.

## Rollback strategy
One additive file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- `classifyNode`/`nodeCost`/`isPassable`/`canStandAt`/`movementCost` implemented per design.md/spec.md.
- Unit tests cover: classification of open air, water, fire, lava, and a solid block; the cost
  ordering invariant; `isPassable` for each type; `canStandAt` support/water/obstruction/multi-height
  cases; `movementCost`'s `Infinity` vs finite cases.
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no consumer wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
