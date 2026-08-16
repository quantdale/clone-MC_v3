# Spec: enchantment-potion-expansion

## Contract
This capability adds the data-driven enchantment/status-effect/potion catalog expansion:
validated definitions of three kinds, grouped into a lookup-ready catalog over 012/014/118/122 —
pure, headless-safe, registry-mutation-free.

## Definitions
- **Enchantment**: `{ id, name, maxLevel, appliesTo, incompatible }`.
- **Effect**: `{ id, name, beneficial, maxAmplifier }`.
- **Potion**: `{ id, name, effectId, durationTicks, amplifier }`.
- **Catalog**: `{ enchantments, effects, potions }` — registration order preserved per kind.

## Invariants
- Pure and headless-safe: no registry access, no mutation of inputs.
- Ids MUST be valid namespaced ids whose path does not start with the kind's prefix
  (`enchantment/`, `effect/`, `potion/`); names MUST be non-empty.
- `maxLevel` MUST be a positive integer (default 1); `appliesTo` MUST be non-empty strings;
  `incompatible` MUST be strings (default []); `beneficial` MUST be a boolean; `maxAmplifier`
  MUST be an integer >= 0 (default 3); `effectId` MUST be non-empty; `durationTicks` MUST be a
  positive integer; `amplifier` MUST be an integer >= 0.
- Per-kind duplicate ids MUST be rejected; the whole payload validates before anything is
  accepted.
- `potionsForEffect` filters by reference; dangling effect ids are allowed (runtime
  resolution), never rejected.

## Requirements

### Requirement: definition creation
`createEnchantmentDefinition`, `createStatusEffectDefinition`, and `createPotionDefinition` MUST
return validated definitions with the documented defaults.

#### Scenario: creation
- **GIVEN** an enchantment `minecraft:sharpness_alt` with maxLevel 5 and appliesTo
  `['minecraft:sword']`; an enchantment `minecraft:unbreaking_alt` with only appliesTo
  `['minecraft:tool']`; an effect `minecraft:speed_alt` with beneficial true; an effect
  `minecraft:slowness_alt` with only beneficial false; and a potion `minecraft:swiftness_alt`
  with effectId `minecraft:speed_alt`, durationTicks 3600, amplifier 0
- **THEN** sharpness_alt has maxLevel 5 and incompatible []; unbreaking_alt has maxLevel 1;
  speed_alt has maxAmplifier 3; the potion carries the given fields

### Requirement: definition rejections
Construction MUST throw a descriptive `Error` for invalid ids, prefixed id paths, empty names,
and every field violation.

#### Scenario: rejections
- **GIVEN** ids `'Bad Id'` and `'minecraft:enchantment/sharpness'`; names `''`; maxLevels 0 and
  1.5; appliesTo `[]` and `['']`; incompatibles `['']`; beneficial `'yes'`; maxAmplifiers -1 and
  1.5; effectIds `''`; durationTicks 0 and 1.5; amplifiers -1 and 1.5
- **THEN** each throws mentioning `id must be a valid namespaced id`, `must not start with`,
  `name must be a non-empty string`, `maxLevel must be a positive integer`, `appliesTo must not
  be empty` / `must be non-empty strings`, `beneficial must be a boolean`, `maxAmplifier must be
  an integer >= 0`, `effectId must be a non-empty string`, `durationTicks must be a positive
  integer`, and `amplifier must be an integer >= 0` respectively

### Requirement: catalog
`createCatalogExpansion(input)` MUST group by kind preserving registration order and MUST reject
per-kind duplicate ids; `enchantmentById` / `effectById` / `potionById` MUST return the
definitions (string or ResourceId; undefined when missing); `potionsForEffect(expansion,
effectId)` MUST return the potions referencing the effect, in order.

#### Scenario: catalog
- **GIVEN** an enchantment `minecraft:a`, an effect `minecraft:e`, a potion `minecraft:p`
  (effectId `minecraft:e`), a potion `minecraft:q` (effectId `minecraft:other`), and a duplicate
  enchantment `minecraft:a`
- **THEN** the catalog groups them in order; `enchantmentById(expansion, 'minecraft:a')` is the
  enchantment; `potionById(expansion, 'minecraft:nope')` is undefined; `potionsForEffect(
  expansion, 'minecraft:e')` is [p]; `potionsForEffect(expansion, 'minecraft:other')` is [q];
  the duplicate throws `duplicate enchantment id minecraft:a`; an empty catalog yields empty
  groups

## Error and failure behavior
- Construction throws descriptively; nothing partially accepted. Lookups are total.

## Performance and resource bounds
- Lookups and grouping O(definitions).

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Security and integrity
- Pure functions; registry state is never touched by this module.

## Observability
- The catalog is a plain immutable object; lookups are introspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 creation | `tests/unit/EnchantmentPotionExpansion.test.ts` › creation |
| REQ-2 rejections | › rejections |
| REQ-3 catalog | › catalog |
