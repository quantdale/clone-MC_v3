# Spec: shape-aware-raycast

## Contract

Selection/interaction raycasting MUST test the ray against per-block selection shapes (056) rather
than full-cube assumptions. `raycastSelection` MUST walk the voxel grid in entry order (Amanatides &
Woo DDA), MUST return the nearest box hit with cell coordinates, the entered face's normal (pointing
toward the ray origin), the exact hit point, and the distance, MUST skip EMPTY cells and the air part
of partial shapes, MUST respect `maxDistance`, and MUST return `null` for degenerate inputs.

## Definitions

- **SelectionShapeWorld**: `getSelectionShape(x, y, z): VoxelShape`.
- **ShapeRayHit**: `{ blockX/Y/Z, nx/ny/nz, pointX/Y/Z, distance }`.
- **Entry t**: the ray parameter at which the ray enters a box (`max(tMin, 0)`).

## Invariants

- Cells are visited in increasing entry-`t` order; the first cell with a box hit is the nearest hit.
- EMPTY cells never hit; non-empty cells hit only where the ray crosses an actual box.
- The normal is `-sign(dir)` on the entry axis; a starting-cell hit at t = 0 has a zero normal.
- Degenerate rays (zero length, non-finite inputs, negative `maxDistance`) return `null`.

## Requirements

### Requirement: full-cube hits
Against a full-cube cell, `raycastSelection` MUST return the near face with correct distance, normal,
and point.

#### Scenario: near face
- **GIVEN** a FULL_CUBE at cell `(5, 0, 0)` and a ray from `(4, 0.5, 0.5)` along `+X`
- **WHEN** `raycastSelection` runs
- **THEN** the hit is cell `(5, 0, 0)` at distance `1` with `nx = -1` and point `(5, 0.5, 0.5)`.

### Requirement: shape-aware pass-through
A ray through the air part of a partial shape MUST NOT hit.

#### Scenario: above a slab
- **GIVEN** a slab `[0,0,0]..[1,0.5,1]` at cell `(0, 0, 0)`
- **WHEN** a ray from `(-2, 0.75, 0.5)` along `+X` runs
- **THEN** it returns `null` (no shape at that height); the same ray at y = 0.25 hits the slab's
  `-X` face at distance 2.

### Requirement: nearest cell
When several cells along the ray contain shapes, the nearest hit MUST be returned.

#### Scenario: two cubes
- **GIVEN** FULL_CUBE cells at `(3, 0, 0)` and `(6, 0, 0)`
- **WHEN** a ray from `(2, 0.5, 0.5)` along `+X` runs
- **THEN** the hit is cell `(3, 0, 0)` at distance 1.

### Requirement: maxDistance
Hits beyond `maxDistance` MUST return `null`; hits within MUST be returned.

#### Scenario: reach limit
- **GIVEN** a FULL_CUBE at cell `(6, 0, 0)` and a ray from `(0, 0.5, 0.5)` along `+X`
- **WHEN** `raycastSelection` runs with `maxDistance = 5` and with `maxDistance = 6.1`
- **THEN** the first returns `null` and the second returns the hit at distance 6.

### Requirement: degenerate inputs
Zero-length directions, non-finite inputs, and negative `maxDistance` MUST return `null`.

#### Scenario: guards
- **GIVEN** `dir = (0, 0, 0)`, `origin = NaN`, and `maxDistance = -1`
- **WHEN** `raycastSelection` runs with each
- **THEN** each returns `null`.

## Error and failure behavior

- Degenerate inputs return `null` (no throw).

## Performance and resource bounds

O(cells × boxes per cell) bounded by the DDA path and `maxDistance`.

## Compatibility and migration

Additive; `raycastVoxel` remains untouched.

## Security and integrity

Shape-aware selection prevents targeting the air part of partial blocks; deterministic traversal.

## Observability

Hit point/distance/normal fully describe the interaction point.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Full-cube hits | near face distance/normal/point |
| Shape-aware pass-through | above-slab null; slab face hit |
| Nearest cell | two cubes, nearer returned |
| maxDistance | beyond → null; within → hit |
| Degenerate inputs | zero-length/NaN/negative → null |
