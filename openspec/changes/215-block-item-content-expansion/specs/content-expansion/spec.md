# Spec: content-expansion

## Contract
This capability adds the data-driven block/item content expansion: validated definitions with
translation keys, stack sizes, hardness, and tags, grouped into a lookup-ready expansion — pure,
headless-safe, and free of registry mutations (no new architecture).

## Definitions
- **Definition**: `{ id, kind: block|item, name, stackSize, hardness, tags }`.
- **Expansion**: `{ blocks, items }` — registration order preserved per kind.

## Invariants
- Pure and headless-safe: no registry access, no mutation of inputs.
- Ids MUST be valid namespaced ids whose path does not start with `block/` or `item/`; `name`
  MUST be non-empty; `stackSize` MUST be an integer in [1, 64] (default 64); `hardness` MUST be a
  finite number >= 0 (default 0); `tags` MUST be non-empty strings (default []).
- Duplicate ids MUST be rejected; the whole payload validates before anything is accepted.

## Requirements

### Requirement: definition creation
`createContentDefinition(input)` MUST return a validated definition with the documented
defaults.

#### Scenario: creation
- **GIVEN** a block `minecraft:obsidian_alt` with name `block.obsidian_alt`, stackSize 64,
  hardness 50, tags `['pickaxe']`; and an item `minecraft:emerald_alt` with only a name
- **THEN** the first has hardness 50 and tags `['pickaxe']`; the second has stackSize 64,
  hardness 0, and tags []

### Requirement: definition rejections
Construction MUST throw a descriptive `Error` for an invalid id, a `block/`- or `item/`-prefixed
id path, an empty name, a `stackSize` outside [1, 64] or non-integer, a negative or non-finite
`hardness`, and non-string/empty tags.

#### Scenario: rejections
- **GIVEN** ids `'Bad Id'` and `'minecraft:block/stone'`; names `''`; stackSizes 0, 65, 1.5;
  hardnesses -1 and NaN; tags `['']` and `[5]`
- **THEN** each throws mentioning `id must be a valid namespaced id`, `must not start with`,
  `name must be a non-empty string`, `stackSize must be an integer in [1, 64]`, `hardness must
  be a finite number >= 0`, and `tags must be non-empty strings` respectively

### Requirement: expansion
`createContentExpansion(definitions)` MUST group by kind preserving registration order and MUST
reject duplicate ids; `contentById(expansion, id)` MUST return the definition (string or
ResourceId; undefined when missing); `contentsOfKind(expansion, kind)` MUST return the kind's
definitions in order.

#### Scenario: expansion
- **GIVEN** block `minecraft:a`, item `minecraft:b`, block `minecraft:c`, and a duplicate
  `minecraft:a`
- **THEN** `blocks` is [a, c], `items` is [b]; `contentById(expansion, 'minecraft:b')` is the
  item; `contentById(expansion, 'minecraft:nope')` is undefined; `contentsOfKind(expansion,
  'block')` is [a, c]; the duplicate throws `duplicate content id minecraft:a`; an empty
  expansion yields empty blocks/items

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
| REQ-1 creation | `tests/unit/ContentExpansion.test.ts` › creation |
| REQ-2 rejections | › rejections |
| REQ-3 expansion | › expansion |
