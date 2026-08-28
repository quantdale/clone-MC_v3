# Tasks: 204-recipe-book

## Implementation
- [x] `src/inventory/RecipeBook.ts`: `RecipeBookState` + `createDefaultRecipeBook` +
      `unlockRecipe` / `unlockRecipes` / `hasRecipe` (identity no-ops, unlock order).
- [x] `searchRecipes` (known-only, registry order, blank = all, case-insensitive
      key/name/output match, unknown-key skip).
- [x] `layoutRecipe` (9-cell row-major compacted fill; item/tag cells; >9 throw) +
      `compactGrid`.
- [x] `serializeRecipeBook` / `deserializeRecipeBook` (version 1, validate-before-accept,
      descriptive throws).

## Tests
- [x] `tests/unit/RecipeBook.test.ts`: defaults; unlock single/re-unlock/empty identity; bulk
      order + identity; hasRecipe.
- [x] Search: blank; key/name/output matches (case-insensitive); unknown-key skip; no match.
- [x] Layout: 1/4/9 ingredients; tag cell; >9 throw.
- [x] Compact: mixed grid; all-null.
- [x] Persistence: round-trip; rejections (non-object, bad version, non-array, empty/duplicate
      entries, unknown key) each named.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2679/2679 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 205-hud-parity).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
