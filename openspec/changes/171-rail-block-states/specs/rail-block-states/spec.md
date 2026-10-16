# Spec: rail-block-states

## Contract
This capability adds the rail block and the deterministic neighbor-driven shape model behind it: ten
vanilla rail shapes, a pure `resolveRailShape` connection rule (straight pairs first, ascending
toward elevated sides; then same-level corners; then singles; else `north_south`), a
`railNeighborInfo` sampler over a caller-supplied world seam, the solid-support placement rule, a
`railShapeConnections` projection, and the `{ shape }` state projection. No world mutation — the
caller applies resolved shapes.

## Definitions
- **Shape**: one of `north_south`, `east_west`, `ascending_east/west/north/south`,
  `corner_north_east/north_west/south_east/south_west`.
- **Level**: `0` = a neighbor rail at the same height, `1` = one block higher (ascending connection).
- **Present**: a rail block exists at the sampled position (same height or +1).

## Invariants
- `resolveRailShape` is total and deterministic with the documented precedence; an elevated neighbor
  never forms a corner.
- `railNeighborInfo` returns level 0 for a same-height rail, level 1 for a one-higher rail, and
  `present: false` otherwise.
- `railHasSupport` is exactly `isSolidSupport(getBlockState(x, y - 1, z))`.
- `RAIL_SHAPES` is the single source of truth for the schema's legal values.

## Requirements

### Requirement: the rail block and item are registered
`BlockRegistry` MUST register `rail` carrying `RAIL_SCHEMA` with a default of `{ shape:
'north_south' }`; `ItemTypeRegistry` MUST register a placing item.

#### Scenario: the block carries its schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `rail` block is looked up
- **THEN** it exposes `RAIL_SCHEMA` and the `{ shape: 'north_south' }` default

#### Scenario: the item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `rail` item is looked up
- **THEN** its `placeBlock` resolves to the rail block and `validateItemBlockCrossReferences` passes

#### Scenario: the block enumerates exactly 10 states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the rail's states are counted
- **THEN** there are exactly 10, and the default is among them

### Requirement: resolveRailShape follows the documented precedence
`resolveRailShape(neighbors)` MUST return, in order: the straight for a north+south pair (ascending
toward an elevated side), the straight for an east+west pair (same), a corner for two perpendicular
same-level pairs, an ascent for a single elevated neighbor, the flat straight of its axis for a
single same-level neighbor, and `north_south` otherwise.

#### Scenario: no neighbors default to north_south
- **GIVEN** no neighbors
- **WHEN** `resolveRailShape` is called
- **THEN** it returns `north_south`

#### Scenario: opposite same-level pairs form flat straights
- **GIVEN** `{ north: 0, south: 0 }` and `{ east: 0, west: 0 }`
- **THEN** the shapes are `north_south` and `east_west`

#### Scenario: an elevated side of a straight pair makes the rail ascend
- **GIVEN** `{ north: 1, south: 0 }`, `{ north: 0, south: 1 }`, `{ east: 1, west: 0 }`,
  `{ east: 0, west: 1 }`
- **THEN** the shapes are `ascending_north`, `ascending_south`, `ascending_east`, `ascending_west`

#### Scenario: perpendicular same-level pairs form all four corners
- **GIVEN** each of the four perpendicular same-level pairs
- **THEN** the shape is the corresponding corner

#### Scenario: an elevated neighbor never corners
- **GIVEN** `{ north: 1, east: 0 }`
- **WHEN** `resolveRailShape` is called
- **THEN** it returns `ascending_north`, not a corner

#### Scenario: straight pairs take precedence over corners
- **GIVEN** `{ north: 0, south: 0, east: 0 }`
- **WHEN** `resolveRailShape` is called
- **THEN** it returns `north_south`

### Requirement: railNeighborInfo samples the correct level
`railNeighborInfo(world, x, y, z, direction)` MUST return `{ present: true, level: 0 }` for a rail at
the same height, `{ present: true, level: 1 }` for a rail one block higher, and
`{ present: false, level: 0 }` otherwise.

#### Scenario: same-height, one-higher, and absent
- **GIVEN** rails at `(1, 0, 0)` and `(1, 1, 0)` in separate worlds
- **WHEN** sampling east from `(0, 0, 0)`
- **THEN** the results are level 0 and level 1; sampling west returns `present: false`

### Requirement: railHasSupport requires a solid block below
`railHasSupport(world, x, y, z)` MUST return `world.isSolidSupport(world.getBlockState(x, y - 1, z))`.

#### Scenario: solid below and air below
- **GIVEN** a stone block below and, separately, air below
- **WHEN** `railHasSupport` is called
- **THEN** it returns `true` and `false`

### Requirement: railShapeConnections reports connected directions
`railShapeConnections(shape)` MUST return the horizontal directions the shape connects toward
(`north_south` → north+south, `east_west` → east+west, ascents → their single direction, corners →
their two directions).

#### Scenario: every shape's connections
- **GIVEN** each of the 10 shapes
- **WHEN** `railShapeConnections` is called
- **THEN** it returns the shape's connected directions, all non-empty

### Requirement: railStateProperties projects the full state
`railStateProperties(shape)` MUST return `{ shape }` with a value legal for `RAIL_SCHEMA`.

#### Scenario: the projection matches the schema
- **GIVEN** `railStateProperties('ascending_east')`
- **THEN** the record is `{ shape: 'ascending_east' }` and `RAIL_SCHEMA.legalValues('shape')`
  contains it

## Error and failure behavior
- No function throws for well-formed inputs; `resolveRailShape` is total over every neighbor
  combination.

## Performance and resource bounds
- All functions O(1); 10 new block states.

## Compatibility and migration
- One additive block id and one additive item id; one new simulation file (shared `RAIL_SHAPES` with
  the schema); three characterization updates. No `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- `RailShape` values are self-describing; `railShapeConnections` exposes connectivity.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration + 10 states | `tests/unit/RailBlockStates.test.ts` registration cases |
| REQ-2 resolver precedence | resolver cases (default/straights/ascents/corners/no-corner/precedence/singles) |
| REQ-3 neighbor sampling | neighbor-info cases |
| REQ-4 support rule | support cases |
| REQ-5 connections | connections cases |
| REQ-6 state projection | projection case |
