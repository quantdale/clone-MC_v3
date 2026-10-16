# Spec: shape-aware-player-collision

## Contract

Player movement MUST resolve against per-block collision shapes (056) rather than full-cube
assumptions, axis-separated (X → Y → Z), with face snapping and per-axis collision flags. A
`CollisionResolver` MUST move an axis-aligned `CollisionBox` through a `ShapeWorld`, MUST stop an axis
at the first shape face it meets (reporting the flag) while other axes continue, MUST be
deterministic, and MUST report `collides` truthfully.

## Definitions

- **ShapeWorld**: `getCollisionShape(x, y, z): VoxelShape` per block cell.
- **CollisionBox**: `{ x, y, z, width, height, depth }` (entity AABB).
- **MovementResult**: final `(x, y, z)` plus `collidedX/Y/Z` flags.
- **epsilon**: face-tolerance (default 0.001).

## Invariants

- Axis resolution order: X, then Y, then Z.
- A collided axis is clamped to the shape face (± epsilon) and flagged; other axes keep their delta.
- `collides` is boundary-inclusive over all shape boxes in overlapped cells.
- Cells queried are the box's overlap cells expanded by epsilon.

## Requirements

### Requirement: full-cube walls and floors
Against full-cube blocks, horizontal movement MUST stop at the wall face and vertical movement at the
floor/ceiling face, with the matching flag.

#### Scenario: wall and floor
- **GIVEN** a full-cube wall at `x = 4` and a floor at `y = 0`
- **WHEN** a 1×1×1 box at `(3, 0.5, 0)` moves `(2, 0, 0)` and a box above the floor falls `(0, -2, 0)`
- **THEN** the first stops at `x = 3` with `collidedX` true; the second stops at `y = 1` (top face)
  with `collidedY` true.

### Requirement: shape-aware slabs
Against a half-slab (shape top at y = 0.5), an entity MUST stop at the shape top, not the full-cube
top.

#### Scenario: slab landing
- **GIVEN** a slab block occupying `[0,0,0]..[1,0.5,1]` in its cell
- **WHEN** a box at slab height moves down
- **THEN** it stops with its bottom at the slab's top face (y = 0.5) and `collidedY` true.

### Requirement: axis separation
A collision on one axis MUST NOT cancel movement on the other axes.

#### Scenario: diagonal into a wall
- **GIVEN** a wall to the east and open space above
- **WHEN** a box moves `(+2, +2, 0)` into the wall
- **THEN** `collidedX` is true, `collidedY` is false, and the box's y increased by 2.

### Requirement: empty space
Movement with no nearby shapes MUST be unrestricted with no flags.

#### Scenario: free move
- **GIVEN** an empty `ShapeWorld`
- **WHEN** a box moves `(1, 2, 3)`
- **THEN** the result is `x+1, y+2, z+3` with all flags false.

### Requirement: collides query
`collides(world, box)` MUST be true exactly when the box overlaps any shape box (boundary-inclusive).

#### Scenario: overlap
- **GIVEN** a full cube at the origin
- **WHEN** queried with a box inside, a box touching the boundary, and a disjoint box
- **THEN** the results are `true`, `true`, and `false`.

## Error and failure behavior

- Non-positive box dimensions → `RangeError`.

## Performance and resource bounds

Per axis O(cells × boxes per cell); typical entities span 1-4 cells.

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Deterministic axis-separated resolution prevents tunneling and frame-rate-dependent behavior.

## Observability

`MovementResult` exposes the final position and per-axis flags.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Full-cube walls and floors | wall stop + floor landing flags |
| Shape-aware slabs | stop at y = 0.5 |
| Axis separation | X stops, Y continues |
| Empty space | unrestricted, no flags |
| collides query | inside/boundary/disjoint |
