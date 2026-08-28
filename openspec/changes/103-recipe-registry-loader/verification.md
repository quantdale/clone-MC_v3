# Verification: 103-recipe-registry-loader

Status: VERIFIED
Completion: 100%
Advancement allowed: true

103 started only after 102 was VERIFIED (754908c / 485dc9f).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Shaped validation | `TypedRecipe.test.ts`: valid 3x3 and 1x1 patterns accepted; empty/4-row patterns, ragged widths, all-empty patterns, pattern chars not in keys (with the keys loop passing first), keys chars absent from the pattern, empty key values, lowercase key chars, empty recipe keys, and invalid result counts (0, 65) all rejected with field-naming errors | PASS |
| Shapeless validation | valid accepted; zero/ten ingredients, empty/non-string entries rejected | PASS |
| Processing validation | valid accepted; empty input, zero/negative/fractional cookingTime, negative/NaN experience rejected | PASS |
| Registry | register/get/has/size/all/clear round-trip (order preserved); duplicate key and invalid recipe rejected atomically (size unchanged, absent key stays absent) | PASS |
| Defaults | exactly wooden_pickaxe (shaped, `['WWW','_S_','_S_']`, W=planks S=stick, result wooden_pickaxe x1), glass (shapeless, 4x sand), smelt_sand and smelt_cobblestone (processing, 200 ticks, xp 0.1); repeated construction equal; every default re-validates | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/TypedRecipe.test.ts` | PASS | 9/9 |
| `npm test` | PASS | 116 files, 1148/1148 (1139 baseline + 9 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.43s |
| `npm run test:e2e` | PASS | 19/19 (1.4m) |

## Edge / adversarial validation

- Shaped validation covers pattern structure (rows/width/emptiness), key rules (defined,
  no dead keys, uppercase, non-empty values), and result bounds (1..64).
- Shapeless bounds (1..9), processing numeric rules (positive integer time, finite non-negative
  experience), registry atomicity, and defaults exactness all verified.

## Migration / compatibility validation

Additive: new `src/inventory/TypedRecipe.ts` + test file. The 010 recipe registry and the
one-click crafting UI are untouched; item references use the `ItemRegistry` resource-id
vocabulary.

## Performance / resource validation

Validation O(pattern area) for shaped, O(ingredients) otherwise; registry O(1) lookups. Unit
suite duration unchanged (~10s, 116 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 1148/1148 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 103 shaped, shapeless, and processing recipe definitions load and validate. Advance
to 104-player-2x2-crafting.
