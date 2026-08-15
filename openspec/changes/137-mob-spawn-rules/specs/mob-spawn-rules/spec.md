# Spec: mob-spawn-rules

## Contract
This capability adds four independent, pure spawn-eligibility predicates (distance, biome, light,
block/clearance) per `EntityCategory`, plus `canSpawn` combining all four. No spawn cycle/caps
(138), no mob instantiation, and no `Game`/`World` wiring — see the proposal's Non-goals.

## Definitions
- **Category**: an 017 `EntityCategory` (`MONSTER`, `CREATURE`, `AMBIENT`, `WATER_CREATURE`,
  `WATER_AMBIENT`, `PROJECTILE`, `OTHER`).
- **Water category**: `WATER_CREATURE` or `WATER_AMBIENT`.
- **Land category**: `MONSTER`, `CREATURE`, or `AMBIENT`.
- **Light level**: `lightLevelAt(world, x, y, z) = max(clamp(skyLight, 0, 15), clamp(blockLight, 0,
  15))`.
- **Water biome**: a `BiomeTypeDefinition` whose `category` is `OCEAN` or `RIVER`.
- **Spawn world**: the minimal access a caller supplies (`getBlockId`, `getCollisionShape`,
  `getSkyLight`, `getBlockLight`).

## Invariants
- Every predicate returns `false`, never throws, for any category that is neither a water category
  nor a land category (in particular `PROJECTILE` and `OTHER`).
- `lightLevelAt` always returns a value in `[0, 15]` regardless of what a `SpawnWorld` implementation
  returns for sky/block light.
- `canSpawn` is `true` if and only if all four sub-predicates are `true` for the same inputs.

## Requirements

### Requirement: isValidSpawnDistance bounds distance to [MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE]
`isValidSpawnDistance(distanceBlocks)` MUST return `true` for `distanceBlocks` in
`[MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE]` inclusive, and `false` outside that range.

#### Scenario: boundary and out-of-range distances
- **GIVEN** distances just below, at, within, at, and just above the bounds
- **WHEN** `isValidSpawnDistance` is called on each
- **THEN** it is `false` below `MIN_SPAWN_DISTANCE`, `true` at both bounds and in between, and
  `false` above `MAX_SPAWN_DISTANCE`

### Requirement: isValidSpawnBiome partitions water vs. land categories by biome water-ness
`isValidSpawnBiome(category, biome)` MUST return `true` for a water category exactly when `biome` is
a water biome, `true` for a land category exactly when `biome` is not a water biome, and `false` for
any other category regardless of biome.

#### Scenario: water categories require a water biome, land categories require a non-water biome
- **GIVEN** an `OCEAN` biome and a `PLAINS` biome
- **WHEN** `isValidSpawnBiome('WATER_CREATURE', oceanBiome)`, `isValidSpawnBiome('WATER_CREATURE',
  plainsBiome)`, `isValidSpawnBiome('MONSTER', plainsBiome)`, and `isValidSpawnBiome('MONSTER',
  oceanBiome)` are called
- **THEN** the results are `true`, `false`, `true`, `false` respectively

#### Scenario: OTHER and PROJECTILE are never a valid spawn biome
- **GIVEN** any biome
- **WHEN** `isValidSpawnBiome('OTHER', biome)` and `isValidSpawnBiome('PROJECTILE', biome)` are
  called
- **THEN** both return `false`

### Requirement: isValidSpawnLight applies category-specific light thresholds
`isValidSpawnLight(category, world, x, y, z)` MUST return `true` for a water category regardless of
light. For `MONSTER`/`AMBIENT` it MUST return `true` exactly when `lightLevelAt(...) <=
MONSTER_MAX_LIGHT`. For `CREATURE` it MUST return `true` exactly when `lightLevelAt(...) >=
CREATURE_MIN_LIGHT`. For any other category it MUST return `false`.

#### Scenario: monster/ambient light threshold
- **GIVEN** a cell at light level `MONSTER_MAX_LIGHT` and one at `MONSTER_MAX_LIGHT + 1`
- **WHEN** `isValidSpawnLight('MONSTER', ...)` is called on each
- **THEN** the results are `true` and `false` respectively

#### Scenario: creature light threshold
- **GIVEN** a cell at light level `CREATURE_MIN_LIGHT` and one at `CREATURE_MIN_LIGHT - 1`
- **WHEN** `isValidSpawnLight('CREATURE', ...)` is called on each
- **THEN** the results are `true` and `false` respectively

#### Scenario: water categories are light-independent
- **GIVEN** a cell at light level `0`
- **WHEN** `isValidSpawnLight('WATER_CREATURE', ...)` is called
- **THEN** it returns `true`

### Requirement: isValidSpawnBlock delegates to canStandAt for land categories and requires water for water categories
`isValidSpawnBlock(category, world, x, y, z, height)` MUST return `true` for a land category exactly
when `canStandAt(world, x, y, z, height)` (134) is `true`, and `true` for a water category exactly
when the block at `(x, y, z)` is `BlockId.Water`. For any other category it MUST return `false`.

#### Scenario: a land category matches canStandAt exactly
- **GIVEN** a standable cell and an obstructed cell (per 134's fixtures)
- **WHEN** `isValidSpawnBlock('MONSTER', ...)` is called on each
- **THEN** the results match `canStandAt`'s own results for the same cells

#### Scenario: a water category requires an actual water block
- **GIVEN** a water cell and an air cell
- **WHEN** `isValidSpawnBlock('WATER_CREATURE', ...)` is called on each
- **THEN** the results are `true` and `false` respectively

### Requirement: canSpawn is the exact conjunction of all four predicates
`canSpawn(category, world, biome, x, y, z, distanceBlocks, height)` MUST return `true` if and only if
`isValidSpawnDistance`, `isValidSpawnBiome`, `isValidSpawnLight`, and `isValidSpawnBlock` all return
`true` for the same inputs.

#### Scenario: one failing predicate fails the whole check
- **GIVEN** inputs where distance/biome/block all pass but light fails (too bright for a monster)
- **WHEN** `canSpawn('MONSTER', ...)` is called
- **THEN** it returns `false`

#### Scenario: all four passing yields true
- **GIVEN** inputs where distance, biome, light, and block all independently pass for `MONSTER`
- **WHEN** `canSpawn('MONSTER', ...)` is called
- **THEN** it returns `true`

## Error and failure behavior
- No function in this module throws for a well-formed `SpawnWorld`/`BiomeTypeDefinition` and finite
  numeric inputs. An unrecognized category value falls through to `false` in every predicate rather
  than throwing.

## Performance and resource bounds
- Every predicate is O(1) except `isValidSpawnBlock`'s land-category path, which is O(height) via
  `canStandAt` (134's existing bound).

## Compatibility and migration
- One new, additive file (`src/simulation/MobSpawnRules.ts`); no edits to any existing module. No
  schema/save-format change; no migration.

## Security and integrity
- `lightLevelAt` clamps both light sources into `[0, 15]` before combining, so a malformed
  `SpawnWorld` implementation returning an out-of-range value can never produce an out-of-range
  result.

## Observability
- Each of the four predicates is independently callable, so a caller can determine exactly which
  dimension rejected a candidate.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 isValidSpawnDistance bounds | `tests/unit/MobSpawnRules.test.ts` distance cases |
| REQ-2 isValidSpawnBiome partitions water/land/other | `tests/unit/MobSpawnRules.test.ts` biome cases |
| REQ-3 isValidSpawnLight category thresholds | `tests/unit/MobSpawnRules.test.ts` light cases |
| REQ-4 isValidSpawnBlock delegates/requires water | `tests/unit/MobSpawnRules.test.ts` block cases |
| REQ-5 canSpawn is the exact conjunction | `tests/unit/MobSpawnRules.test.ts` canSpawn cases |
