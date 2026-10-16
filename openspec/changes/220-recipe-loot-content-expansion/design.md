# Design: 220-recipe-loot-content-expansion

## Context/current state
- 215-219 established the data-driven definition pattern; crafting/processing/loot coverage for
  the expanded content is missing. 220 adds recipe and loot definitions over 103/110's systems;
  221's release-delta arc follows.

## Target state
- `src/data/RecipeLootExpansion.ts` holding the two definition kinds, validation, and the
  expansion queries.

## Invariants
- Pure and headless-safe: no registry access, no mutation of inputs.
- Recipe ids are valid namespaced ids (004 rules) whose path does NOT start with `recipe/`;
  `name` optional non-empty; `output`/`ingredients` non-empty item ids; `count` a positive
  integer (default 1); `category` one of `crafting|smelting|brewing` (default crafting).
- Loot ids are valid namespaced ids whose path does NOT start with `loot/`; `source` non-empty;
  `drops` a non-empty list of `{ item (non-empty), weight (positive integer), count ([min, max]
  positive integers, min <= max) }`.
- Per-kind duplicate ids are rejected; the whole payload validates before anything is accepted.
- `createRecipeLootExpansion` preserves registration order; lookups are total.

## API and data model
```ts
// src/data/RecipeLootExpansion.ts (new)
export type RecipeCategory = 'crafting' | 'smelting' | 'brewing';
export interface RecipeDefinition {
  id: ResourceId;               // path without a recipe/ prefix
  name?: string;                // optional non-empty
  output: string;               // item id
  count: number;                // positive integer, default 1
  ingredients: readonly string[];  // non-empty item ids
  category: RecipeCategory;     // default 'crafting'
}
export interface LootDrop {
  item: string;                 // item id
  weight: number;               // positive integer
  count: readonly [number, number];  // [min, max], positive, min <= max
}
export interface LootDefinition {
  id: ResourceId;               // path without a loot/ prefix
  source: string;               // entity/block id
  drops: readonly LootDrop[];   // non-empty
}
export function createRecipeDefinition(input: {...}): RecipeDefinition;
export function createLootDefinition(input: {...}): LootDefinition;

export interface RecipeLootExpansion {
  recipes: readonly RecipeDefinition[];
  loot: readonly LootDefinition[];
}
export function createRecipeLootExpansion(input: {
  recipes?: readonly RecipeDefinition[];
  loot?: readonly LootDefinition[];
}): RecipeLootExpansion;
export function recipeById(expansion: RecipeLootExpansion, id: ResourceId | string): RecipeDefinition | undefined;
export function lootById(expansion: RecipeLootExpansion, id: ResourceId | string): LootDefinition | undefined;
export function recipesByOutput(expansion: RecipeLootExpansion, itemId: string): readonly RecipeDefinition[];
export function lootForSource(expansion: RecipeLootExpansion, source: string): readonly LootDefinition[];
```

## Control/data flow
1. Content authors define recipes/loot for the expanded content as data.
2. `createRecipeLootExpansion` validates and orders them; 104/105/109/110 and the loot system
   consume the definitions (unchanged).

## Detailed behavior
- Rejections (each `RecipeLoot: <detail>`): invalid id -> `id must be a valid namespaced id`;
  prefixed path -> `id path must not start with '<prefix>'`; empty name -> `name must be a
  non-empty string when present`; empty output -> `output must be a non-empty string`;
  non-positive/non-integer count -> `count must be a positive integer`; empty ingredients ->
  `ingredients must not be empty`; malformed ingredients -> `ingredients must be non-empty
  strings`; unknown category -> `category must be crafting, smelting, or brewing`; empty source
  -> `source must be a non-empty string`; empty drops -> `drops must not be empty`; per-drop:
  empty item -> `drops <i>.item must be a non-empty string`; weight -> `drops <i>.weight must be
  a positive integer`; count -> `drops <i>.count must be a positive integer [min, max] pair with
  min <= max`.
- `createRecipeLootExpansion`: per-kind duplicate ids -> `duplicate recipe id <id>` /
  `duplicate loot id <id>`.
- Lookups: string ids parse with the default namespace; undefined when missing.
- Defaults: `count` 1, `category` 'crafting', `name` absent.

## Failure modes
- Construction throws descriptively; nothing partially accepted. Lookups are total.

## Compatibility/migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Lookups and grouping O(definitions).

## Testing seams
- Tests drive the constructors with exact payloads and pin every rejection.

## Observability/debugging
- The expansion is a plain immutable object; lookups are introspectable.

## Affected files/symbols
- `src/data/RecipeLootExpansion.ts` (new).
- Tests: `tests/unit/RecipeLootExpansion.test.ts` (new). No other files.

## Rejected alternatives
- **Extending 103/110 directly**: rejected — registry characterization stays pinned; the
  expansion is data the runtime maps (the established pattern).

## Downstream dependencies
- 221 (`current-release-delta`) overlays current-release behavior; 242's e2e verifies the
  expanded recipes/loot.
