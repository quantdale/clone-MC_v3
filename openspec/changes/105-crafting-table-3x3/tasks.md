# Tasks: 105-crafting-table-3x3

> VERIFIED. Entry gate confirmed (104 VERIFIED; baseline 1162 unit / 19 e2e green).

- [x] 1. Confirm entry gate (104 VERIFIED; baseline 1162 unit / 19 e2e green).
- [x] 2. Add `src/inventory/CraftingTable.ts` (`CRAFTING_TABLE_BLOCK_ID = 13` documented, `CraftingTableSession` 3x3 grid + recipe snapshot, immutable `createCraftingTableSession`/`setCraftingTableSlot`, `craftingTableMatch`/`craftingTableResult`, exact `takeCraftingTableResult` consumption semantics).
- [x] 3. Add `tests/unit/CraftingTable.test.ts` (session lifecycle, immutability, match/result for pickaxe and glass, exact take-result consumption vectors, no-match take unchanged, determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
