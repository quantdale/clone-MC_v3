# Verification: 010-recipe-data-model

Status: **VERIFIED**
Completion: 100%
Advancement allowed: **true**

## Requirement evidence

| Requirement | Evidence (test) | Status |
|---|---|---|
| Unique recipe identity | `Registry`-backed registration; duplicate id throws `DUPLICATE_ID` and leaves the original intact | PASS |
| Ingredient variants (exact item or item tag) | `ExactItemIngredient` / `TagIngredient`; both exercised in tests | PASS |
| Reference validation (item/tag/output resolve) | missing item/tag/output reference throws `RecipeError` before finalization | PASS |
| Output definition (item, positive qty, optional components) | `RecipeOutput`; component map validated by 008 system at construction | PASS |
| Immutable finalized definitions | `freezeDefinition` deep-freezes; `Object.isFrozen(def)` and `Object.isFrozen(def.ingredients)` true; registry finalized | PASS |
| Current catalog equivalence | "migrates every recipe with equivalent ingredient costs and outputs" asserts per-recipe ingredient/output match | PASS |
| Transactional craft behavior | "leaves the inventory unchanged when ingredients are insufficient" and "when output capacity is full"; masonry/tool chain crafts transactionally | PASS |
| Tag ingredient matching | "satisfies a tag ingredient from any member item"; non-member inventory cannot craft | PASS |
| Invalid definition rejection | zero/negative/non-integer quantities, missing references, and over-stack output throw `RecipeError` | PASS |
| No grid/file-loader scope | prototype method scan rejects `grid|file|load`; `RecipeDefinition` has exactly the expected keys | PASS |

## Commands

| Command | Result | Notes |
|---|---|---|
| npm run typecheck | PASS | no errors |
| npm run lint | PASS | no errors |
| npm test (focused suite) | PASS 251/251 | prior 235 + 16 new RecipeRegistry tests |
| npm run build | PASS | `tsc --noEmit && vite build` |
| npm run test:e2e | PASS 19/19 | production build loads; break/place/craft/content green |

## Edge/adversarial validation

- Duplicate recipe ResourceId (or legacy key) is rejected; the prior registration is untouched.
- A referenced item, tag, or output that is not registered fails construction with a typed `RecipeError` (`MISSING_ITEM` / `MISSING_TAG` / `INVALID_QUANTITY` / `INVALID_OUTPUT`) before any recipe becomes craftable.
- A tag ingredient whose tag registry is not finalized is rejected (`TAG_NOT_FINALIZED`); finalizing the tag registry first succeeds.
- Quantities must be positive integers; `0`, negative, and fractional values are rejected.
- Output quantity must not exceed the item's `stackSize` (validated against the item registry).
- A malformed output component map (`StackComponentMap`) cannot be constructed, so a recipe carrying it is rejected at definition time.
- Insufficient ingredients or a full output capacity cause `craft` to return `null` with no inventory mutation (transactional).

## Migration/compatibility validation

- The nine current survival recipes are migrated to ResourceId-based definitions keyed `minecraft:recipe/<key>`, with identical ingredient costs and output item/quantity.
- `CraftingSystem` consumes the new `RecipeRegistry` while exposing the legacy `CraftingRecipe` projection (string id, numeric ingredient pairs, numeric output) so `CraftingPanel` and `Game.ts` are unchanged.
- One-click semantics are preserved: affordability and output capacity are checked before any removal; ingredients are removed only after both checks pass.
- Tag ingredients are supported (any finalized-tag member satisfies the identity portion) but no migrated recipe uses them, so current behavior is identical.

## Performance/resource validation

- Recipe lookup is O(1) average via the 003 `Registry` Map; legacy `recipes` projection and `getByKey` are Map-backed. Ingredient checking remains bounded by recipe ingredient count and fixed inventory size.

## Regressions

- 009 component/inventory model unchanged; full unit suite 251/251 and E2E 19/19 pass; crafting, break/place, hotbar selection, and food consumption e2e scenarios green.

## Incomplete tasks

None. All 21 tasks complete.

## Advancement Exception

Not applicable; 100% completion.

**011 remains blocked until 010 is VERIFIED.**
