# Design: 134-navigation-grid-query

## Context/current state
- 056 `VoxelShape` (`isEmpty`, `FULL_CUBE`, `EMPTY`) and 057 `CollisionResolver`/`ShapeWorld`
  (`getCollisionShape(x, y, z): VoxelShape`) already model per-cell collision geometry.
- `BlockId.Water = 5`, `BlockId.Lava = 18`, `BlockId.Fire = 36` (`src/world/BlockRegistry.ts`) are the
  three block kinds relevant to walkability beyond plain solidity.
- Nothing combines these into a walkability/cost classification.

## Target state
- `src/simulation/NavigationGridQuery.ts` provides a minimal `NavigationWorld` access interface plus
  pure classification/cost/occupancy functions, decoupled from any concrete `World`/`Game` type.

## Invariants
- `nodeCost` is monotonic in hazard severity: `nodeCost(Open) < nodeCost(Water) <
  nodeCost(DamageFire) < nodeCost(Blocked) === nodeCost(Lava) === Infinity`. This ordering, not the
  exact finite values, is what a future pathfinder (135) depends on.
- `isPassable(type)` is `true` exactly for `Open`/`Water`/`DamageFire`, `false` exactly for
  `Blocked`/`Lava`.
- `classifyNode` is a pure function of the world's collision shape and block id at `(x, y, z)`; it
  never mutates anything and never depends on any other cell.
- `canStandAt(world, x, y, z, height)` requires every one of the `height` vertically-stacked cells
  starting at `(x, y, z)` to be passable, AND either `(x, y - 1, z)` is solid (non-empty collision
  shape) or the cell at `(x, y, z)` itself classifies as `Water`.
- `movementCost` is `Infinity` whenever `canStandAt` is `false`; otherwise it equals
  `nodeCost(classifyNode(world, x, y, z))` (the feet cell's cost — a documented simplification, not a
  per-cell-in-the-body cost sum).

## API and data model
```ts
export const enum PathNodeType {
  Blocked = 0,
  Open = 1,
  Water = 2,
  DamageFire = 3,
  Lava = 4,
}

export interface NavigationWorld {
  getCollisionShape(x: number, y: number, z: number): VoxelShape;
  getBlockId(x: number, y: number, z: number): number;
}

export function classifyNode(world: NavigationWorld, x: number, y: number, z: number): PathNodeType;
export function nodeCost(type: PathNodeType): number;
export function isPassable(type: PathNodeType): boolean;
export function canStandAt(world: NavigationWorld, x: number, y: number, z: number, height: number): boolean;
export function movementCost(world: NavigationWorld, x: number, y: number, z: number, height: number): number;
```
Cost constants: `Open = 0`, `Water = 8`, `DamageFire = 16`, `Blocked = Infinity`, `Lava = Infinity`
(vanilla-inspired: Minecraft's node evaluator strongly penalizes water and fire relative to open
ground and treats lava as impassable for a generic ground walker).

## Control/data flow
1. `classifyNode(world, x, y, z)`:
   a. `!world.getCollisionShape(x, y, z).isEmpty` → `Blocked` (solid obstruction takes priority over
      any block-id-based classification — a solid block can't simultaneously be "water" for
      occupancy purposes in this model).
   b. Else `world.getBlockId(x, y, z)`: `Lava` → `Lava`; `Fire` → `DamageFire`; `Water` → `Water`;
      anything else → `Open`.
2. `canStandAt(world, x, y, z, height)`:
   a. For `dy` in `[0, height)`: `classifyNode(world, x, y + dy, z)` must be passable
      (`isPassable`); if any is not, return `false`.
   b. Support check: `!world.getCollisionShape(x, y - 1, z).isEmpty` (solid ground below) OR
      `classifyNode(world, x, y, z) === Water` (floating/swimming needs no ground). If neither,
      return `false`.
   c. Otherwise `true`.
3. `movementCost(world, x, y, z, height)`: `!canStandAt(...) ? Infinity : nodeCost(classifyNode(world, x, y, z))`.

## Detailed behavior
- A solid block's cell (e.g. stone) always classifies `Blocked` regardless of what block id it
  happens to carry — the collision-shape check runs first and short-circuits the block-id switch,
  so there is no path where a solid block is misclassified as a hazard/fluid type.
- Height is inclusive of the feet cell: `height = 2` (typical humanoid) checks `(x, y, z)` and
  `(x, y + 1, z)`.
- `canStandAt`'s "solid ground OR water" support rule intentionally does not check for open air
  above water when the entity is swimming — a documented simplification for 134's generic
  ground-walker scope (see proposal Non-goals); more nuanced floating/amphibious rules are future
  work.

## Failure modes
- None of these functions throw for any finite integer coordinate; a `NavigationWorld`
  implementation that itself throws (e.g. an out-of-bounds access) propagates unmodified — this
  module adds no additional error handling beyond what its `NavigationWorld` implementation
  provides.
- `height <= 0` in `canStandAt`/`movementCost`: the `dy` loop runs zero iterations, so the passable
  check trivially passes; the support check still applies. This is a degenerate input (no real caller
  would request zero height) and is documented rather than special-cased.

## Compatibility/migration
- One new, additive file; no edits to `VoxelShape`, `CollisionResolver`, `BlockRegistry`, `FluidState`,
  or any other module. No schema/save-format change; no migration.

## Performance/resource constraints
- `classifyNode` is O(1) (one collision-shape lookup, one block-id lookup). `canStandAt` is O(height)
  collision/block-id lookups. `movementCost` is O(height) (delegates to `canStandAt` then one more
  `classifyNode` call, already covered by the `canStandAt` loop's first iteration in practice, though
  not deduplicated — documented as an acceptable, tiny constant-factor redundancy for clarity).

## Testing seams
- All functions depend only on a hand-built `NavigationWorld` fixture (a small in-memory map from
  `(x,y,z)` to block id / collision shape) — no `Game`/`World`/`ChunkColumn` needed.

## Observability/debugging
- `PathNodeType` is a small closed enum, so a caller/test can assert exact classification results
  directly without needing a debugger.

## Affected files/symbols
- `src/simulation/NavigationGridQuery.ts` (new).
- Tests: `tests/unit/NavigationGridQuery.test.ts` (new).

## Rejected alternatives
- **Modeling all ~20 vanilla `PathType` values**: rejected (see proposal Non-goals) — massive scope
  increase for zero current consumer benefit; the five modeled types cover the load-bearing
  open/water/fire/lava/blocked distinctions a baseline ground-walker pathfinder needs.
- **Summing per-cell cost across the whole body height in `movementCost`**: rejected — vanilla's own
  node evaluator scores primarily by the node (feet) cell for movement cost; summing body-height
  costs would double-penalize tall entities without a clear benefit, and 134 documents the
  feet-cell-only simplification explicitly instead of guessing at a more complex, untested formula.
- **Per-mob movement profiles (flying, amphibious) in this change**: rejected — no such mob AI
  exists yet (136+); building profiles now would be speculative.

## Downstream dependencies
- 135 (`a-star-pathfinding`) will use `movementCost`/`canStandAt` as its per-node cost/occupancy
  oracle when expanding neighbors.
