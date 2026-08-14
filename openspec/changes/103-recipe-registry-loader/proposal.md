# Proposal: 103-recipe-registry-loader

## Problem

The 010 `RecipeRegistry` models recipes as flat ingredient lists for one-click crafting. The
crafting-grid (104), crafting-table (105), and furnace (109/110) changes need the full recipe
vocabulary: shaped grids, shapeless lists, and processing (smelting) recipes — loaded and
validated.

## Goals

- `TypedRecipe` model with three kinds:
  - `shaped`: 1-3x1-3 pattern grid over named item keys plus a result.
  - `shapeless`: 1-9 unordered ingredients plus a result.
  - `processing`: single input, result, cooking time, experience (furnace-style).
- Strict `validateTypedRecipe` with descriptive errors; `TypedRecipeRegistry` (003 pattern)
  with atomic rejection.
- Deterministic defaults: one shaped (wooden pickaxe), one shapeless (glass), two processing
  (sand->glass, cobblestone->stone).

## Non-goals

- The 2x2/3x3 crafting grid interaction (104/105).
- Furnace execution (109/110).
- Replacing the 010 one-click recipe registry.

## Preconditions

- Change 102 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 102 baseline (1139 unit / 19 e2e).

## Dependencies

- 003 registry patterns; `ItemId`/resource-id vocabulary from `ItemRegistry`.

## Proposed change

- `src/inventory/TypedRecipe.ts` (NEW): `RecipeKind`, `ShapedRecipe`, `ShapelessRecipe`,
  `ProcessingRecipe`, `TypedRecipe`, `validateTypedRecipe`, `TypedRecipeRegistry`,
  `createDefaultTypedRecipes`.
- `tests/unit/TypedRecipe.test.ts` (NEW).

## Compatibility and migration

Additive; the 010 registry is untouched.

## Risks

- Pattern/key validation must be strict and deterministic (uniform rows, defined chars,
  no dead keys, bounded counts).

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Validation accepts exactly the documented shapes per kind and rejects malformed ones with
  descriptive errors.
- The registry rejects duplicates and invalid recipes atomically.
- Defaults register without error and are deterministic.
- Full gate green; 103 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 103 suite; E2E stays 19/19.
