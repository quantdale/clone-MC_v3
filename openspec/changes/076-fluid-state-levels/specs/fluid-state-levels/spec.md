# Spec: fluid-state-levels

## Contract

A `FluidState { fluidId, level }` MUST be constructible only with a validated level (integer in
[0, 15]) and a non-negative integer `fluidId`. The level semantics MUST be: 0 = source (full),
1-7 = flowing with surface height `(8 - level) / 8`, 8-15 = falling with falling height
`level - 8` (full-height render). `isFluidSource`, `isFluidFalling`, `fluidSurfaceHeight`, and
`fluidFallingHeight` MUST implement exactly these semantics, purely and deterministically.
`validateFluidLevel` MUST accept exactly integers in [0, 15] and MUST reject everything else.

## Definitions

- **FluidLevel**: integer in [0, 15].
- **Source**: level 0.
- **Flowing**: levels 1-7; surface height `(8 - level) / 8`.
- **Falling**: levels 8-15; falling height `level - 8`, rendered full-height.

## Invariants

- `isFluidSource(state) === (state.level === 0)`.
- `isFluidFalling(state) === (state.level >= 8)`.
- `fluidSurfaceHeight`: `1` for 0; `(8 - level) / 8` for 1-7; `1` for 8-15.
- `fluidFallingHeight`: `level - 8` for 8-15; `0` otherwise.
- Helpers are pure: identical states produce identical results.

## Requirements

### Requirement: level validation
`validateFluidLevel(input)` MUST accept exactly integers in [0, 15] and MUST throw a descriptive
error otherwise.

#### Scenario: valid levels accepted
- **GIVEN** the integers 0 through 15
- **WHEN** validation runs
- **THEN** each is returned unchanged.

#### Scenario: invalid levels rejected
- **GIVEN** -1, 16, 1.5, NaN, `'5'`, null, or undefined
- **WHEN** validation runs
- **THEN** an error naming the value is thrown.

### Requirement: construction
`createFluidState(fluidId, level)` MUST return `{ fluidId, level }` for valid inputs and MUST throw
for invalid ones.

#### Scenario: valid construction
- **GIVEN** `fluidId 3`, `level 5`
- **WHEN** construction runs
- **THEN** the state is `{ fluidId: 3, level: 5 }`.

#### Scenario: invalid construction rejected
- **GIVEN** a level outside [0, 15], a fractional level, or a negative/fractional `fluidId`
- **WHEN** construction runs
- **THEN** it throws and no state is produced.

### Requirement: source classification
`isFluidSource` MUST be true exactly for level 0.

#### Scenario: all levels classified
- **GIVEN** states with levels 0..15
- **WHEN** classification runs
- **THEN** only level 0 is a source.

### Requirement: falling classification
`isFluidFalling` MUST be true exactly for levels 8-15.

#### Scenario: all levels classified
- **GIVEN** states with levels 0..15
- **WHEN** classification runs
- **THEN** exactly levels 8-15 are falling.

### Requirement: surface height
`fluidSurfaceHeight` MUST return 1 for level 0, `(8 - level) / 8` for levels 1-7, and 1 for
levels 8-15.

#### Scenario: height curve
- **GIVEN** states with levels 0, 1, 7, 8, 15
- **WHEN** heights are computed
- **THEN** they are 1, 7/8, 1/8, 1, 1.

### Requirement: falling height
`fluidFallingHeight` MUST return `level - 8` for levels 8-15 and 0 otherwise.

#### Scenario: falling height curve
- **GIVEN** states with levels 7, 8, 15
- **WHEN** falling heights are computed
- **THEN** they are 0, 0, 7.

### Requirement: purity
Helpers MUST be deterministic: identical states produce identical results.

#### Scenario: repeated queries agree
- **GIVEN** a fixed state
- **WHEN** each helper runs twice
- **THEN** the results are equal.

## Error and failure behavior

- Invalid levels and fluid ids fail at validation/construction with descriptive errors; no silent
  coercion, no partial state.

## Performance and resource bounds

All helpers O(1); state is a two-field object.

## Compatibility and migration

Additive: new module + test file; 015 and all existing modules unchanged.

## Security and integrity

Not applicable: no I/O; strict input validation.

## Observability

Helpers return plain values asserted exactly in tests.

## Verification mapping

- `tests/unit/FluidState.test.ts` — level validation matrix; construction valid/invalid;
  source/falling classification across all 16 levels; surface-height and falling-height curves;
  purity.
