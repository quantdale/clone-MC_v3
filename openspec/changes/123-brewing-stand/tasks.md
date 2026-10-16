# Tasks: 123-brewing-stand

Status: COMPLETE
Completion: 100%

## Task 1 — Recipe data + context

- [x] `src/inventory/BrewingRecipes.ts`: `BrewingContext`, `BrewingRecipeOutput`,
      `createDefaultBrewingContext` with the starter table (water→awkward, awkward+reagents,
      redstone/glowstone modifiers, fermented_spider_eye inversion), blaze-powder fuel,
      `brewTicks()`.
- [x] Constants: `BREWING_STAND_TYPE_KEY`, slot indices.

## Task 2 — MenuSlot components extension

- [x] EDIT `src/inventory/MenuTransaction.ts`: add optional `components?` to `MenuSlot`
      (additive, backward compatible).

## Task 3 — Brewing stand engine

- [x] `src/world/BrewingStandBlockEntity.ts`: `BrewingState`, `validateBrewingState`,
      `createBrewingState`, immutable `tickBrewing` (fuel-light, brew timer, recipe apply,
      ingredient/fuel consumption), `serialize/deserialize`, block-entity factory/read/
      update, progress helpers.

## Task 4 — Unit tests

- [x] `tests/unit/BrewingRecipes.test.ts`: recipe match table, null for unknown pairs,
      fuel + brewTicks.
- [x] `tests/unit/BrewingStandBlockEntity.test.ts`: no-bottle pause, fuel light + burn
      down, brew completion writes potion + consumes ingredient, redstone extension,
      invalid/missing potion safe pause, serialize round-trip, 109/122 regression.

## Task 5 — Full regression gate

- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
      `npm run test:e2e` all green.
- [x] Update `verification.md` with real evidence; mark VERIFIED at 100%.

## Task 6 — Documentation / state

- [x] Update `openspec/PROGRAM_STATE.md` "What 123 implemented" + checkpoint.
- [x] Advance `openspec/PROGRAM_STATE.json` (currentChange 123 VERIFIED, next 124).
- [x] Commit impl + state; push to `origin/main`; verify remote == local.
