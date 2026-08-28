# Spec: ore-generation

## Contract

`validateConfiguredFeatureConfig` MUST accept the documented `ore` config
(`blockId`, `size`, `discardChanceOnAirExposure`, `targetTags`) and MUST reject malformed ones
with descriptive errors. `OreBlockTagRegistry` MUST store only validated tags, reject duplicates
and invalid inputs atomically, and expose get/has/size/clear. `resolveOreTargetBlockIds` MUST
resolve `targetTags` deterministically (tag order, member order, first-occurrence dedupe) and
MUST throw on unknown tags. The default builders MUST produce the documented deterministic
tags, configured features, and placed features, and every default ore config's tags MUST resolve
through the default tag registry.

## Definitions

- **ore**: a configured feature that scatters up to `size` blocks of `blockId` inside blocks
  whose ids are members of `targetTags` (execution lands in later wiring);
  `discardChanceOnAirExposure` is the probability of discarding a vein exposed to air.
- **tag**: a named, ordered set of numeric block ids.
- Defaults: tags `overworld/stone_ore_replaceables` = `[3]` and
  `overworld/soil_ore_replaceables` = `[2, 11, 4]`; configured features `overworld/coal_ore`
  (blockId 14, size 17, discard 0) and `overworld/iron_ore` (blockId 15, size 9, discard 0),
  both targeting both tags; placed features `overworld/coal_ore`
  (`count 20`, `heightRange -64..192`) and `overworld/iron_ore`
  (`count 9`, `heightRange -64..72`).

## Invariants

- `blockId` is a non-negative integer; `size` a positive integer;
  `discardChanceOnAirExposure` a finite number in `[0, 1]`; `targetTags` a non-empty array of
  non-empty strings.
- Tag keys are non-empty; tag members are non-negative integers with no duplicates within a tag.
- Unknown types and malformed fields throw.
- Registry operations never leave partial state.
- Identical inputs MUST produce identical resolution results.

## Requirements

### Requirement: ore config validation
`validateConfiguredFeatureConfig` MUST accept exactly the documented ore shape.

#### Scenario: valid ore config
- **GIVEN** an ore config with a non-negative integer blockId, positive integer size, discard
  chance in `[0, 1]`, and non-empty string targetTags
- **WHEN** validation runs
- **THEN** it passes (narrowed to the `ore` member).

#### Scenario: rejection matrix
- **GIVEN** missing/negative/fractional blockId, zero/fractional size, discard chance below 0,
  above 1, NaN or non-numeric, and empty/blank/non-string targetTags
- **WHEN** validation runs
- **THEN** it throws a descriptive error naming the offending field.

### Requirement: tag validation and registry
`OreBlockTagRegistry` MUST store only validated tags with atomic rejection.

#### Scenario: lifecycle
- **GIVEN** valid tag registrations
- **WHEN** register/get/has/size/clear run
- **THEN** lookups round-trip, size tracks registrations, and clear empties.

#### Scenario: tag rejection matrix
- **GIVEN** an empty key, empty/negative/fractional/duplicate block ids
- **WHEN** registration runs
- **THEN** it throws a descriptive error and the registry state is unchanged.

#### Scenario: duplicate and invalid atomic rejection
- **GIVEN** a duplicate tag key and an invalid tag
- **WHEN** registration runs
- **THEN** it throws and the registry state is unchanged.

### Requirement: tag-driven resolution
`resolveOreTargetBlockIds` MUST resolve target tags deterministically.

#### Scenario: ordered union
- **GIVEN** tags with members in registration order
- **WHEN** resolution runs with `targetTags` in a given order
- **THEN** the result follows targetTags order and each tag's member order.

#### Scenario: deduplication
- **GIVEN** a block id present in two resolved tags
- **WHEN** resolution runs
- **THEN** the id appears once, at its first occurrence.

#### Scenario: unknown tag
- **GIVEN** a target tag not registered
- **WHEN** resolution runs
- **THEN** it throws a descriptive error naming the tag.

### Requirement: defaults
The default builders MUST produce the documented defaults deterministically.

#### Scenario: default tags
- **GIVEN** `createDefaultOreBlockTags`
- **WHEN** inspected
- **THEN** it contains exactly the two documented tags with the documented ids, and repeated
  construction yields equal registries.

#### Scenario: default configured features
- **GIVEN** `createDefaultOreConfiguredFeatures`
- **WHEN** inspected
- **THEN** it contains exactly the two documented ore features with the documented parameters,
  and repeated construction yields equal registries.

#### Scenario: default placed features
- **GIVEN** `createDefaultOrePlacedFeatures`
- **WHEN** inspected
- **THEN** it contains exactly the two documented placed features with the documented modifier
  chains (valid per 095 invariants), and repeated construction yields equal registries.

#### Scenario: default targets resolve
- **GIVEN** the default tag registry and every default ore configured feature
- **WHEN** each feature's targetTags are resolved
- **THEN** resolution succeeds and yields the documented block ids.

## Error and failure behavior

- Validation and registration throw descriptive errors; no partial state; unknown tags throw at
  resolution.

## Performance and resource bounds

Validation O(1) per config/tag; resolution O(total members); registry O(1) lookups.

## Compatibility and migration

Additive union member on the 094 extension point; 094 defaults and validations unchanged. One
094 test assertion switches its unknown-type stand-in from `ore` to `portal` because `ore`
became a real type.

## Security and integrity

Not applicable.

## Observability

All data is plain validated values; tests assert exact contents.

## Verification mapping

- `tests/unit/OreFeature.test.ts` — ore config validation matrix, tag validation matrix,
  registry lifecycle/atomicity, resolution order/dedupe/unknown-tag errors, defaults,
  cross-check of default target resolution.
- `tests/unit/ConfiguredFeature.test.ts` — updated unknown-type stand-in assertion.
