# Spec: biome-expansion

## Contract
This capability adds the data-driven biome content expansion: validated definitions (climate,
category, feature combinations) grouped into a lookup-ready expansion over the biome/worldgen
registries — pure, headless-safe, registry-mutation-free.

## Definitions
- **Definition**: `{ id, name, temperature, precipitation, category, features }`.
- **Expansion**: `{ biomes }` — registration order preserved.

## Invariants
- Pure and headless-safe: no registry access, no mutation of inputs.
- Ids MUST be valid namespaced ids whose path does not start with `biome/`; `name` MUST be
  non-empty; `temperature` MUST be a finite number in [-2, 2] (default 0.5); `precipitation`
  MUST be one of `none|rain|snow` (default rain); `category` MUST be one of
  `plains|forest|desert|snowy|ocean|nether|end|mountain` (default plains); `features` MUST be
  non-empty strings (default []).
- Duplicate ids MUST be rejected; the whole payload validates before anything is accepted.

## Requirements

### Requirement: definition creation
`createBiomeDefinition(input)` MUST return a validated definition with the documented defaults.

#### Scenario: creation
- **GIVEN** a biome `minecraft:scorched_plains` with temperature 1.5, precipitation `none`,
  category `desert`, features `['minecraft:cactus']`; and a biome `minecraft:quiet_forest` with
  only a name
- **THEN** the first has temperature 1.5 and features `['minecraft:cactus']`; the second has
  temperature 0.5, precipitation `rain`, category `plains`, and features []

### Requirement: definition rejections
Construction MUST throw a descriptive `Error` for an invalid id, a `biome/`-prefixed id path,
an empty name, a temperature outside [-2, 2] or non-finite, an unknown precipitation, an unknown
category, and malformed features.

#### Scenario: rejections
- **GIVEN** ids `'Bad Id'` and `'minecraft:biome/stone'`; names `''`; temperatures -2.5, 3, NaN;
  precipitations `'hail'`; categories `'swamp'`; features `['']` and `[5]`
- **THEN** each throws mentioning `id must be a valid namespaced id`, `must not start with`,
  `name must be a non-empty string`, `temperature must be a finite number in [-2, 2]`,
  `precipitation must be none, rain, or snow`, `category must be one of`, and `features must be
  non-empty strings` respectively

### Requirement: expansion
`createBiomeExpansion(definitions)` MUST preserve registration order and MUST reject duplicate
ids; `biomeById(expansion, id)` MUST return the definition (string or ResourceId; undefined when
missing); `featuresFor(biome)` MUST return the feature ids.

#### Scenario: expansion
- **GIVEN** biomes `minecraft:a`, `minecraft:b`, and a duplicate `minecraft:a`
- **THEN** `biomes` is [a, b]; `biomeById(expansion, 'minecraft:b')` is b; `biomeById(expansion,
  'minecraft:nope')` is undefined; `featuresFor(a)` returns its feature list; the duplicate
  throws `duplicate biome id minecraft:a`; an empty expansion yields empty biomes

## Error and failure behavior
- Construction throws descriptively; nothing partially accepted. Lookups are total.

## Performance and resource bounds
- Lookups and grouping O(definitions).

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Security and integrity
- Pure functions; registry state is never touched by this module.

## Observability
- The expansion is a plain immutable object; lookups are introspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 creation | `tests/unit/BiomeExpansion.test.ts` › creation |
| REQ-2 rejections | › rejections |
| REQ-3 expansion | › expansion |
