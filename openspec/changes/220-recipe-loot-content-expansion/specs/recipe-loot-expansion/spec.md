# Spec: recipe-loot-expansion

## Contract
This capability adds the data-driven recipe/loot content expansion: validated crafting/
processing/brewing recipes and source-based loot tables, grouped into a lookup-ready expansion
over 103/110's systems — pure, headless-safe, registry-mutation-free.

## Definitions
- **Recipe**: `{ id, name?, output, count, ingredients, category }`.
- **Loot**: `{ id, source, drops }` with drops `{ item, weight, count: [min, max] }`.
- **Expansion**: `{ recipes, loot }` — registration order preserved per kind.

## Invariants
- Pure and headless-safe: no registry access, no mutation of inputs.
- Ids MUST be valid namespaced ids whose path does not start with the kind's prefix (`recipe/`,
  `loot/`); `name` (when present) MUST be non-empty; `output`/`ingredients`/`source`/drop items
  MUST be non-empty strings; `count` MUST be a positive integer (default 1); `category` MUST be
  one of `crafting|smelting|brewing` (default crafting); drop `weight` MUST be a positive
  integer; drop `count` MUST be a positive-integer `[min, max]` pair with min <= max.
- Per-kind duplicate ids MUST be rejected; the whole payload validates before anything is
  accepted.

## Requirements

### Requirement: definition creation
`createRecipeDefinition(input)` and `createLootDefinition(input)` MUST return validated
definitions with the documented defaults.

#### Scenario: creation
- **GIVEN** a recipe `minecraft:planks_alt` with output `minecraft:planks`, count 4,
  ingredients `['minecraft:wood']`, category crafting; a recipe `minecraft:ingot_alt` with only
  output `minecraft:iron_ingot` and ingredients `['minecraft:iron_ore']`; and a loot
  `minecraft:zombie_alt` with source `minecraft:zombie` and drops
  `[{ item: 'minecraft:rotten_flesh', weight: 10, count: [1, 3] }]`
- **THEN** planks_alt has count 4; ingot_alt has count 1 and category crafting; the loot
  definition carries the drop

### Requirement: definition rejections
Construction MUST throw a descriptive `Error` for invalid ids, prefixed id paths, an empty
`name` when present, an empty `output`, a non-positive or non-integer `count`, empty or
malformed `ingredients`, an unknown `category`, an empty `source`, empty `drops`, and per-drop
violations.

#### Scenario: rejections
- **GIVEN** ids `'Bad Id'` and `'minecraft:recipe/planks'` / `'minecraft:loot/chest'`; names
  `''`; outputs `''`; counts 0 and 1.5; ingredients `[]` and `['']`; categories `'enchanting'`;
  sources `''`; drops `[]`; drop items `''`; weights 0 and 1.5; counts `[3, 1]`, `[1, 0]`,
  `[1, 1.5]`
- **THEN** each throws mentioning `id must be a valid namespaced id`, `must not start with`,
  `name must be a non-empty string when present`, `output must be a non-empty string`,
  `count must be a positive integer`, `ingredients must not be empty` / `must be non-empty
  strings`, `category must be crafting, smelting, or brewing`, `source must be a non-empty
  string`, `drops must not be empty`, `drops <i>.item must be a non-empty string`,
  `drops <i>.weight must be a positive integer`, and `drops <i>.count must be a positive
  integer [min, max] pair with min <= max` respectively

### Requirement: expansion
`createRecipeLootExpansion(input)` MUST group by kind preserving registration order and MUST
reject per-kind duplicate ids; `recipeById` / `lootById` MUST return the definitions (string or
ResourceId; undefined when missing); `recipesByOutput(expansion, itemId)` MUST return the
recipes producing the item, in order; `lootForSource(expansion, source)` MUST return the loot
tables for the source, in order.

#### Scenario: expansion
- **GIVEN** a recipe `minecraft:a` (output `minecraft:planks`), a recipe `minecraft:b` (output
  `minecraft:planks`), a loot `minecraft:l1` (source `minecraft:zombie`), and a duplicate recipe
  `minecraft:a`
- **THEN** the expansion groups them in order; `recipeById(expansion, 'minecraft:b')` is b;
  `lootById(expansion, 'minecraft:nope')` is undefined; `recipesByOutput(expansion,
  'minecraft:planks')` is [a, b]; `lootForSource(expansion, 'minecraft:zombie')` is [l1]; the
  duplicate throws `duplicate recipe id minecraft:a`; an empty expansion yields empty groups

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
| REQ-1 creation | `tests/unit/RecipeLootExpansion.test.ts` › creation |
| REQ-2 rejections | › rejections |
| REQ-3 expansion | › expansion |
