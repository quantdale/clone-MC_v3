# Spec: biomes

## Contract

`biomes` defines ResourceId-identified biome types with category, temperature, precipitation,
and grass/foliage/water/fog colors, a `BiomeRegistry` on the 003 generic `Registry`, and default
biome types. No gameplay/storage migration is included.

## Definitions

- **BiomeCategory**: `OCEAN` | `PLAINS` | `DESERT` | `EXTREME_HILLS` | `FOREST` | `TAIGA` |
  `SWAMP` | `RIVER` | `SNOWY_TUNDRA` | `JUNGLE` | `MUSHROOM`.
- **BiomePrecipitation**: `NONE` | `RAIN` | `SNOW`.
- **BiomeColor**: a 24-bit RGB color packed as `0xRRGGBB` (integer in `[0, 0xFFFFFF]`).
- **BiomeTypeDefinition**: immutable data describing one biome.

## Invariants

- `category` MUST be a known `BiomeCategory`.
- `precipitation` MUST be a known `BiomePrecipitation`.
- `temperature` MUST be finite and within `[-2, 5]`.
- `grassColor` and `foliageColor` MUST be integers in `[0, 0xFFFFFF]`; optional `waterColor` and
  `fogColor` MUST also be integers in `[0, 0xFFFFFF]` when present.
- A biome with `precipitation: 'SNOW'` MUST have `temperature <= 0.15`.
- Registry ids MUST be unique.

## Requirements

### Requirement: registry construction validates and finalizes biome types
The registry MUST validate every definition (unique id, known category/precipitation, finite
bounded temperature, valid colors, snow/temperature consistency) and finalize before lookup.

#### Scenario: accepts the default biome set
- **GIVEN** `createDefaultBiomeRegistry()`
- **WHEN** `size` is read
- **THEN** it equals 10 and `finalized` is true

#### Scenario: rejects an out-of-range temperature
- **GIVEN** a definition with `temperature: 9`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-value error

#### Scenario: rejects an out-of-range color
- **GIVEN** a definition with `grassColor: 0x1FFFFFF`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-value error

#### Scenario: rejects an unknown category
- **GIVEN** a definition with `category: 'NOPE'`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-flag error

### Requirement: snow biomes must be cold enough
A biome with `precipitation: 'SNOW'` MUST have `temperature <= 0.15`; otherwise construction MUST
fail.

#### Scenario: warm snow biome is rejected
- **GIVEN** a definition with `precipitation: 'SNOW'` and `temperature: 0.8`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-definition error

### Requirement: default biome types encode category, temperature, precipitation, and colors
The default registry MUST contain representative biomes with correct category, temperature,
precipitation, and grass/foliage colors, and MUST reject duplicate ids.

#### Scenario: snowy_tundra is a cold snow biome
- **GIVEN** `createDefaultBiomeRegistry()`
- **WHEN** the `snowy_tundra` type is read
- **THEN** it has `category` SNOWY_TUNDRA, `precipitation` SNOW, `temperature` 0.0, and a valid
  `grassColor`

#### Scenario: duplicate ids are rejected
- **GIVEN** two definitions sharing the same `id`
- **WHEN** the registry is constructed
- **THEN** construction throws with a duplicate-id error

### Requirement: color pack/unpack helpers round-trip
`biomeColorFromRGB` and `biomeColorToRGB` MUST be inverse operations over the 24-bit color space.

#### Scenario: round-trips a packed color
- **GIVEN** a color `0x7cbd6b`
- **WHEN** it is unpacked then repacked
- **THEN** the result equals the original

## Error and failure behavior

Invalid definitions MUST throw at construction (atomic). Duplicate ids MUST be rejected.

## Performance and resource bounds

Registry lookup O(1) via the 003 core; one-pass validation at construction; color helpers O(1).

## Compatibility and migration

Purely additive data; no persisted or call-site changes.

## Security and integrity

Definitions are static data; no runtime external input flows into biome parameters.

## Observability

The registry exposes typed biome metadata for future generation and coloring consumers.

## Verification mapping

- Registry/instance validation, defaults, consistency, color helpers -> `tests/unit/Biome.test.ts`
- Full gate -> typecheck, lint, unit, build, e2e
