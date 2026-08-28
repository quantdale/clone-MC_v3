# Tasks: 219-enchantment-potion-content-expansion

## Implementation
- [x] `src/data/EnchantmentPotionExpansion.ts`: three definition kinds + constructors
      (per-kind prefix rules, field validation; defaults maxLevel 1 / incompatible [] /
      maxAmplifier 3).
- [x] `CatalogExpansion` / `createCatalogExpansion` (per-kind duplicate rejection, registration
      order) / `enchantmentById` / `effectById` / `potionById` / `potionsForEffect`.

## Tests
- [x] `tests/unit/EnchantmentPotionExpansion.test.ts`: creation of each kind incl. defaults.
- [x] Every rejection with exact messages (per kind).
- [x] Catalog grouping/order; per-kind duplicates; lookups; potionsForEffect (incl. dangling
      references); empty catalog.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2830/2830 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      220-recipe-loot-content-expansion).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
