# Tasks: 104-player-2x2-crafting

> VERIFIED. Entry gate confirmed (103 VERIFIED; baseline 1148 unit / 19 e2e green).

- [x] 1. Confirm entry gate (103 VERIFIED; baseline 1148 unit / 19 e2e green).
- [x] 2. Add `src/inventory/CraftingGrid.ts` (`CraftingSlot`/`CraftingGrid` with strict validation, `createCraftingGrid`/`emptyCraftingGrid`/`setCraftingSlot` immutable helpers, deterministic `matchCraftingRecipe` with documented shaped/shapeless semantics, `craftCraftingGrid` returning result + consumed coordinates).
- [x] 3. Add `tests/unit/CraftingGrid.test.ts` (grid validation, immutability, shaped match vectors incl. fit/empty/extras/too-large/offset, shapeless multiset matching, first-match order, consumption coordinates, default-recipe integration).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
