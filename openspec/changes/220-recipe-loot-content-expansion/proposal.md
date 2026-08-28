# Proposal: 220-recipe-loot-content-expansion

## Problem
215-219 expanded content as data; crafting/processing/loot coverage for that content is missing.
220 fills it with data-driven recipe and loot definitions over 103/110's systems — the
established no-new-architecture pattern.

## Goals
- `src/data/RecipeLootExpansion.ts` (NEW), pure and headless-safe:
  - **Recipes**: `RecipeDefinition { id, name?, output, count, ingredients, category }` —
    namespaced id (path without a `recipe/` prefix), optional non-empty `name`, `output` a
    non-empty item id, `count` a positive integer (default 1), `ingredients` non-empty item ids,
    `category` one of `crafting|smelting|brewing` (default crafting).
  - **Loot**: `LootDefinition { id, source, drops }` — id without a `loot/` prefix, non-empty
    `source` (entity/block id), `drops` a non-empty list of
    `{ item, weight, count: [min, max] }` with non-empty item ids, positive integer weights, and
    positive-integer count pairs with min <= max.
  - **Expansion**: `createRecipeLootExpansion({ recipes?, loot? })` — `RecipeLootExpansion {
    recipes, loot }` in registration order with per-kind duplicate-id rejection;
    `recipeById` / `lootById`; `recipesByOutput(expansion, itemId)`; `lootForSource(expansion,
    source)`.

## Non-goals
- **No registry mutation** (103/110 stay untouched with characterization pinned), **no recipe
  matching changes** (104/105/109/110 consume the definitions), **no `Game.ts` edit**, **no
  save-format change**.

## Preconditions
- Change 219 (`enchantment-potion-content-expansion`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 004's `ResourceId` helpers (imported; no registry changes).

## Proposed change
1. `src/data/RecipeLootExpansion.ts` (NEW): the two definition kinds, validation, and the
   expansion queries.

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Drop-range drift**. Mitigation: the weight/count constraints (positive ints, min <= max) are
  pinned in tests with exact messages.

## Rollback strategy
One new data file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: valid definitions of each kind (defaults + explicit); every rejection;
  expansion grouping/order; per-kind duplicates; lookups; recipesByOutput; lootForSource; empty
  expansion.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
