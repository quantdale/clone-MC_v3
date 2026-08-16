# Spec: end-dimension-type

## Contract
This capability adds the canonical End `DimensionType` with vanilla parameters: `minecraft:the_end`,
minY 0, height 256 (16 sections), no skylight, not ultrawarm, non-natural, fixed time 6000.

## Definitions
- **End type**: `minecraft:the_end`, minY 0, height/logicalHeight 256, no skylight, not ultrawarm,
  non-natural, `fixedTime 6000`.

## Invariants
- The constant carries exactly the parameters above (pinned by tests at every field).
- Registers through 174's `DimensionManager` under `minecraft:the_end`.

## Requirements

### Requirement: the End type matches vanilla
`END_DIMENSION_TYPE` MUST have id `minecraft:the_end`, minY 0, height and logicalHeight 256 (16
sections), `hasSkylight` false, `ultrawarm` false, `natural` false, `fixedTime` 6000, and
`containsY` true exactly for 0..255.

#### Scenario: End fields, bounds, and ambient rules
- **GIVEN** `END_DIMENSION_TYPE`
- **THEN** `sectionCount` is 16, `containsY(0)` and `containsY(255)` are true, `containsY(256)` and
  `containsY(-1)` are false, `hasSkylight` is false, `ultrawarm` is false, `natural` is false, and
  `fixedTime` is 6000

### Requirement: the End registers through the dimension manager
Registering `END_DIMENSION_TYPE` in a 174 `DimensionManager` MUST store it under
`minecraft:the_end` with a fresh tick queue.

#### Scenario: manager integration
- **GIVEN** a fresh `DimensionManager`
- **WHEN** `registerDimension(END_DIMENSION_TYPE, world)` is called
- **THEN** `hasDimension('minecraft:the_end')` is true, its `type` is the End constant, and
  `tickAll(0)` yields an empty due list for it

### Requirement: the save namespace accepts the End key
`dimensionSaveNamespace('minecraft:the_end')` MUST return the key unchanged.

#### Scenario: End key pass-through
- **GIVEN** `minecraft:the_end`
- **THEN** `dimensionSaveNamespace` returns it unchanged

## Error and failure behavior
- None beyond 025's construction validation.

## Performance and resource bounds
- Module-load constant construction.

## Compatibility and migration
- One additive constant; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- No new untrusted-input surface.

## Observability
- The constant is a plain value.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 End fields | `tests/unit/EndDimensionType.test.ts` › fields |
| REQ-2 manager integration | › manager registration |
| REQ-3 save namespace | › namespace pass-through |
