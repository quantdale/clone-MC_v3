# Verification: 105-crafting-table-3x3

Status: VERIFIED
Completion: 100%
Advancement allowed: true

105 started only after 104 was VERIFIED (7cfd660 / 96f501c).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Session lifecycle | `CraftingTable.test.ts`: empty 3x3 session over the recipe snapshot; immutable slot updates (original unchanged); out-of-bounds cells, empty items, and non-positive counts rejected | PASS |
| Matching and result | wooden_pickaxe matches on the 3x3 table (unlike the 2x2 player grid) with result slot wooden_pickaxe x1; glass matches in a 2x2 corner of the table; empty or non-matching sessions yield null match/result | PASS |
| Take result | pickaxe take consumes exactly the five pattern cells (grid fully empty afterwards, no re-match); glass take consumes all four sand cells; no-match take returns the same session (identity) and null; deterministic | PASS |
| Block id | `CRAFTING_TABLE_BLOCK_ID === 13` documented | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/CraftingTable.test.ts` | PASS | 10/10 |
| `npm test` | PASS | 118 files, 1172/1172 (1162 baseline + 10 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.59s |
| `npm run test:e2e` | PASS | 19/19 (1.4m) |

## Edge / adversarial validation

- Immutability verified (original session unchanged after updates and after takes);
  bounds and slot validation verified; take-result consumption pinned cell-by-cell for both
  shaped and shapeless recipes; no-match take verified by session identity; determinism
  verified.

## Migration / compatibility validation

Additive: new `src/inventory/CraftingTable.ts` + test file. No existing modules touched;
`CRAFTING_TABLE_BLOCK_ID` documents the reserved id 13 for the block expansion.

## Performance / resource validation

All operations O(recipes x 9 cells). Unit suite duration unchanged (~10s, 118 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 1172/1172 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 105 the crafting-table 3x3 grid and interaction semantics are in place. Advance to
106-container-menu-transaction-core.
