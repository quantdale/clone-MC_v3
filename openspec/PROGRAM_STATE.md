# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **105-crafting-table-3x3 — VERIFIED 100%**
- Active implementation change: **105-crafting-table-3x3 — VERIFIED**
- Next change: **106-container-menu-transaction-core — NOT YET ACTIVE (artifacts pending)**
- 105 task ledger: **4 total tasks, 4 completed**
- 105 completion: **100%**
- 105 mandatory crafting-table-3x3 requirements: **PASS**
- 105 required-test gate: **PASS — unit 1172/1172, E2E 19/19**
- 105 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `6f09be531d0f0b18e6c51fa9501442f9b15a2d21`
- Next exact action: **Advance to 106-container-menu-transaction-core. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (106 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement slot/menu transaction rules reusable by crafting and storage screens, verify full gate, commit + push, advance program state.**

## What 105 implemented

Change 105 adds the crafting-table 3x3 session model and interaction semantics.

- `src/inventory/CraftingTable.ts` (NEW) — `CraftingTableSession` (3x3 `CraftingGrid` over a
  readonly `TypedRecipe` snapshot); `createCraftingTableSession`/`setCraftingTableSlot`
  (immutable, bounds and slot validation); `craftingTableMatch`/`craftingTableResult` (104
  evaluator, first match wins); `takeCraftingTableResult` (consumes exactly the matched cells
  and returns the result slot; unchanged session + null on no match; never throws);
  `CRAFTING_TABLE_BLOCK_ID = 13` (documented reserved block id for the block expansion).
- `tests/unit/CraftingTable.test.ts` (NEW) — 10 tests: session lifecycle and immutability,
  match/result for the wooden pickaxe (crafts on the 3x3 table, unlike the 2x2 player grid)
  and glass (2x2 corner of the table), exact take-result consumption vectors for both kinds,
  no-match take returning the same session, determinism.

## Validation evidence (105)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1172/1172 (prior 1162 + 10 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 105 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 105
suites, the full unit suite (1172/1172, stable), production build, and the required E2E suite
(19/19). No advancement exception was needed.

## Next change: 106 (pending artifacts)

`106-container-menu-transaction-core` is named in `CHANGE_SEQUENCE.md` with scope "Slot/menu
transaction rules reusable by crafting and storage screens." Per `AGENTS.md`, a change lacking
full artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 105 verification.
Change 106 is the next change; its artifacts must be authored and validated before implementation
begins.
