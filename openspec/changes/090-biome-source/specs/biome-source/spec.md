# Spec: biome-source

## Contract

`biomeClimateTargets(biome)` MUST derive a five-field climate target deterministically from the
016 definition (temperature mapped as `clamp(temperature / 2.5, -1, 1)`; humidity, continentalness,
erosion from the documented category table; weirdness 0). `BiomeSource(seed, registry, sampler?)`
MUST select the registry biome whose target minimizes `climateDistance(sample, target)`, breaking
ties by lowest registration order, using the injected sampler (default `ClimateSampler(seed)`).
Identical (seed, coords) MUST produce identical selections; only registry biomes MUST be returned.

## Definitions

- **Target**: the `ClimateSample` derived by `biomeClimateTargets`.
- **Selection**: argmin over registry biomes of climate distance; ties → lowest registration
  index.

## Invariants

- Temperature mapping: `clamp(t / 2.5, -1, 1)`.
- Category tables are exactly as documented in the design.
- Weirdness is always 0.
- Selection is deterministic and registry-bound.

## Requirements

### Requirement: target derivation
`biomeClimateTargets` MUST implement the documented mapping.

#### Scenario: hand-computed biomes
- **GIVEN** plains (temperature 0.8, PLAINS), desert (2.0, DESERT), ocean (0.5, OCEAN),
  snowy_tundra (0.0, SNOWY_TUNDRA)
- **WHEN** targets are derived
- **THEN** temperatures are 0.32, 0.8, 0.2, 0; humidities are 0.3, -0.9, 0.9, 0.2;
  continentalness matches the table; weirdness is 0.

### Requirement: selection
`getBiome` MUST return the nearest-target registry biome.

#### Scenario: exact target
- **GIVEN** an injected sampler returning exactly plains' target
- **WHEN** `getBiome(x, z)` runs
- **THEN** the plains biome is returned.

#### Scenario: nearest target
- **GIVEN** an injected sampler returning a sample midway between two targets
- **WHEN** `getBiome(x, z)` runs
- **THEN** the closer biome is returned.

#### Scenario: tie-break
- **GIVEN** two biomes with identical targets
- **WHEN** `getBiome(x, z)` runs
- **THEN** the earlier-registered biome is returned.

### Requirement: determinism
Identical (seed, coords) MUST produce identical selections.

#### Scenario: repeated queries
- **GIVEN** a seed and coordinates
- **WHEN** selection runs twice
- **THEN** the biome keys are equal.

### Requirement: registry bound
The source MUST never return a biome outside the registry.

#### Scenario: registry-only
- **GIVEN** any position
- **WHEN** selection runs
- **THEN** the returned biome is one of the registry's entries.

## Error and failure behavior

None beyond 016 registry invariants.

## Performance and resource bounds

Selection = 1 sample + O(biomes) distances; targets cached at construction.

## Compatibility and migration

Additive; 016/089 untouched.

## Security and integrity

Not applicable.

## Observability

Biome keys are plain strings; tests assert exact selections.

## Verification mapping

- `tests/unit/BiomeSource.test.ts` — target mapping, exact/nearest/tie selections with an
  injected sampler, determinism, registry bound.
