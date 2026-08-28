# Spec: fluid-collision-movement

## Contract

Fluid-movement computations MUST be deterministic functions of fluid data: `fluidDragFactor(d) =
clamp(1.1 - 0.3 * d, 0, 1)` (water 0.8, lava 0.5); `applyFluidDrag` scales each velocity axis by
`factor ^ tickDelta`; `buoyancyAcceleration(fd, ed, g) = g * max(0, 1 - ed / fd)`; immersion
functions (`eyeFluid`, `fluidHeightAt`, `submergedFraction`, `isFullySubmerged`) MUST report the
fluid state at a point, the topmost fluid in a column window, the clamped submerged fraction of an
AABB, and the full-submersion predicate. Invalid densities and tick deltas MUST throw.

## Definitions

- **Fluid density**: 015 `density` (water 1, lava 2), caller-validated, ≥ 1.
- **Fluid top**: `highestFluidCellY + 1` in the scanned window (block units).
- **Submerged fraction**: `clamp((fluidTop - aabb.minY) / (aabb.maxY - aabb.minY), 0, 1)`.
- **Eye fluid**: the fluid id of the cell containing the point (null in air).

## Invariants

- `fluidDragFactor(1) === 0.8`; `fluidDragFactor(2) === 0.5`; non-positive/non-finite → throw.
- `applyFluidDrag(v, d, 0) === v`; each axis scales by `factor ^ tickDelta`.
- `buoyancyAcceleration(fd, fd, g) === 0`; `buoyancyAcceleration(2, 1, g) === g / 2`;
  entity denser than fluid → 0.
- Empty column → `fluidTop === minY`, `submergedFraction === 0`.
- Falling water cells (8-15) count as fluid for all queries.

## Requirements

### Requirement: drag factor
`fluidDragFactor` MUST implement the documented formula with clamping and validation.

#### Scenario: known fluids
- **GIVEN** densities 1 and 2
- **WHEN** the factor is computed
- **THEN** it is 0.8 and 0.5.

#### Scenario: clamp
- **GIVEN** density 5 (factor would be -0.4)
- **WHEN** the factor is computed
- **THEN** it is 0.

#### Scenario: invalid density
- **GIVEN** 0, -1, NaN, or Infinity
- **WHEN** the factor is computed
- **THEN** it throws.

### Requirement: drag application
`applyFluidDrag` MUST scale each axis by `factor ^ tickDelta` without mutating the input.

#### Scenario: one tick
- **GIVEN** velocity (1, 1, 1) and water density 1 (factor 0.8)
- **WHEN** drag applies with `tickDelta = 1`
- **THEN** the velocity is (0.8, 0.8, 0.8).

#### Scenario: compounding
- **GIVEN** velocity (1, 0, 0) and water density 1
- **WHEN** drag applies with `tickDelta = 2`
- **THEN** the velocity is (0.64, 0, 0).

#### Scenario: identity
- **GIVEN** any velocity and `tickDelta = 0`
- **WHEN** drag applies
- **THEN** the velocity is unchanged and the input object is untouched.

### Requirement: buoyancy
`buoyancyAcceleration` MUST implement `g * max(0, 1 - ed / fd)`.

#### Scenario: neutral in water
- **GIVEN** fluid density 1 and entity density 1
- **WHEN** buoyancy is computed with gravity g
- **THEN** it is 0.

#### Scenario: floats on denser fluid
- **GIVEN** fluid density 2 (lava) and entity density 1
- **WHEN** buoyancy is computed with gravity g
- **THEN** it is g / 2 (upward).

#### Scenario: entity denser
- **GIVEN** fluid density 1 and entity density 2
- **WHEN** buoyancy is computed
- **THEN** it is 0.

### Requirement: eye fluid
`eyeFluid` MUST return the fluid id at the point's cell, or null.

#### Scenario: in and out of water
- **GIVEN** a point inside a water cell and a point in air
- **WHEN** eye-fluid is queried
- **THEN** the results are the water id and null.

### Requirement: fluid height
`fluidHeightAt` MUST return the topmost fluid cell's top in `[minY, maxY)`, or `minY` when empty.

#### Scenario: stacked water
- **GIVEN** water at y=4 and y=5 in a column with window [0, 8)
- **WHEN** height is queried
- **THEN** it is 6.

#### Scenario: empty column
- **GIVEN** no fluid in the window
- **WHEN** height is queried
- **THEN** it is `minY`.

#### Scenario: falling water counts
- **GIVEN** falling water (level 8) at y=3
- **WHEN** height is queried
- **THEN** it is 4.

### Requirement: submersion
`submergedFraction` MUST clamp to [0, 1] and `isFullySubmerged` MUST be true at 1.

#### Scenario: partial, none, full
- **GIVEN** an AABB whose column fluid top is at its mid-height, below it, and at/above its top
- **WHEN** the fraction is computed
- **THEN** it is 0.5, 0, and 1 (fully submerged true only for the last).

### Requirement: determinism
Identical inputs MUST produce identical outputs.

#### Scenario: repeated calls agree
- **GIVEN** fixed worlds and inputs
- **WHEN** each function runs twice
- **THEN** the results are equal.

## Error and failure behavior

- Invalid densities and tick deltas throw descriptive errors.
- World accessor exceptions propagate (caller trust).

## Performance and resource bounds

Height scan O(window); everything else O(1).

## Compatibility and migration

Additive; no existing modules touched.

## Security and integrity

Not applicable: no I/O; inputs validated.

## Observability

Functions return plain numbers/objects asserted exactly in tests.

## Verification mapping

- `tests/unit/FluidMovement.test.ts` — drag factors/clamp/validation, drag compounding and
  identity, buoyancy cases, eye-fluid, height scan scenarios, submersion cases, determinism.
