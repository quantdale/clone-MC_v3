# Spec: nether-dimension-type

## Contract
This capability adds the canonical dimension types — the overworld (for symmetry) and the Nether —
as production `DimensionType` constants with vanilla parameters, plus the save-namespace rule
(`dimensionSaveNamespace`: a dimension's storage namespace is its key, validated as a legal full
resource id).

## Definitions
- **Overworld type**: `minecraft:overworld`, minY −64, height 384, logicalHeight 384, skylight,
  natural, no fixed time.
- **Nether type**: `minecraft:the_nether`, minY 0, height 256, logicalHeight 256, NO skylight,
  ultrawarm, non-natural, `fixedTime 18000`.
- **Save namespace**: the dimension key itself, validated.

## Invariants
- The constants carry exactly the parameters above (pinned by tests at every field).
- `dimensionSaveNamespace(key)` returns `key` iff `tryParseResourceId(key)` parses; otherwise throws
  `RegistryError('INVALID_ID', key, …)`.

## Requirements

### Requirement: the overworld type matches vanilla 1.18+
`OVERWORLD_DIMENSION_TYPE` MUST have id `minecraft:overworld`, minY −64, height and logicalHeight
384 (24 sections), `hasSkylight` true, `natural` true, `ultrawarm` false, `fixedTime` null, and
`containsY` true exactly for −64..319.

#### Scenario: overworld fields and bounds
- **GIVEN** `OVERWORLD_DIMENSION_TYPE`
- **THEN** `sectionCount` is 24, `containsY(-64)` and `containsY(319)` are true, `containsY(320)` is
  false, and all other fields match the definition

### Requirement: the Nether type matches vanilla
`NETHER_DIMENSION_TYPE` MUST have id `minecraft:the_nether`, minY 0, height and logicalHeight 256
(16 sections), `hasSkylight` false, `ultrawarm` true, `natural` false, `fixedTime` 18000, and
`containsY` true exactly for 0..255.

#### Scenario: Nether fields, bounds, and ambient rules
- **GIVEN** `NETHER_DIMENSION_TYPE`
- **THEN** `sectionCount` is 16, `containsY(0)` and `containsY(255)` are true, `containsY(256)` and
  `containsY(-1)` are false, `hasSkylight` is false, `ultrawarm` is true, `natural` is false, and
  `fixedTime` is 18000

### Requirement: the Nether registers through the dimension manager
Registering `NETHER_DIMENSION_TYPE` in a 174 `DimensionManager` MUST store it under
`minecraft:the_nether` with a fresh tick queue.

#### Scenario: manager integration
- **GIVEN** a fresh `DimensionManager`
- **WHEN** `registerDimension(NETHER_DIMENSION_TYPE, world)` is called
- **THEN** `hasDimension('minecraft:the_nether')` is true, its `type` is the Nether constant, and
  `tickAll(0)` yields an empty due list for it

### Requirement: the save namespace is the validated key
`dimensionSaveNamespace(key)` MUST return `key` unchanged when `key` is a legal full resource id and
MUST throw `INVALID_ID` otherwise.

#### Scenario: legal keys pass through
- **GIVEN** `minecraft:overworld` and `minecraft:the_nether`
- **THEN** `dimensionSaveNamespace` returns them unchanged

#### Scenario: malformed keys are rejected
- **GIVEN** `''`, `'Bad Key'`, `'minecraft:'`, and `'the_nether'`
- **THEN** `dimensionSaveNamespace` throws `INVALID_ID` for each

## Error and failure behavior
- Malformed keys throw `INVALID_ID` before any persistence call; the constants cannot be malformed
  (025 validates at construction).

## Performance and resource bounds
- Module-load constant construction; `dimensionSaveNamespace` O(key length).

## Compatibility and migration
- One new data module; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- `dimensionSaveNamespace` is the single validated entry point for persistence namespaces.

## Observability
- The constants are plain values; the namespace rule is a single pure function.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 overworld type | `tests/unit/DimensionTypes.test.ts` › `overworld dimension type` |
| REQ-2 Nether type | › `nether dimension type` (fields) |
| REQ-3 manager integration | › `nether dimension type` (registration) |
| REQ-4 save namespace | › `dimensionSaveNamespace` |
