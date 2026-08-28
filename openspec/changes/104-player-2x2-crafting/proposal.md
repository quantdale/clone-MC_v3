# Proposal: 104-player-2x2-crafting

## Problem

103 defines typed recipes, but no crafting-grid evaluation exists: nothing matches a 2x2 (or
3x3) ingredient grid to a recipe or defines consumption semantics.

## Goals

- `CraftingGrid` model (1-3 x 1-3, row-major slots holding an item resource-id or empty) with
  strict validation and immutable update helpers.
- `matchCraftingRecipe(grid, recipes)`: deterministic first-match search —
  shaped patterns must fit the grid with empty cells matching empty slots and no extra filled
  cells outside the pattern; shapeless recipes match by ingredient multiset.
- `craftCraftingGrid(grid, recipe)`: exact result plus the consumed cell coordinates.

## Non-goals

- Inventory integration / result insertion (player inventory changes later).
- The crafting-table 3x3 block interaction (105).
- The 010 one-click crafting path.

## Preconditions

- Change 103 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 103 baseline (1148 unit / 19 e2e).

## Dependencies

- 103 `TypedRecipe` kinds, 003-style validation conventions.

## Proposed change

- `src/inventory/CraftingGrid.ts` (NEW): `CraftingSlot`, `CraftingGrid`, `createCraftingGrid`,
  `setCraftingSlot`, `emptyCraftingGrid`, `matchCraftingRecipe`, `craftCraftingGrid`.
- `tests/unit/CraftingGrid.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Shaped matching semantics must be pinned (fit + empty-cell equivalence + no extras); exact
  vectors cover offsets, larger patterns, and extra cells.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Grid validation accepts exactly the documented shape and rejects malformed grids.
- Matching is deterministic and matches the documented semantics for both kinds; the 3x3
  wooden pickaxe does NOT match a 2x2 grid, while the 4-sand glass recipe does.
- Crafting returns exact results and consumed coordinates.
- Full gate green; 104 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 104 suite; E2E stays 19/19.
