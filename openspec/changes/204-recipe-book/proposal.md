# Proposal: 204-recipe-book

## Problem
103's registry holds all recipes, but the game has no per-player knowledge of them, no search/
filter view, and no helper that lays a recipe's ingredients into the 3x3 crafting grid. 205's
HUD and the crafting screen need these.

## Goals
- `src/inventory/RecipeBook.ts` (NEW), pure and headless-safe:
  - **Known recipes**: immutable `RecipeBookState { known: string[] }` (recipe keys, in unlock
    order); `createDefaultRecipeBook()` (empty); `unlockRecipe(state, key)` (adds, identity no-op
    when present or on an empty key); `unlockRecipes(state, keys)` (bulk, deduped, identity when
    nothing changes); `hasRecipe(state, key)`.
  - **Search/filter**: `searchRecipes(registry, state, query)` — the KNOWN recipes in registry
    order; an empty/blank query returns all known; otherwise a case-insensitive substring match
    against the recipe key, name, or output item id; unknown known keys are skipped silently.
  - **Placement helper**: `layoutRecipe(ingredients)` — maps a recipe's ingredient list into a
    9-cell 3x3 grid (`RecipeGridCell[]`, null = empty), row-major from the top-left, compacted;
    item ingredients resolve to their item path, tag ingredients to their tag id (the wiring
    resolves tags to concrete items); more than 9 ingredients throws descriptively.
    `compactGrid(grid)` — the inverse: the non-null cells in row-major order.
  - **Persistence**: `serializeRecipeBook` / `deserializeRecipeBook` — version 1,
    validate-before-accept (array of non-empty unique strings, exact key set; descriptive
    throws).

## Non-goals
- **No crafting matching** (104/105 own it), **no UI rendering** (the crafting screen renders the
  state), **no recipe unlock triggers** (advancements/experience wiring), **no change to 103**,
  **no `Game.ts` edit**, **no save-format change**.

## Preconditions
- Change 203 (`container-screen-framework`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 103's `RecipeRegistry` / `RecipeDefinition` / `RecipeIngredient` (imported types; the registry
  is injected as a parameter, never modified).

## Proposed change
1. `src/inventory/RecipeBook.ts` (NEW): the known-recipes state, search, layout/compact, and
   versioned persistence.

## Compatibility and migration
- One new inventory file; zero changes to 103 or any registry; no `Game.ts` edit; no schema/
  save-format change.

## Risks
- **Search/ordering drift**. Mitigation: registry-order results and the case-insensitive match
  rules are pinned in tests with real registry keys.
- **Layout shape drift from vanilla**. Mitigation: the compacted top-left row-major rule is
  documented exactly and pinned (1 → cell 0; 4 → the top-left 2x2; 9 → full grid).

## Rollback strategy
One new inventory file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: defaults; unlock (single/bulk/identity); hasRecipe; search (empty query,
  case-insensitive key/name/output matches, unknown-key skip, no match); layout (1/4/9
  ingredients, tag cells, >9 throw); compactGrid; persistence round-trip and every rejection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
