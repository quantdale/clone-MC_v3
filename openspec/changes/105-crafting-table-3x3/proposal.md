# Proposal: 105-crafting-table-3x3

## Problem

104 evaluates crafting grids up to 3x3, but no crafting-table session exists: nothing models
the table's 3x3 grid with its result slot and take-result semantics, and no crafting-table
block identity is documented.

## Goals

- `CraftingTableSession`: a 3x3 grid over a captured recipe set with immutable updates.
- `craftingTableMatch`/`craftingTableResult`: the current match and result slot (104
  evaluator over the 3x3 grid).
- `takeCraftingTableResult`: consumes exactly the matched cells and returns the result slot
  (or null, leaving the session unchanged, when nothing matches).
- Documented `CRAFTING_TABLE_BLOCK_ID = 13` (reserved block id for the block expansion) so
  later interaction wiring can key on it.

## Non-goals

- UI panels or input handling (UI layer).
- A world block definition for the crafting table (block expansion change).
- Inventory insertion of taken results (inventory wiring).

## Preconditions

- Change 104 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 104 baseline (1162 unit / 19 e2e).

## Dependencies

- 104 `CraftingGrid`/`matchCraftingRecipe`/`craftCraftingGrid`, 103 `TypedRecipe`.

## Proposed change

- `src/inventory/CraftingTable.ts` (NEW): `CRAFTING_TABLE_BLOCK_ID`,
  `CraftingTableSession`, `createCraftingTableSession`, `setCraftingTableSlot`,
  `craftingTableMatch`, `craftingTableResult`, `takeCraftingTableResult`.
- `tests/unit/CraftingTable.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Take-result semantics must be exact (consume only matched cells); pinned by exact vectors.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Session creation and updates validate strictly (3x3 bounds, valid slots) and are immutable.
- Matching/result/take behave per the documented semantics with the default recipes
  (3x3 wooden pickaxe crafts on the table, unlike the 2x2 player grid).
- Full gate green; 105 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 105 suite; E2E stays 19/19.
