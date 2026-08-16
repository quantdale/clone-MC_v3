# Tasks: 220-recipe-loot-content-expansion

## Implementation
- [x] `src/data/RecipeLootExpansion.ts`: `RecipeCategory` / `RecipeDefinition` + `createRecipeDefinition`
      (prefix rule, name optional, output/ingredients, count default 1, category default
      crafting).
- [x] `LootDrop` / `LootDefinition` + `createLootDefinition` (prefix rule, source, drops with
      weight/count rules).
- [x] `RecipeLootExpansion` / `createRecipeLootExpansion` (per-kind duplicate rejection,
      registration order) / `recipeById` / `lootById` / `recipesByOutput` / `lootForSource`.

## Tests
- [x] `tests/unit/RecipeLootExpansion.test.ts`: creation of each kind incl. defaults.
- [x] Every rejection with exact messages (per kind, per drop).
- [x] Expansion grouping/order; per-kind duplicates; lookups; recipesByOutput; lootForSource;
      empty expansion.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2838/2838 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      221-current-release-delta).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
