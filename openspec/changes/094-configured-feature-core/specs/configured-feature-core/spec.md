# Spec: configured-feature-core

## Contract

`validateConfiguredFeatureConfig` MUST accept exactly the documented core configs
(`simpleBlock { blockId }`, `blockPatch { blockId; tries; radiusXZ; radiusY }` with positive
integer parameters) and MUST reject everything else with descriptive errors.
`ConfiguredFeatureRegistry` MUST store only validated definitions, reject duplicates and invalid
inputs atomically, and expose get/has/size/clear. `createDefaultConfiguredFeatures` MUST produce
the documented deterministic defaults.

## Definitions

- **simpleBlock**: places one block.
- **blockPatch**: scatters up to `tries` blocks within `radiusXZ` × `radiusY`.
- **Defaults**: `overworld/dirt_patch`, `overworld/gravel_patch` (both blockPatch).

## Invariants

- `blockId` is a non-negative integer; `tries`/`radiusXZ`/`radiusY` are positive integers.
- Unknown types and malformed fields throw.
- Registry operations never leave partial state.

## Requirements

### Requirement: config validation
`validateConfiguredFeatureConfig` MUST implement the documented acceptance rules.

#### Scenario: valid configs
- **GIVEN** a simpleBlock config and a blockPatch config with positive integers
- **WHEN** validation runs
- **THEN** both pass (narrowed).

#### Scenario: rejection matrix
- **GIVEN** unknown types, missing fields, zero/negative/fractional tries or radii, and negative
  block ids
- **WHEN** validation runs
- **THEN** it throws a descriptive error.

### Requirement: registry
`ConfiguredFeatureRegistry` MUST store validated features with atomic rejection.

#### Scenario: lifecycle
- **GIVEN** valid registrations
- **WHEN** register/get/has/size/clear run
- **THEN** lookups round-trip, size tracks registrations, and clear empties.

#### Scenario: atomic rejection
- **GIVEN** a duplicate key and an invalid config
- **WHEN** registration runs
- **THEN** it throws and the registry state is unchanged.

### Requirement: defaults
`createDefaultConfiguredFeatures` MUST produce the documented defaults deterministically.

#### Scenario: default registry
- **GIVEN** the default registry
- **WHEN** inspected
- **THEN** it contains the two documented blockPatch features with the documented parameters,
  and repeated construction yields equal registries.

### Requirement: determinism
Identical inputs MUST produce identical results.

#### Scenario: repeated validation
- **GIVEN** identical configs
- **WHEN** validation and registration run twice
- **THEN** results and registries are equal.

## Error and failure behavior

- Validation and registration throw descriptive errors; no partial state.

## Performance and resource bounds

Validation O(1); registry O(1) lookups.

## Compatibility and migration

Additive.

## Security and integrity

Not applicable.

## Observability

Features are plain validated data; tests assert exact values.

## Verification mapping

- `tests/unit/ConfiguredFeature.test.ts` — validation matrix, registry lifecycle/atomicity,
  defaults, determinism.
