# Spec: mob-expansion

## Contract
This capability adds the data-driven mob content expansion: validated definitions (category,
archetype, stats, spawn data) grouped into a lookup-ready expansion over 129-146's entity/AI
primitives — pure, headless-safe, registry-mutation-free.

## Definitions
- **Definition**: `{ id, name, category, archetype, health, speed, hostileToPlayer, spawns }`.
- **Spawn data**: `{ biomes, weight, packSize }`.
- **Expansion**: `{ mobs }` — registration order preserved.

## Invariants
- Pure and headless-safe: no registry access, no entity/AI code, no mutation of inputs.
- Ids MUST be valid namespaced ids whose path does not start with `mob/`; `name` MUST be
  non-empty; `category` MUST be one of `passive|hostile|neutral|utility`; `archetype` MUST be one
  of `melee|ranged|wanderer` (default wanderer); `health` MUST be a positive integer; `speed`
  MUST be a finite number > 0; `hostileToPlayer` MUST be a boolean (default `category ===
  'hostile'`).
- `spawns.biomes` MUST be non-empty known categories; `spawns.weight` MUST be a positive
  integer; `spawns.packSize` MUST be a positive-integer `[min, max]` pair with min <= max.
- Duplicate ids MUST be rejected; the whole payload validates before anything is accepted.

## Requirements

### Requirement: definition creation
`createMobDefinition(input)` MUST return a validated definition with the documented defaults.

#### Scenario: creation
- **GIVEN** a hostile mob `minecraft:blaze_alt` with archetype melee, health 40, speed 0.6,
  spawns [nether], weight 10, packSize [1, 3]; and a passive mob `minecraft:cow_alt` with only
  health 10, speed 0.2, spawns [plains], weight 8, packSize [1, 4]
- **THEN** the first has archetype melee and hostileToPlayer true; the second has archetype
  wanderer and hostileToPlayer false

### Requirement: definition rejections
Construction MUST throw a descriptive `Error` for an invalid id, a `mob/`-prefixed id path, an
empty name, an unknown category, an unknown archetype, a non-positive or non-integer health, a
non-finite or non-positive speed, a non-boolean hostileToPlayer, empty/unknown spawn biomes, a
non-positive or non-integer spawn weight, and an invalid packSize.

#### Scenario: rejections
- **GIVEN** ids `'Bad Id'` and `'minecraft:mob/creeper'`; names `''`; categories `'boss'`;
  archetypes `'flyer'`; healths 0 and 1.5; speeds 0 and NaN; hostileToPlayer `'yes'`; biomes
  `[]` and `['swamp']`; weights 0 and 2.5; packSizes `[3, 1]`, `[1, 0]`, `[1, 1.5]`
- **THEN** each throws mentioning `id must be a valid namespaced id`, `must not start with`,
  `name must be a non-empty string`, `category must be passive, hostile, neutral, or utility`,
  `archetype must be melee, ranged, or wanderer`, `health must be a positive integer`,
  `speed must be a finite number > 0`, `hostileToPlayer must be a boolean`,
  `spawns.biomes must not be empty` / `must be known biome categories`, `spawns.weight must be a
  positive integer`, and `spawns.packSize must be a positive integer [min, max] pair with min <=
  max` respectively

### Requirement: expansion
`createMobExpansion(definitions)` MUST preserve registration order and MUST reject duplicate
ids; `mobById(expansion, id)` MUST return the definition (string or ResourceId; undefined when
missing); `mobsByCategory(expansion, category)` MUST return the category's mobs in order;
`mobsInBiome(expansion, category)` MUST return the mobs spawning in the biome category, in
order.

#### Scenario: expansion
- **GIVEN** mobs `minecraft:a` (hostile, spawns [nether]) and `minecraft:b` (passive, spawns
  [plains]), and a duplicate `minecraft:a`
- **THEN** `mobs` is [a, b]; `mobById(expansion, 'minecraft:b')` is b; `mobById(expansion,
  'minecraft:nope')` is undefined; `mobsByCategory(expansion, 'hostile')` is [a];
  `mobsInBiome(expansion, 'plains')` is [b]; the duplicate throws `duplicate mob id
  minecraft:a`; an empty expansion yields empty mobs

## Error and failure behavior
- Construction throws descriptively; nothing partially accepted. Lookups are total.

## Performance and resource bounds
- Lookups and grouping O(mobs).

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Security and integrity
- Pure functions; registry state is never touched by this module.

## Observability
- The expansion is a plain immutable object; lookups are introspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 creation | `tests/unit/MobExpansion.test.ts` › creation |
| REQ-2 rejections | › rejections |
| REQ-3 expansion | › expansion |
