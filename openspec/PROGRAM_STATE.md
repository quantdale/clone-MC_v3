# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **104-player-2x2-crafting — VERIFIED 100%**
- Active implementation change: **104-player-2x2-crafting — VERIFIED**
- Next change: **105-crafting-table-3x3 — NOT YET ACTIVE (artifacts pending)**
- 104 task ledger: **4 total tasks, 4 completed**
- 104 completion: **100%**
- 104 mandatory player-2x2-crafting requirements: **PASS**
- 104 required-test gate: **PASS — unit 1162/1162, E2E 19/19**
- 104 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `7cfd660c7378f18207023e9f509ece4209f2226c`
- Next exact action: **Advance to 105-crafting-table-3x3. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (105 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement crafting-table block interaction and the 3x3 grid (104 evaluator over 103 recipes), verify full gate, commit + push, advance program state.**

## What 104 implemented

Change 104 adds the true ingredient-grid evaluation and consumption semantics.

- `src/inventory/CraftingGrid.ts` (NEW) — `CraftingSlot` (item resource-id + payload count)
  and validated `CraftingGrid` (1-3 x 1-3, row-major); `createCraftingGrid`/
  `emptyCraftingGrid`/`setCraftingSlot` (immutable updates, out-of-bounds and bad slots
  rejected); `matchCraftingRecipe` (deterministic, first match in input order: shaped
  patterns fit top-left with `_` matching empty slots and no filled cells outside the
  pattern; shapeless matches by ingredient multiset; processing recipes never match);
  `craftCraftingGrid` (exact recipe result + consumed cell coordinates, or null; never
  throws).
- `tests/unit/CraftingGrid.test.ts` (NEW) — 14 tests: construction matrix and immutability,
  shaped match vectors (exact fit, too-large patterns, extra cells, wrong items), shapeless
  multiset matching, first-match order, exact consumption for both kinds, non-matches and
  processing recipes, determinism, default-recipe integration (2x2 glass matches, 3x3
  pickaxe does not fit a 2x2 grid).

## Validation evidence (104)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1162/1162 (prior 1148 + 14 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 104 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 104
suites, the full unit suite (1162/1162, stable), production build, and the required E2E suite
(19/19). No advancement exception was needed.

## Next change: 105 (pending artifacts)

`105-crafting-table-3x3` is named in `CHANGE_SEQUENCE.md` with scope "Crafting-table block
interaction and 3×3 grid." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 104 verification.
Change 105 is the next change; its artifacts must be authored and validated before implementation
begins.
