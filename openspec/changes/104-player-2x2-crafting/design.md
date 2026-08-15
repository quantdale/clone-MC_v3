# Design: 104-player-2x2-crafting

## Context / current state

103 defines typed recipes (shaped/shapeless/processing). No grid evaluation exists; the 010
one-click path is untouched.

## Target state

A validated `CraftingGrid` (row-major slots with item resource-id strings), immutable update
helpers, a deterministic recipe matcher, and an exact consumption function.

## Invariants

- Grids are 1-3 x 1-3; `slots.length === width * height`; each slot is `null` or
  `{ item: non-empty string, count: positive integer }`; each filled cell counts as one
  ingredient (counts are payload, not ingredient quantity).
- Shaped match: the pattern (HxW) must fit the grid (`H <= grid.height`, `W <= grid.width`),
  pattern cells map to slots by top-left alignment (`'_'` -> empty slot, char -> slot item
  equals `keys[char]`), and every grid cell outside the pattern is empty.
- Shapeless match: the multiset of filled cells equals the ingredient list (same items, same
  multiplicities); order is irrelevant.
- `matchCraftingRecipe` searches recipes in input order; the first match wins.
- `craftCraftingGrid(grid, recipe)` returns the recipe result plus the consumed cell
  coordinates (all pattern-covered cells for shaped; all filled cells for shapeless), or null
  when the recipe does not match.

## API and data model

```ts
// src/inventory/CraftingGrid.ts (NEW)
export interface CraftingSlot { item: string; count: number; }
export interface CraftingGrid { width: number; height: number; slots: Array<CraftingSlot | null>; }
export function createCraftingGrid(width: number, height: number, slots?: Array<CraftingSlot | null>): CraftingGrid;
export function emptyCraftingGrid(width: number, height: number): CraftingGrid;
export function setCraftingSlot(grid: CraftingGrid, x: number, y: number, slot: CraftingSlot | null): CraftingGrid;
export function matchCraftingRecipe(grid: CraftingGrid, recipes: readonly TypedRecipe[]): TypedRecipe | null;
export function craftCraftingGrid(
  grid: CraftingGrid,
  recipe: TypedRecipe,
): { result: RecipeResult; consumed: Array<{ x: number; y: number }> } | null;
```

## Control / data flow

1. 104 evaluates player-grid crafts purely; the inventory layer (later changes) applies the
   consumption coordinates and inserts results.

## Detailed behavior

- `setCraftingSlot` returns a NEW grid (immutable updates; invalid coordinates or slots
  throw).
- Matching never throws; a null result means no recipe matches.
- Example: the default `wooden_pickaxe` (3x3 pattern) does not fit a 2x2 grid; `glass`
  (shapeless, 4x sand) matches a full 2x2 sand grid.

## Failure modes

- Grid construction/update throws descriptive errors; matching/crafting never throw.

## Compatibility / migration

Additive.

## Performance / resource constraints

Matching is O(recipes x grid cells); grids are at most 3x3.

## Testing seams

- `tests/unit/CraftingGrid.test.ts` (NEW): grid validation matrix; update immutability;
  shaped match vectors (fit, empty equivalence, extras, too-large patterns, offsets);
  shapeless multiset matching (order independence, multiplicities); first-match order;
  consumption coordinates; default-recipe integration (2x2 glass yes, 3x3 pickaxe no).

## Observability / debugging

Plain data; tests assert exact grids, matches, and consumed coordinates.

## Affected files / symbols

- `src/inventory/CraftingGrid.ts` — NEW.
- `tests/unit/CraftingGrid.test.ts` — NEW.

## Rejected alternatives

- *Slot counts as ingredient quantity*: the crafting grid is single-item-per-cell in MC;
  counts stay payload for the future inventory wiring.
- *Pattern offset search*: top-left anchored fit plus no-extras is the MC semantic and keeps
  matching deterministic and simple.

## Downstream dependencies

105 adds the crafting-table 3x3 interaction; inventory wiring applies consumption and result
insertion.
