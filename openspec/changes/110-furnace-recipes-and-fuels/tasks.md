# Tasks: 110-furnace-recipes-and-fuels

> VERIFIED. Entry gate confirmed (109 VERIFIED; baseline 1253 unit / 19 e2e green).

- [x] 1. Confirm entry gate (109 VERIFIED; baseline 1253 unit / 19 e2e green).
- [x] 2. Add `src/inventory/FurnaceRecipes.ts` (`FuelValueRegistry` strict + `createDefaultFuelValues` coal 1600/wood 300/planks 300/stick 100; `createFurnaceContext` over 103 processing recipes with duplicate-input rejection; `takeFurnaceXp` floor-drain with fractional carry).
- [x] 3. Extend `src/world/FurnaceBlockEntity.ts` (optional `experienceOf` on `FurnaceContext`, `xp` on `FurnaceState` validated with absent->0, atomic XP grant on cook completion, envelope includes `xp`; `withFurnaceSlots` carries `xp`).
- [x] 4. Add `smelt_raw_iron` default processing recipe, `iron_ingot` item (id 27) and atlas tile 29; update registry enumeration tests and the 109 test expectations for the `xp` field.
- [x] 5. Add `tests/unit/FurnaceRecipes.test.ts` (fuel validation/duplicates, context wiring and duplicate-input rejection, XP drain vectors, end-to-end smelt with XP through `tickFurnace`, backward-compatible payloads).
- [x] 6. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
