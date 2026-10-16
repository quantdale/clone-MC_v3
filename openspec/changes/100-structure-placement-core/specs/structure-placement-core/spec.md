# Spec: structure-placement-core

## Contract

`validateStructurePlacementConfig` MUST accept exactly the documented config shape and MUST
reject malformed ones with descriptive errors. `structureStartAtChunk` MUST return the
structure start for a chunk deterministically per the documented region/offset/draw/gate rules,
or null otherwise. `StructurePlacementRegistry` MUST store only validated configs, reject
duplicates and invalid inputs atomically, and expose get/has/size/clear.

## Definitions

- **PlacementConfig**: key + templateKey + `spacing` (region size in chunks, positive) +
  `separation` (int in `[0, spacing)`) + `salt` (non-negative int) + `biomeKeys` (non-empty
  strings) + `minSurfaceHeight` (int).
- **Region**: `(floor(cx / spacing), floor(cz / spacing))` (floor division, so negative chunks
  work).
- **Start chunk**: `regionX * spacing + offsetX`, `regionZ * spacing + offsetZ`, where each
  offset is drawn uniformly from `[0, spacing - separation)` by
  `SeedRng(hash3(regionX, salt, regionZ, seed))`; draw order is fixed: offsetX, offsetZ,
  rotation (`nextInt(4) * 90`).
- **Gates**: a start exists only when the queried chunk equals the start chunk, the biome at
  the start chunk center (`(chunkX * 16 + 8, chunkZ * 16 + 8)`) is in `biomeKeys`, and
  `surfaceY` at that center is >= `minSurfaceHeight`.
- **StructureStart**: configKey, templateKey, start chunk coords, rotation (0/90/180/270),
  mirror ('none' in 100).

## Invariants

- Config field rules as documented; unknown shapes throw.
- Identical `(config, ctx, chunk, seed)` MUST produce identical results.
- Starts in adjacent regions are at least `separation` chunks apart per axis.
- Registry operations never leave partial state.

## Requirements

### Requirement: config validation
`validateStructurePlacementConfig` MUST implement the documented acceptance rules.

#### Scenario: valid config
- **GIVEN** a config with valid fields
- **WHEN** validation runs
- **THEN** it passes (narrowed).

#### Scenario: rejection matrix
- **GIVEN** an empty key/templateKey, zero/negative/fractional spacing, separation below 0 or
  >= spacing, negative salt, empty/blank biomeKeys, and non-integer minSurfaceHeight
- **WHEN** validation runs
- **THEN** it throws a descriptive error naming the offending field.

### Requirement: deterministic placement
`structureStartAtChunk` MUST implement the documented rules.

#### Scenario: determinism
- **GIVEN** an identical config, context, chunk and seed
- **WHEN** the query runs twice
- **THEN** the results are identical.

#### Scenario: offsets and rotation
- **GIVEN** a config with spacing 8, separation 3 and a fixed seed
- **WHEN** start chunks are computed for every region over a sweep
- **THEN** offsets lie in `[0, 5)` per axis and rotations are multiples of 90, with exact
  values matching the documented draw order for known regions.

#### Scenario: only the start chunk matches
- **GIVEN** a region's computed start chunk
- **WHEN** every chunk of the region is queried
- **THEN** exactly the start chunk returns a start.

#### Scenario: negative regions
- **GIVEN** negative chunk coordinates
- **WHEN** the query runs
- **THEN** floor division yields the correct region and consistent starts.

#### Scenario: separation
- **GIVEN** adjacent regions
- **WHEN** their start chunks are compared per axis
- **THEN** the distance is >= `separation` chunks.

#### Scenario: biome gate
- **GIVEN** a matching and a non-matching biome at the start center
- **WHEN** the query runs
- **THEN** only the matching biome yields a start.

#### Scenario: terrain gate
- **GIVEN** surface heights below, at, and above `minSurfaceHeight` at the start center
- **WHEN** the query runs
- **THEN** below yields null and at/above yield a start.

### Requirement: registry
`StructurePlacementRegistry` MUST store validated configs with atomic rejection.

#### Scenario: lifecycle
- **GIVEN** valid registrations
- **WHEN** register/get/has/size/clear run
- **THEN** lookups round-trip, size tracks registrations, and clear empties.

#### Scenario: atomic rejection
- **GIVEN** a duplicate key and an invalid config
- **WHEN** registration runs
- **THEN** it throws and the registry state is unchanged.

## Error and failure behavior

- Validation and registration throw descriptive errors; no partial state.

## Performance and resource bounds

Query O(1): one region hash, up to 3 draws, two gates.

## Compatibility and migration

Additive.

## Security and integrity

Not applicable.

## Observability

Plain data; tests assert exact starts.

## Verification mapping

- `tests/unit/StructurePlacement.test.ts` — validation matrix, determinism, exact vectors,
  boundary/negative regions, separation, biome/terrain gates, registry lifecycle/atomicity.
