# Spec: climate-sampler

## Contract

`ClimateSampler(worldSeed)` MUST deterministically sample five MC-like climate fields at (x, z) —
temperature, humidity, continentalness, erosion, weirdness — each in [-1, 1], each from its own
seed-derived noise field. Identical (seed, x, z) MUST produce identical samples; different seeds
MUST (almost surely) produce differing fields. `validateClimateSample` MUST accept exactly finite
in-range values. `climateDistance(a, b)` MUST be the Euclidean distance over the five fields.

## Definitions

- **Field formula**: `clamp(fbm4(noise_i, x·scale_i, 0, z·scale_i), -1, 1)` where `noise_i` is
  derived from the seed with a distinct deterministic offset and `scale_i` is the documented
  per-field scale.
- **Scales**: temperature 0.002, humidity 0.003, continentalness 0.001, erosion 0.005,
  weirdness 0.007. fbm defaults: 4 octaves, lacunarity 2, gain 0.5.

## Invariants

- Every field ∈ [-1, 1].
- Fields are independent (separate noise instances).
- Sampling is 2D and pure.
- `climateDistance(a, b) = sqrt(Σ (a_i - b_i)²)`.

## Requirements

### Requirement: determinism
Identical (seed, x, z) MUST produce identical samples.

#### Scenario: repeated sampling
- **GIVEN** a seed and coordinates
- **WHEN** sampling runs twice (same and fresh instances)
- **THEN** the samples are deeply equal.

### Requirement: range
All five fields MUST be in [-1, 1] across positions.

#### Scenario: grid range
- **GIVEN** a sampler
- **WHEN** a grid of positions is sampled
- **THEN** every field of every sample is in [-1, 1].

### Requirement: seed sensitivity
Different seeds MUST produce differing fields.

#### Scenario: seed change
- **GIVEN** two seeds
- **WHEN** the same position is sampled
- **THEN** at least one field differs.

### Requirement: validation
`validateClimateSample` MUST accept exactly the valid shape.

#### Scenario: valid and invalid
- **GIVEN** in-range finite samples and samples with out-of-range or non-finite fields
- **WHEN** validation runs
- **THEN** valid samples pass and invalid ones throw naming the field.

### Requirement: distance
`climateDistance` MUST be Euclidean over the five fields.

#### Scenario: metric properties
- **GIVEN** samples a, b, c with a === b
- **WHEN** distances are computed
- **THEN** `climateDistance(a, b)` is 0, `climateDistance(a, c)` equals `climateDistance(c, a)`,
  and hand-computed values match.

## Error and failure behavior

- Validation throws descriptive errors; sampling is total.

## Performance and resource bounds

Each sample = 5 fbm evaluations; O(1).

## Compatibility and migration

Additive.

## Security and integrity

Not applicable.

## Observability

Samples are plain values; tests assert ranges and determinism.

## Verification mapping

- `tests/unit/ClimateSampler.test.ts` — determinism, range, seed sensitivity, positional
  variation, distance metric, validation matrix.
