# Spec: voxel-shape-core

## Contract

Block collision, selection, and occlusion MUST be expressible as immutable, composable voxel shapes:
ordered lists of axis-aligned boxes in block-local unit coordinates `[0, 1]³`. A `VoxelShape` MUST
validate and freeze its boxes, MUST compose via `union` without mutating inputs, MUST answer
`intersects`/`contains`/`maxY`, and MUST provide `EMPTY`/`FULL_CUBE` constants.

## Definitions

- **Aabb**: `{ minX, minY, minZ, maxX, maxY, maxZ }` with `min ≤ max` per axis.
- **Block-local**: coordinates in `[0, 1]` within the block's cell.

## Invariants

- Construction validates finiteness and `min ≤ max`; inputs are copied; stored boxes and the list are
  frozen.
- `union` returns a new shape; neither input is mutated.
- `intersects` is inclusive at boundaries; `contains` is inclusive at boundaries.
- `maxY()` is the highest `maxY`; `0` for `EMPTY`.
- `FULL_CUBE` is the unit cube; `EMPTY` has zero boxes.

## Requirements

### Requirement: construction and validation
`of(boxes)` MUST copy and validate; non-finite coordinates or `min > max` MUST throw.

#### Scenario: invalid boxes
- **GIVEN** a box with `NaN` or `minX > maxX`
- **WHEN** `VoxelShape.of([...])` runs
- **THEN** it throws a descriptive `Error`.

### Requirement: immutability
Mutating the input array or boxes after construction MUST NOT change the shape.

#### Scenario: input mutation
- **GIVEN** a shape built from an array and a box
- **WHEN** the array is cleared and the box's fields are mutated
- **THEN** `shape.boxes` still holds the original values.

### Requirement: union composition
`union(other)` MUST return a new shape whose box list is the concatenation, leaving both inputs
unchanged.

#### Scenario: union
- **GIVEN** shapes with 1 and 2 boxes
- **WHEN** `union` runs
- **THEN** the result has 3 boxes, both originals still have their counts, and a point inside either
  original is inside the union.

### Requirement: intersects
`intersects(minX, minY, minZ, maxX, maxY, maxZ)` MUST be true exactly when any box overlaps the query
AABB (boundaries inclusive).

#### Scenario: overlap and boundary
- **GIVEN** a FULL_CUBE shape
- **WHEN** queried with a fully-inside AABB, a disjoint AABB, and a boundary-touching AABB
- **THEN** the results are `true`, `false`, and `true`.

### Requirement: contains
`contains(x, y, z)` MUST be true when the point is inside any box (boundaries inclusive).

#### Scenario: point tests
- **GIVEN** a slab shape `[0,0,0]..[1,0.5,1]`
- **WHEN** queried at `(0.5, 0.25, 0.5)`, `(0.5, 0.75, 0.5)`, and `(0.5, 0.5, 0.5)`
- **THEN** the results are `true`, `false`, and `true` (boundary inclusive).

### Requirement: maxY
`maxY()` MUST return the highest `maxY` across boxes (`0` for `EMPTY`).

#### Scenario: multi-box
- **GIVEN** a shape with boxes ending at `0.5` and `1.0`
- **WHEN** `maxY()` runs
- **THEN** it returns `1.0`; `EMPTY.maxY()` returns `0`.

## Error and failure behavior

- Invalid construction throws `Error` with a descriptive message.

## Performance and resource bounds

Queries are O(boxes); typical shapes have 1-16 boxes.

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Validation + immutability prevent malformed or corrupted shape state.

## Observability

`boxes` is directly inspectable.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Construction and validation | NaN / min>max throw |
| Immutability | input mutation does not affect the shape |
| Union composition | concatenation, originals unchanged |
| Intersects | inside/disjoint/boundary AABBs |
| Contains | inside/outside/boundary points |
| maxY | multi-box max; EMPTY 0 |
