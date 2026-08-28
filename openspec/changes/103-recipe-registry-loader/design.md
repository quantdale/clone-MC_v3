# Design: 103-recipe-registry-loader

## Context / current state

010 provides a flat, validated recipe registry for one-click crafting. Grid crafting (104/105)
and furnace processing (109/110) need kind-specific recipe data.

## Target state

A kind-discriminated `TypedRecipe` model (shaped/shapeless/processing) with strict validation
and a 003-pattern registry, plus deterministic defaults.

## Invariants

- `shaped`: `pattern` 1-3 rows, each 1-3 chars, all rows the same length; chars are `_`
  (empty) or uppercase `A-Z` defined in `keys`; every `keys` char appears in the pattern (no
  dead keys); at least one non-empty cell; `keys` values non-empty strings.
- `shapeless`: 1-9 non-empty ingredient strings.
- `processing`: non-empty `input`; positive integer `cookingTime`; finite `experience >= 0`.
- All kinds: non-empty `key`; `result.item` non-empty string; `result.count` positive integer
  <= `MAX_RECIPE_COUNT` (64).
- Registry stores only validated recipes; duplicates and invalid inputs throw atomically.
- Identical inputs produce identical results.

## API and data model

```ts
// src/inventory/TypedRecipe.ts (NEW)
export type RecipeKind = 'shaped' | 'shapeless' | 'processing';
export const MAX_RECIPE_COUNT = 64;

export interface RecipeResult { item: string; count: number; }
export interface ShapedRecipe {
  kind: 'shaped';
  key: string;
  pattern: string[];
  keys: Record<string, string>;
  result: RecipeResult;
}
export interface ShapelessRecipe {
  kind: 'shapeless';
  key: string;
  ingredients: string[];
  result: RecipeResult;
}
export interface ProcessingRecipe {
  kind: 'processing';
  key: string;
  input: string;
  result: RecipeResult;
  cookingTime: number;
  experience: number;
}
export type TypedRecipe = ShapedRecipe | ShapelessRecipe | ProcessingRecipe;

export function validateTypedRecipe(input: unknown): TypedRecipe;
export class TypedRecipeRegistry {
  register(recipe: TypedRecipe): void;
  get(key: string): TypedRecipe | null;
  has(key: string): boolean;
  get size(): number;
  all(): TypedRecipe[];
  clear(): void;
}
export function createDefaultTypedRecipes(): TypedRecipeRegistry;
```

## Control / data flow

1. 103 registers typed recipe defaults; 104/105 consume `shaped`/`shapeless` kinds for the
   crafting grids; 109/110 consume `processing` for the furnace.

## Detailed behavior

- Defaults (item resource ids per `ItemRegistry`):
  - `wooden_pickaxe` (shaped): pattern `['WWW', '_S_', '_S_']`, keys `{ W: minecraft:planks,
    S: minecraft:stick }`, result `minecraft:wooden_pickaxe` x1.
  - `glass` (shapeless): 4x `minecraft:sand`, result `minecraft:glass` x1.
  - `smelt_sand` (processing): input `minecraft:sand` -> `minecraft:glass` x1,
    cookingTime 200, experience 0.1.
  - `smelt_cobblestone` (processing): input `minecraft:cobblestone` ->
    `minecraft:stone` x1, cookingTime 200, experience 0.1.

## Failure modes

- Validation throws descriptive errors naming the offending field; registry operations reject
  atomically.

## Compatibility / migration

Additive; the 010 registry and UI are untouched.

## Performance / resource constraints

Validation O(pattern area) for shaped, O(ingredients) otherwise; registry O(1) lookups.

## Testing seams

- `tests/unit/TypedRecipe.test.ts` (NEW): per-kind validation matrices (patterns, keys,
  counts, cooking time, experience), registry lifecycle/atomicity, defaults exactness and
  determinism.

## Observability / debugging

Plain validated data; tests assert exact values.

## Affected files / symbols

- `src/inventory/TypedRecipe.ts` — NEW.
- `tests/unit/TypedRecipe.test.ts` — NEW.

## Rejected alternatives

- *Extending the 010 registry with kinds*: the 010 model is frozen for one-click crafting;
  a separate typed model is additive and keeps 010 untouched.
- *Numeric item ids in recipes*: resource-id strings are stable and match the 010/ItemRegistry
  convention.

## Downstream dependencies

104 consumes shaped/shapeless kinds for the 2x2 grid; 105 the crafting table; 109/110 the
processing kind.
