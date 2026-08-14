# Spec: dimension-type-height-model

## Contract

`dimension-type-height-model` provides a `DimensionType` vertical-extent model (minY/height/logicalHeight/
skylight) with derived section layout, validated inputs, and a registry of default dimensions
(overworld/nether/end). It is the single source of `minSectionY`/`sectionCount` for 024 columns.

## Definitions

- **minY**: lowest block Y (may be negative). **height**: total block height (> 0).
- **logicalHeight**: playable height, `1 <= logicalHeight <= height`.
- **minSectionY**: absolute lowest section index = `floor(minY / 16)`.
- **sectionCount**: number of vertical sections = `ceil(height / 16)`.

## Invariants

- `minY` MUST be an integer; `height` MUST be a positive integer; `logicalHeight` MUST be an integer in `[1, height]`.
- `minSectionY === floor(minY / 16)`.
- `sectionCount === ceil(height / 16)` and MUST be positive.
- `maxSectionY === minSectionY + sectionCount - 1`.
- `maxY === minY + height - 1`.
- `sectionIndexForY(worldY) === floor(worldY / 16) - minSectionY` and MUST be in `[0, sectionCount)`.
- `containsY(worldY) === (minY <= worldY <= maxY)`.

## Requirements

### Requirement: derived section layout matches vertical extent
A `DimensionType` MUST derive `minSectionY`, `sectionCount`, `maxSectionY`, and `maxY` from its extent.

#### Scenario: overworld
- **GIVEN** `minY = -64`, `height = 384`
- **THEN** `minSectionY = -4`, `sectionCount = 24`, `maxSectionY = 19`, `maxY = 319`

#### Scenario: nether
- **GIVEN** `minY = 0`, `height = 128`
- **THEN** `minSectionY = 0`, `sectionCount = 8`, `maxY = 127`

### Requirement: malformed extent is rejected
Construction MUST throw for non-positive/non-integer height, out-of-range logicalHeight, or non-integer minY.

#### Scenario: non-positive height
- **GIVEN** `height = 0`
- **WHEN** a `DimensionType` is constructed
- **THEN** it throws

#### Scenario: logicalHeight out of range
- **GIVEN** `height = 256`, `logicalHeight = 300`
- **WHEN** a `DimensionType` is constructed
- **THEN** it throws

### Requirement: world-Y queries respect the vertical range
`containsY`/`sectionIndexForY` MUST behave per the invariants.

#### Scenario: overworld range queries
- **GIVEN** an overworld `DimensionType`
- **WHEN** `containsY(320)` and `sectionIndexForY(319)` are evaluated
- **THEN** `containsY(320)` is `false` and `sectionIndexForY(319)` is `23`

### Requirement: registry exposes default dimensions
`createDefaultDimensionTypeRegistry` MUST register overworld, nether, and end and reject unknown/duplicate ids.

#### Scenario: default registry
- **GIVEN** the default registry
- **WHEN** size and a lookup of overworld are read
- **THEN** size is `3` and overworld `sectionCount` is `24`

## Error and failure behavior

- Malformed extent → `RegistryError('INVALID_ID')`.
- Unknown id → `RegistryError('MISSING_ID')`; duplicate id → `RegistryError('DUPLICATE_ID')`.

## Performance and resource bounds

O(1) construction/lookups; trivial memory for three dimensions.

## Compatibility and migration

Additive; no persisted or call-site changes.

## Security and integrity

No external input; validation is local.

## Observability

Derived fields are plain numbers, making layout testable without a world.

## Verification mapping

- Derived layout, validation, range queries, registry -> `tests/unit/DimensionType.test.ts`
- Full gate -> typecheck, lint, unit, build, e2e
