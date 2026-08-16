# Spec: structure-expansion

## Contract
This capability adds the data-driven structure content expansion: validated definitions pairing
template ids with placement rules (biome categories, spacing, separation, rarity, y-range),
grouped into a lookup-ready expansion over 099-101's structure systems — pure, headless-safe,
registry-mutation-free.

## Definitions
- **Definition**: `{ id, name, template, placement }`.
- **Placement**: `{ biomeCategories, spacing, separation, rarity, yRange }`.
- **Expansion**: `{ structures }` — registration order preserved.

## Invariants
- Pure and headless-safe: no registry access, no template parsing, no mutation of inputs.
- Ids MUST be valid namespaced ids whose path does not start with `structure/`; `name` and
  `template` MUST be non-empty strings.
- `biomeCategories` MUST be non-empty known categories; `spacing` MUST be a positive integer;
  `separation` MUST be an integer in [0, spacing) (default 0); `rarity` MUST be a finite number
  in (0, 1] (default 1); `yRange` MUST be an integer `[min, max]` pair with min <= max.
- Duplicate ids MUST be rejected; the whole payload validates before anything is accepted.

## Requirements

### Requirement: definition creation
`createStructureDefinition(input)` MUST return a validated definition with the documented
defaults.

#### Scenario: creation
- **GIVEN** a structure `minecraft:ruined_library` with template `templates/library`, categories
  `['plains', 'forest']`, spacing 24, separation 4, rarity 0.5, yRange [40, 80]; and a structure
  `minecraft:small_shrine` with only categories `['plains']`, spacing 16, yRange [30, 60]
- **THEN** the first has rarity 0.5 and separation 4; the second has rarity 1 and separation 0

### Requirement: definition rejections
Construction MUST throw a descriptive `Error` for an invalid id, a `structure/`-prefixed id
path, an empty name, an empty template, empty/unknown biome categories, a non-positive or
non-integer spacing, a separation outside [0, spacing), a rarity outside (0, 1] or non-finite,
and a yRange that is not an integer `[min, max]` pair with min <= max.

#### Scenario: rejections
- **GIVEN** ids `'Bad Id'` and `'minecraft:structure/hut'`; names `''`; templates `''`;
  categories `[]` and `['swamp']`; spacings 0 and 1.5; separations -1 and 24 (spacing 16);
  rarities 0, 1.5, NaN; yRanges `[80, 40]`, `[30, 30.5]`, `[30, 'x']`
- **THEN** each throws mentioning `id must be a valid namespaced id`, `must not start with`,
  `name must be a non-empty string`, `template must be a non-empty string`,
  `biomeCategories must not be empty` / `must be known biome categories`, `spacing must be a
  positive integer`, `separation must be an integer in [0, spacing)`, `rarity must be a finite
  number in (0, 1]`, and `yRange must be an integer [min, max] pair with min <= max`
  respectively

### Requirement: expansion
`createStructureExpansion(definitions)` MUST preserve registration order and MUST reject
duplicate ids; `structureById(expansion, id)` MUST return the definition (string or ResourceId;
undefined when missing); `structuresInCategory(expansion, category)` MUST return the structures
placeable in the category, in registration order.

#### Scenario: expansion
- **GIVEN** structures `minecraft:a` (categories [plains, forest]) and `minecraft:b`
  (categories [desert]), and a duplicate `minecraft:a`
- **THEN** `structures` is [a, b]; `structureById(expansion, 'minecraft:b')` is b;
  `structureById(expansion, 'minecraft:nope')` is undefined; `structuresInCategory(expansion,
  'plains')` is [a]; `structuresInCategory(expansion, 'desert')` is [b]; the duplicate throws
  `duplicate structure id minecraft:a`; an empty expansion yields empty structures

## Error and failure behavior
- Construction throws descriptively; nothing partially accepted. Lookups are total.

## Performance and resource bounds
- Lookups and grouping O(structures).

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Security and integrity
- Pure functions; registry state is never touched by this module.

## Observability
- The expansion is a plain immutable object; lookups are introspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 creation | `tests/unit/StructureExpansion.test.ts` › creation |
| REQ-2 rejections | › rejections |
| REQ-3 expansion | › expansion |
