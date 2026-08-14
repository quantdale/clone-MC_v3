# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **103-recipe-registry-loader — VERIFIED 100%**
- Active implementation change: **103-recipe-registry-loader — VERIFIED**
- Next change: **104-player-2x2-crafting — NOT YET ACTIVE (artifacts pending)**
- 103 task ledger: **4 total tasks, 4 completed**
- 103 completion: **100%**
- 103 mandatory recipe-registry-loader requirements: **PASS**
- 103 required-test gate: **PASS — unit 1148/1148, E2E 19/19**
- 103 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `390a40bc4e90645bfe29cd2a9968cc7ad6f131e1`
- Next exact action: **Advance to 104-player-2x2-crafting. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (104 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement the true 2x2 ingredient grid and result consumption semantics over 103 recipes, verify full gate, commit + push, advance program state.**

## What 103 implemented

Change 103 adds the typed recipe vocabulary: shaped, shapeless, and processing definitions.

- `src/inventory/TypedRecipe.ts` (NEW) — `TypedRecipe` union: `shaped` (1-3x1-3 pattern grid,
  uppercase A-Z keys, `_` empty cells, no dead keys, at least one non-empty cell),
  `shapeless` (1-9 non-empty ingredients), `processing` (single input, positive integer
  cookingTime, finite experience >= 0); result item resource-id string with count in
  `[1, MAX_RECIPE_COUNT (64)]`; strict `validateTypedRecipe`; `TypedRecipeRegistry` (003
  pattern, atomic rejection, `all()`); `createDefaultTypedRecipes` (wooden_pickaxe shaped
  `['WWW','_S_','_S_']` W=planks S=stick; glass shapeless 4x sand; smelt_sand and
  smelt_cobblestone processing 200 ticks xp 0.1). The 010 one-click recipe registry is
  untouched.
- `tests/unit/TypedRecipe.test.ts` (NEW) — 9 tests: per-kind validation matrices, registry
  lifecycle/atomicity, defaults exactness and determinism.

## Validation evidence (103)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1148/1148 (prior 1139 + 9 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 103 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 103
suites, the full unit suite (1148/1148, stable), production build, and the required E2E suite
(19/19). No advancement exception was needed.

## Next change: 104 (pending artifacts)

`104-player-2x2-crafting` is named in `CHANGE_SEQUENCE.md` with scope "True 2×2 ingredient grid
and result consumption semantics." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 103 verification.
Change 104 is the next change; its artifacts must be authored and validated before implementation
begins.
