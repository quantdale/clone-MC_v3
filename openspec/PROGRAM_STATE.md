# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **010-recipe-data-model — VERIFIED 100%**
- Active implementation change: **010-recipe-data-model — VERIFIED (ready to advance)**
- Next change: **011-loot-table-data-model — NOT ACTIVE**
- 010 task ledger: **21 total tasks, 21 completed**
- 010 completion: **100%**
- 010 mandatory recipe-model requirements: **PASS**
- 010 required-test gate: **PASS — unit 251/251, E2E 19/19**
- 010 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `6a0664ccf829f25c8a99cebd55c083ca7e3128b9`
- Next exact action: **Advance to 011-loot-table-data-model: read its artifacts, run baseline, implement deterministic loot-table primitives for block/entity drops and conditions, verify full gate, commit + push, advance program state.**

## What 010 implemented

Change 010 replaced the recipe definition layer with namespaced ResourceId-based, immutable recipe definitions:

- `src/inventory/RecipeRegistry.ts` — `RecipeDefinition` / `RecipeIngredient` (exact-item or item-tag) / `RecipeOutput` (item, positive quantity, optional validated stack-component data) identified by `ResourceId`; `RecipeRegistry` validates every item/tag/output reference and positive-integer quantity before finalizing on the 003 generic registry core (O(1) lookup). Definitions are deep-frozen on registration. `buildCurrentRecipes` / `createDefaultRecipeRegistry` migrate the nine current survival recipes with identical costs/outputs.
- `src/inventory/Crafting.ts` — `CraftingSystem` consumes the new `RecipeRegistry` and exposes a legacy `CraftingRecipe` projection (string id, numeric ingredient pairs, numeric output) so `CraftingPanel` / `Game.ts` are unchanged. One-click semantics preserved: affordability and output capacity checked before any removal; ingredients removed only after both checks pass (transactional). Tag ingredients supported (any finalized-tag member satisfies identity).
- `tests/unit/RecipeRegistry.test.ts` — 16 tests covering unique identity, exact/tag ingredient matching, missing/invalid reference and quantity rejection, output component validation, immutable finalized definitions, transactional insufficient/full-capacity behavior, and full current-catalog equivalence.

## Validation evidence (010)

- typecheck: PASS
- lint: PASS
- unit: PASS 251/251 (prior 235 + 16 new RecipeRegistry tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 010 is **VERIFIED** at 21/21 (100%). All gates are green: typecheck, lint, full unit suite (251/251), production build, and the required E2E suite (19/19). No advancement exception was needed. The migration is behavior-preserving (current costs/outputs identical) and the UI wiring is unchanged.

**Change 011 is authorized to begin.** It is fully specified (proposal, design, tasks, specs, verification) and may start once its entry gate confirms this state.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 010 verification. Change 011 is the active change; begin at its task 1.1 and do not migrate 012+ scope.
