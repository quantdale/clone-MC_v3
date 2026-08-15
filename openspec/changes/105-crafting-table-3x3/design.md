# Design: 105-crafting-table-3x3

## Context / current state

104 provides grid evaluation up to 3x3. No table session or block identity exists.

## Target state

A pure `CraftingTableSession` (3x3 grid + captured recipes) with immutable updates, match/
result queries, and exact take-result consumption; a documented reserved block id.

## Invariants

- Sessions always hold a 3x3 `CraftingGrid` and a readonly recipe snapshot.
- `setCraftingTableSlot` validates bounds/slots and returns a NEW session.
- `craftingTableMatch` = `matchCraftingRecipe(session.grid, session.recipes)` (first match).
- `craftingTableResult` = match ? `{ item, count }` : null.
- `takeCraftingTableResult`: on a match, returns a new session whose consumed cells (from
  `craftCraftingGrid`) are empty plus the taken result slot; on no match, returns the same
  session and null. Never throws.
- `CRAFTING_TABLE_BLOCK_ID = 13` (reserved; matches the free numeric slot in `BlockId`).

## API and data model

```ts
// src/inventory/CraftingTable.ts (NEW)
export const CRAFTING_TABLE_BLOCK_ID = 13;
export interface CraftingTableSession {
  grid: CraftingGrid;
  recipes: readonly TypedRecipe[];
}
export function createCraftingTableSession(recipes: readonly TypedRecipe[]): CraftingTableSession;
export function setCraftingTableSlot(
  session: CraftingTableSession,
  x: number,
  y: number,
  slot: CraftingSlot | null,
): CraftingTableSession;
export function craftingTableMatch(session: CraftingTableSession): TypedRecipe | null;
export function craftingTableResult(session: CraftingTableSession): CraftingSlot | null;
export function takeCraftingTableResult(
  session: CraftingTableSession,
): { session: CraftingTableSession; taken: CraftingSlot | null };
```

## Control / data flow

1. A player opens a table session (UI layer, keyed on `CRAFTING_TABLE_BLOCK_ID` later).
2. Slots change -> session updates; match/result recompute; taking the result consumes the
   matched cells.

## Detailed behavior

- The default recipes: `wooden_pickaxe` (3x3 shaped) crafts on the table; `glass` (shapeless,
  4x sand) crafts anywhere in the table grid; both consume exactly their matched cells.

## Failure modes

- Session updates throw descriptive errors on invalid inputs; queries/take never throw.

## Compatibility / migration

Additive.

## Performance / resource constraints

All operations O(recipes x 9 cells).

## Testing seams

- `tests/unit/CraftingTable.test.ts` (NEW): session creation; immutable slot updates with
  bounds/bad-slot rejection; match/result for the pickaxe and glass recipes; take-result
  consumption vectors (exact emptied cells, taken slot); no-match take leaves the session
  unchanged; determinism.

## Observability / debugging

Plain data; tests assert exact sessions, results, and taken slots.

## Affected files / symbols

- `src/inventory/CraftingTable.ts` — NEW.
- `tests/unit/CraftingTable.test.ts` — NEW.

## Rejected alternatives

- *Adding the crafting-table block to `BlockRegistry` now*: the block expansion change owns
  block definitions; 105 documents the reserved id so interaction wiring can key on it.
- *Mutable session class*: pure immutable data matches the 103/104 style and testing.

## Downstream dependencies

The block expansion materializes id 13; the UI layer opens sessions and routes taken results
into inventory (107+ patterns).
