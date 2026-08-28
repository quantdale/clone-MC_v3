# Spec: navigation-grid-query

## Contract
This capability adds per-cell walkability classification and movement-cost queries for a generic
ground-walker entity profile, combining 056 `VoxelShape` collision with block-id-based hazard/fluid
detection (water, fire, lava). No pathfinding/search, no per-mob movement profiles, and no `Game`/
`World` wiring are in scope — see the proposal's Non-goals.

## Definitions
- **Path node type**: one of `Blocked` (solid obstruction), `Open` (clear, no hazard), `Water`
  (swimmable fluid), `DamageFire` (passable but hazardous), `Lava` (impassable hazard).
- **Passable**: a path node type an entity may occupy — `Open`, `Water`, `DamageFire`. `Blocked` and
  `Lava` are not passable.
- **Node cost**: a fixed non-negative weight (or `Infinity`) per path node type, used by a future
  pathfinder to prefer cheaper routes.
- **Support**: a cell has support when the cell directly below it has a non-empty collision shape
  (solid ground), or the cell itself is `Water` (floats/swims without ground).
- **Navigation world**: the minimal access a caller supplies — `getCollisionShape(x, y, z)` and
  `getBlockId(x, y, z)`.

## Invariants
- `nodeCost(Open) < nodeCost(Water) < nodeCost(DamageFire) < nodeCost(Blocked) === nodeCost(Lava) ===
  Infinity`.
- `isPassable(type)` is `true` exactly for `{Open, Water, DamageFire}`.
- A cell with a non-empty collision shape always classifies `Blocked`, regardless of its block id.
- `canStandAt` requires every vertically-stacked occupied cell to be passable AND requires support
  (solid ground below, or the feet cell itself is `Water`).
- `movementCost` is `Infinity` exactly when `canStandAt` is `false`.

## Requirements

### Requirement: classifyNode identifies solid, hazard, fluid, and open cells correctly
`classifyNode(world, x, y, z)` MUST return `Blocked` when the cell's collision shape is non-empty,
regardless of block id. Otherwise it MUST return `Lava` for a lava block, `DamageFire` for a fire
block, `Water` for a water block, and `Open` for any other block.

#### Scenario: each block kind classifies correctly
- **GIVEN** a fixture world with a solid (full-cube-shaped) stone cell, a lava cell, a fire cell, a
  water cell, and an air cell
- **WHEN** `classifyNode` is called on each
- **THEN** the results are `Blocked`, `Lava`, `DamageFire`, `Water`, and `Open` respectively

#### Scenario: collision shape takes priority over block id
- **GIVEN** a fixture cell whose collision shape is non-empty but whose block id happens to be
  `BlockId.Water`
- **WHEN** `classifyNode` is called on it
- **THEN** the result is `Blocked`, not `Water`

### Requirement: node cost ordering and isPassable partition path node types correctly
`nodeCost` MUST satisfy `nodeCost(Open) < nodeCost(Water) < nodeCost(DamageFire) <
nodeCost(Blocked)`, with `nodeCost(Blocked) === nodeCost(Lava) === Infinity`. `isPassable(type)` MUST
be `true` exactly for `Open`, `Water`, and `DamageFire`, and `false` exactly for `Blocked` and
`Lava`.

#### Scenario: the cost ordering holds across all five types
- **GIVEN** the five `PathNodeType` values
- **WHEN** `nodeCost` is evaluated on each
- **THEN** `nodeCost(Open) < nodeCost(Water) < nodeCost(DamageFire) < nodeCost(Blocked)` and
  `nodeCost(Blocked) === nodeCost(Lava) === Infinity`

#### Scenario: isPassable partitions the five types correctly
- **GIVEN** the five `PathNodeType` values
- **WHEN** `isPassable` is evaluated on each
- **THEN** it is `true` for `Open`/`Water`/`DamageFire` and `false` for `Blocked`/`Lava`

### Requirement: canStandAt requires a passable body and support
`canStandAt(world, x, y, z, height)` MUST return `true` only when every cell `(x, y + dy, z)` for
`dy` in `[0, height)` is passable, AND either `(x, y - 1, z)` has a non-empty collision shape or
`(x, y, z)` itself classifies as `Water`. Otherwise it MUST return `false`.

#### Scenario: standing on solid ground with clear headroom succeeds
- **GIVEN** a fixture with solid ground at `(0, 4, 0)` and open air at `(0, 5, 0)`/`(0, 6, 0)`
- **WHEN** `canStandAt(world, 0, 5, 0, 2)` is called
- **THEN** it returns `true`

#### Scenario: an obstruction in the occupied body height blocks standing
- **GIVEN** the same ground, but a solid block at `(0, 6, 0)`
- **WHEN** `canStandAt(world, 0, 5, 0, 2)` is called
- **THEN** it returns `false`

#### Scenario: no ground and not in water blocks standing
- **GIVEN** open air at `(0, 5, 0)` and `(0, 6, 0)` with air (not solid) at `(0, 4, 0)`
- **WHEN** `canStandAt(world, 0, 5, 0, 2)` is called
- **THEN** it returns `false`

#### Scenario: floating in water needs no solid ground below
- **GIVEN** water at `(0, 5, 0)`, open air at `(0, 6, 0)`, and air (not solid) at `(0, 4, 0)`
- **WHEN** `canStandAt(world, 0, 5, 0, 2)` is called
- **THEN** it returns `true`

### Requirement: movementCost reflects occupancy and the feet cell's node cost
`movementCost(world, x, y, z, height)` MUST return `Infinity` when `canStandAt(world, x, y, z,
height)` is `false`, and otherwise MUST return `nodeCost(classifyNode(world, x, y, z))`.

#### Scenario: an occupiable open cell has finite cost equal to nodeCost(Open)
- **GIVEN** the solid-ground, clear-headroom fixture from the `canStandAt` scenarios
- **WHEN** `movementCost(world, 0, 5, 0, 2)` is called
- **THEN** it equals `nodeCost(Open)` (`0`)

#### Scenario: an unoccupiable cell has infinite cost
- **GIVEN** the obstructed-headroom fixture from the `canStandAt` scenarios
- **WHEN** `movementCost(world, 0, 5, 0, 2)` is called
- **THEN** it equals `Infinity`

## Error and failure behavior
- None of `classifyNode`/`nodeCost`/`isPassable`/`canStandAt`/`movementCost` throw for a well-formed
  `NavigationWorld` and finite integer coordinates; a throwing `NavigationWorld` implementation
  propagates unmodified (no error handling is added by this module).

## Performance and resource bounds
- `classifyNode` is O(1). `canStandAt` is O(height) lookups. `movementCost` is O(height) (delegates
  to `canStandAt`, then one more O(1) `classifyNode` call).

## Compatibility and migration
- One new, additive file (`src/simulation/NavigationGridQuery.ts`); no edits to any existing module.
  No schema/save-format change; no migration.

## Security and integrity
- All classification is derived directly from the caller-supplied `NavigationWorld`'s own answers;
  this module introduces no additional state that could drift from the world it queries.

## Observability
- `PathNodeType` is a small closed enum; a test or caller can assert exact classification results
  directly.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 classifyNode identifies each kind correctly | `tests/unit/NavigationGridQuery.test.ts` classifyNode cases |
| REQ-2 cost ordering + isPassable partition | `tests/unit/NavigationGridQuery.test.ts` nodeCost/isPassable cases |
| REQ-3 canStandAt requires passable body + support | `tests/unit/NavigationGridQuery.test.ts` canStandAt cases |
| REQ-4 movementCost reflects occupancy + feet cost | `tests/unit/NavigationGridQuery.test.ts` movementCost cases |
