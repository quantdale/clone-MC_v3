# Spec: waterlogging-state

## Contract

A waterlogged cell MUST be `{ blockId, waterLevel }` with `waterLevel` validated to 0 (source) or
8-15 (falling); flowing levels 1-7 MUST NOT coexist with a block. `validateWaterloggingLevel` MUST
accept exactly 0 and 8-15 and reject everything else. Conversions MUST map fluid levels to
waterlogged levels (0 → 0, 1-7 → 0, 8-15 → unchanged) and back (0 → 0, 8-15 → unchanged).
`withWaterLevel(cell, null)` MUST return null. `isWaterloggable` MUST be pure set membership.
All helpers MUST be deterministic.

## Definitions

- **WaterloggedCell**: a cell holding a block and coexisting water.
- **Coexisting levels**: 0 (source) and 8-15 (falling).
- **Waterloggable ids**: caller-supplied set of block ids that may coexist with water.

## Invariants

- `validateWaterloggingLevel(level)` accepts `0` and `[8, 15]` only.
- `waterloggingLevelFromFluid(0 | 1-7)` = 0; `waterloggingLevelFromFluid(8-15)` = level.
- `fluidLevelFromWaterlogging(0)` = 0; `fluidLevelFromWaterlogging(8-15)` = level.
- `withWaterLevel(cell, null)` = null; with a valid level → a new cell.
- `isWaterloggable(id, ids)` = `ids.has(id)`.

## Requirements

### Requirement: level validation
`validateWaterloggingLevel` MUST accept exactly 0 and integers in [8, 15].

#### Scenario: accepted levels
- **GIVEN** 0 and every integer 8-15
- **WHEN** validation runs
- **THEN** each is returned unchanged.

#### Scenario: rejected levels
- **GIVEN** 1-7, 16, -1, 0.5, NaN, or a non-number
- **WHEN** validation runs
- **THEN** a descriptive error naming the level is thrown.

### Requirement: construction
`waterlog(blockId, level)` MUST return a validated cell and MUST reject invalid inputs.

#### Scenario: valid construction
- **GIVEN** blockId 7 and level 8
- **WHEN** construction runs
- **THEN** the cell is `{ blockId: 7, waterLevel: 8 }`.

#### Scenario: invalid construction rejected
- **GIVEN** a flowing level (1-7), a negative blockId, or a fractional blockId
- **WHEN** construction runs
- **THEN** it throws and no cell is produced.

### Requirement: fluid-to-waterlogged conversion
`waterloggingLevelFromFluid` MUST map flowing water to level 0 and falling water to itself.

#### Scenario: flowing waterlogs as a source
- **GIVEN** fluid levels 0, 1, 7
- **WHEN** conversion runs
- **THEN** each maps to 0.

#### Scenario: falling water keeps its level
- **GIVEN** fluid levels 8 and 15
- **WHEN** conversion runs
- **THEN** they map to 8 and 15.

### Requirement: waterlogged-to-fluid conversion
`fluidLevelFromWaterlogging` MUST map 0 to 0 and 8-15 to themselves.

#### Scenario: back-conversion
- **GIVEN** waterlogged levels 0, 8, 15
- **WHEN** conversion runs
- **THEN** they map to 0, 8, 15.

### Requirement: transitions
`withWaterLevel(cell, level | null)` MUST return a new cell for valid levels and null for null.

#### Scenario: waterlog and unwaterlog
- **GIVEN** a cell with waterLevel 0
- **WHEN** `withWaterLevel(cell, 9)` and `withWaterLevel(cell, null)` run
- **THEN** the first returns `{ blockId, waterLevel: 9 }` and the second returns null.

### Requirement: waterloggable predicate
`isWaterloggable` MUST be pure set membership.

#### Scenario: membership
- **GIVEN** `waterloggableIds = {3, 5}`
- **WHEN** membership is queried for 3, 5, and 4
- **THEN** it is true, true, false.

### Requirement: purity
Identical inputs MUST produce identical outputs.

#### Scenario: repeated calls agree
- **GIVEN** fixed inputs
- **WHEN** each helper runs twice
- **THEN** the results are equal.

## Error and failure behavior

- Invalid levels and block ids throw descriptive errors; conversions are total over valid inputs.

## Performance and resource bounds

O(1) for all helpers.

## Compatibility and migration

Additive; 076 types reused; no existing modules touched.

## Security and integrity

Not applicable: no I/O; strict validation.

## Observability

Helpers return plain values asserted exactly in tests.

## Verification mapping

- `tests/unit/Waterlogging.test.ts` — level validation, construction, both conversion directions,
  transitions, membership, purity.
