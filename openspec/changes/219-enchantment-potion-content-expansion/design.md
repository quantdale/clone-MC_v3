# Design: 219-enchantment-potion-content-expansion

## Context/current state
- 215-218 established the data-driven definition pattern; enchantments/effects/potions remain
  fixed. 219 fills those catalogs as data over 012/014/118/122; 220's recipe/loot expansion
  follows.

## Target state
- `src/data/EnchantmentPotionExpansion.ts` holding the three definition kinds, validation, and
  the catalog queries.

## Invariants
- Pure and headless-safe: no registry access, no mutation of inputs.
- Ids are valid namespaced ids (004 rules) with per-kind prefix conventions (`enchantment/`,
  `effect/`, `potion/` forbidden in the path).
- `name`s are non-empty; `maxLevel` a positive integer (default 1); `appliesTo` non-empty
  strings; `incompatible` strings (default []); `beneficial` a boolean; `maxAmplifier` an
  integer >= 0 (default 3); `effectId` non-empty; `durationTicks` a positive integer;
  `amplifier` an integer >= 0.
- Per-kind duplicate ids are rejected; the whole payload validates before anything is accepted.
- `potionsForEffect` filters by effect reference; dangling effect ids are allowed (runtime
  resolution), never rejected.

## API and data model
```ts
// src/data/EnchantmentPotionExpansion.ts (new)
export interface EnchantmentDefinition {
  id: ResourceId;               // path without an enchantment/ prefix
  name: string;
  maxLevel: number;             // positive integer, default 1
  appliesTo: readonly string[]; // non-empty
  incompatible: readonly string[];  // default []
}
export interface StatusEffectDefinition {
  id: ResourceId;               // path without an effect/ prefix
  name: string;
  beneficial: boolean;
  maxAmplifier: number;         // integer >= 0, default 3
}
export interface PotionDefinition {
  id: ResourceId;               // path without a potion/ prefix
  name: string;
  effectId: string;             // status-effect reference
  durationTicks: number;        // positive integer
  amplifier: number;            // integer >= 0
}
export function createEnchantmentDefinition(input: {...}): EnchantmentDefinition;
export function createStatusEffectDefinition(input: {...}): StatusEffectDefinition;
export function createPotionDefinition(input: {...}): PotionDefinition;

export interface CatalogExpansion {
  enchantments: readonly EnchantmentDefinition[];
  effects: readonly StatusEffectDefinition[];
  potions: readonly PotionDefinition[];
}
export function createCatalogExpansion(input: {
  enchantments?: readonly EnchantmentDefinition[];
  effects?: readonly StatusEffectDefinition[];
  potions?: readonly PotionDefinition[];
}): CatalogExpansion;
export function enchantmentById(expansion: CatalogExpansion, id: ResourceId | string): EnchantmentDefinition | undefined;
export function effectById(expansion: CatalogExpansion, id: ResourceId | string): StatusEffectDefinition | undefined;
export function potionById(expansion: CatalogExpansion, id: ResourceId | string): PotionDefinition | undefined;
export function potionsForEffect(expansion: CatalogExpansion, effectId: string): readonly PotionDefinition[];
```

## Control/data flow
1. Content authors define enchantments/effects/potions as data.
2. `createCatalogExpansion` validates and orders them; 118/121/123 consume the definitions
   through the existing registries (unchanged).

## Detailed behavior
- Rejections (each `EnchantmentPotion: <detail>`): invalid id -> `id must be a valid namespaced
  id`; prefixed path -> `id path must not start with '<prefix>'`; empty name -> `name must be a
  non-empty string`; `maxLevel` not a positive integer -> `maxLevel must be a positive integer`;
  empty `appliesTo` -> `appliesTo must not be empty`; malformed `appliesTo`/`incompatible` ->
  `appliesTo must be non-empty strings` / `incompatible must be non-empty strings`;
  non-boolean `beneficial` -> `beneficial must be a boolean`; `maxAmplifier` not an integer >= 0
  -> `maxAmplifier must be an integer >= 0`; empty `effectId` -> `effectId must be a non-empty
  string`; `durationTicks` not a positive integer -> `durationTicks must be a positive integer`;
  `amplifier` not an integer >= 0 -> `amplifier must be an integer >= 0`.
- `createCatalogExpansion`: per-kind duplicate ids -> `duplicate enchantment id <id>` /
  `duplicate effect id <id>` / `duplicate potion id <id>`.
- Lookups: string ids parse with the default namespace; undefined when missing.
- Defaults: `maxLevel` 1, `incompatible` [], `maxAmplifier` 3.

## Failure modes
- Construction throws descriptively; nothing partially accepted. Lookups are total.

## Compatibility/migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Lookups and grouping O(definitions).

## Testing seams
- Tests drive the constructors with exact payloads and pin every rejection.

## Observability/debugging
- The catalog is a plain immutable object; lookups are introspectable.

## Affected files/symbols
- `src/data/EnchantmentPotionExpansion.ts` (new).
- Tests: `tests/unit/EnchantmentPotionExpansion.test.ts` (new). No other files.

## Rejected alternatives
- **Extending 012/014/118/122 directly**: rejected — registry characterization stays pinned; the
  expansion is data the runtime maps (the established pattern).

## Downstream dependencies
- 220 (`recipe-loot-content-expansion`) references this catalog for drops/recipes; 242's e2e
  verifies expanded content.
