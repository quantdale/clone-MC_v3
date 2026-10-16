# Spec: aquifer-system

## Contract

`classifyAquifer(seed, x, y, z, config?)` MUST return a deterministic `WATER | LAVA | NONE`
decision per the documented table (above sea level → NONE; dryness noise above `dryThreshold` →
NONE; below `lavaLevel` → LAVA; otherwise WATER). `applyAquifers(column, carved, seed, config?,
ids?)` MUST return a new column with exactly the carved cells filled (water/lava ids) or left
air, preserving all other cells and never mutating its input. Identical inputs MUST produce
identical results.

## Definitions

- **Decision table**: `y >= seaLevel` → NONE; else
  `fbm3(dry, x·0.03, y·0.03, z·0.03) > dryThreshold` → NONE; else `y < lavaLevel` → LAVA; else
  WATER.
- **Defaults**: seaLevel 63, lavaLevel -54, dryThreshold 0.4.

## Invariants

- Decisions are pure and deterministic.
- `applyAquifers` writes only carved cells.
- Config validation: finite `dryThreshold`, integers `seaLevel`/`lavaLevel`, `lavaLevel <
  seaLevel`.

## Requirements

### Requirement: classification
`classifyAquifer` MUST implement the decision table.

#### Scenario: exact table with dryness forced off
- **GIVEN** `dryThreshold = 1.1` (fbm never exceeds it)
- **WHEN** cells above sea level, between lavaLevel and seaLevel, and below lavaLevel are
  classified
- **THEN** they are NONE, WATER, LAVA.

#### Scenario: dryness forced on
- **GIVEN** `dryThreshold = -2` (fbm always exceeds it)
- **WHEN** a below-sea cell is classified
- **THEN** it is NONE.

#### Scenario: default config
- **GIVEN** the default config
- **WHEN** cells are classified twice
- **THEN** decisions are equal, deterministic, and always in {WATER, LAVA, NONE}.

### Requirement: application
`applyAquifers` MUST fill exactly the carved cells.

#### Scenario: fill and preserve
- **GIVEN** a terrain column and its carve mask with dryness forced off
- **WHEN** application runs
- **THEN** carved cells below sea hold the water id (deep ones the lava id), carved cells above
  sea are air, non-carved cells are unchanged, and the input column is untouched.

### Requirement: config validation
Invalid configs MUST throw.

#### Scenario: bad configs
- **GIVEN** non-finite `dryThreshold`, non-integer levels, or `lavaLevel >= seaLevel`
- **WHEN** classification or application runs
- **THEN** it throws a descriptive error.

### Requirement: determinism
Identical inputs MUST produce identical results.

#### Scenario: repeated runs
- **GIVEN** fixed seed, column, and mask
- **WHEN** application runs twice
- **THEN** results are deeply equal.

## Error and failure behavior

- Invalid configs throw; classification/application are otherwise total.

## Performance and resource bounds

Classification O(1); application O(carved cells).

## Compatibility and migration

Additive.

## Security and integrity

Not applicable.

## Observability

Decisions are plain strings; tests assert exact fills.

## Verification mapping

- `tests/unit/AquiferSystem.test.ts` — exact tables (dryness forced off/on), default-config
  determinism, applyAquifers fill/preserve/purity, config validation.
