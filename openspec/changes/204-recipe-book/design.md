# Design: 204-recipe-book

## Context/current state
- 103's `RecipeRegistry` exposes all recipes (`entries`, `getByKey`, `RecipeDefinition` with
  `key`/`name`/`ingredients`/`output`). No per-player knowledge, no search, no grid layout. 204
  adds the recipe book; 205's HUD and the crafting screen consume it.

## Target state
- `src/inventory/RecipeBook.ts` holding the known-recipes state, search, the 3x3 layout helper,
  and versioned persistence.

## Invariants
- Pure and headless-safe: the registry is injected and never modified; inputs are never mutated.
- `known` holds unique recipe keys in unlock order; an empty key is never added.
- `unlockRecipe`/`unlockRecipes` return the IDENTICAL state when nothing changes.
- `searchRecipes` returns KNOWN recipes in REGISTRY order; matching is a case-insensitive
  substring against key, name, or output item id; blank queries return all known.
- `layoutRecipe` fills the 9-cell grid row-major from the top-left (compacted); > 9 ingredients
  throws; `compactGrid` is the exact inverse (non-null cells in row-major order).
- Deserialization validates the whole payload before accepting anything; violations throw
  descriptive errors.

## API and data model
```ts
// src/inventory/RecipeBook.ts (new)
export const RECIPE_GRID_CELLS = 9;

export interface RecipeBookState { readonly known: readonly string[]; }
export function createDefaultRecipeBook(): RecipeBookState;
export function unlockRecipe(state: RecipeBookState, key: string): RecipeBookState;
export function unlockRecipes(state: RecipeBookState, keys: readonly string[]): RecipeBookState;
export function hasRecipe(state: RecipeBookState, key: string): boolean;

export function searchRecipes(registry: RecipeRegistry, state: RecipeBookState, query: string): RecipeDefinition[];

export type RecipeGridCell = { kind: 'item'; item: string } | { kind: 'tag'; tag: string } | null;
export function layoutRecipe(ingredients: readonly RecipeIngredient[]): RecipeGridCell[];
export function compactGrid(grid: readonly RecipeGridCell[]): RecipeGridCell[];

export interface SerializedRecipeBook { version: 1; known: string[]; }
export function serializeRecipeBook(state: RecipeBookState): SerializedRecipeBook;
export function deserializeRecipeBook(input: unknown): RecipeBookState;
```

## Control/data flow
1. Progression systems call `unlockRecipe(s)` as players learn recipes.
2. The crafting screen calls `searchRecipes` for the book view and `layoutRecipe` when a recipe is
   selected (the wiring resolves tag cells and places items).

## Detailed behavior
- `unlockRecipe`: empty key or already-known -> IDENTICAL state; otherwise append.
- `unlockRecipes`: appends each unknown non-empty key in order; nothing new -> IDENTICAL state.
- `searchRecipes`: `q = query.trim().toLowerCase()`; for each known key in order, resolve via
  `registry.getByKey` (skip undefined); blank `q` -> all resolved; else keep definitions where
  `key.includes(q) || name.toLowerCase().includes(q) || resourceIdToString(output.item).includes(q)`.
- `layoutRecipe`: `ingredients.length > 9` -> `Error('RecipeBook: recipe has <n> ingredients (max
  9)')`; cell `i` = `{ kind: 'item', item: resourceIdToString(ing.item) }` for item ingredients or
  `{ kind: 'tag', tag: resourceIdToString(ing.tag) }` for tag ingredients; remaining cells null.
- `compactGrid`: the non-null cells in row-major order (nulls dropped).
- `deserializeRecipeBook` rejections: non-object -> `RecipeBook: expected an object`; bad version
  -> `unsupported version <v>`; `known` not an array -> `known must be an array`; entries not
  non-empty strings -> `known <i> must be a non-empty string`; duplicates -> `known contains
  duplicate key <k>`; unknown keys -> `unknown key <k>`.

## Failure modes
- No throws in the state/search/layout APIs except `layoutRecipe` for > 9 ingredients.
- Only `deserializeRecipeBook` throws (invalid persisted data must not be silently accepted).

## Compatibility/migration
- One new inventory file; 103 untouched; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Search is O(known recipes); layout/compact O(9); unlock O(known) worst case.

## Testing seams
- Tests use `createDefaultRecipeRegistry()` (deterministic) and real keys (`planks`, `glass`,
  `wooden_pickaxe`, ...); layout tests use hand-built ingredient lists.

## Observability/debugging
- The book state is a plain immutable array; search/layout are total functions.

## Affected files/symbols
- `src/inventory/RecipeBook.ts` (new).
- Tests: `tests/unit/RecipeBook.test.ts` (new). No other files.

## Rejected alternatives
- **Storing known recipes as a Set**: rejected — plain arrays keep serialization trivial and the
  unlock order visible; membership checks stay O(known).
- **Tag resolution inside layout**: rejected — the wiring resolves tags to concrete items; the
  layout stays pure and registry-free.

## Downstream dependencies
- 205 (`hud-parity`) shows recipe knowledge; the crafting screen binds search + layout; 242's e2e
  crafts from the book.
