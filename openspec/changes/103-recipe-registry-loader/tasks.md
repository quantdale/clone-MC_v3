# Tasks: 103-recipe-registry-loader

> VERIFIED. Entry gate confirmed (102 VERIFIED; baseline 1139 unit / 19 e2e green).

- [x] 1. Confirm entry gate (102 VERIFIED; baseline 1139 unit / 19 e2e green).
- [x] 2. Add `src/inventory/TypedRecipe.ts` (`RecipeKind`, `RecipeResult`, `ShapedRecipe`/`ShapelessRecipe`/`ProcessingRecipe`, `TypedRecipe`, strict `validateTypedRecipe` (uniform 1-3x1-3 patterns, defined/no-dead-key chars, 1-9 ingredients, bounded counts, cooking time/experience rules), `TypedRecipeRegistry` with atomic rejection and `all()`, `createDefaultTypedRecipes` with wooden_pickaxe/glass/smelt_sand/smelt_cobblestone).
- [x] 3. Add `tests/unit/TypedRecipe.test.ts` (per-kind validation matrices, registry lifecycle/atomicity, defaults exactness and determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
