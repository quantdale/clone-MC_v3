# Proposal: 110-furnace-recipes-and-fuels

## Problem

109's `tickFurnace` runs against an injected `FurnaceContext`, but nothing supplies real data:
no smelting-recipe consumption (103's `TypedRecipeRegistry` already defines `processing`
recipes like `smelt_sand`), no fuel-value registry, and no XP accumulation/grant. The furnace
state cannot yet smelt anything in practice and grants no experience.

## Goals

- `src/inventory/FurnaceRecipes.ts` (NEW):
  - `FuelValueRegistry` (strict, atomic, duplicate-rejecting) + `createDefaultFuelValues()`
    (coal 1600, wood log 300, planks 300, stick 100 burn ticks — original data aligned with
    vanilla proportions);
  - `createFurnaceContext(recipes, fuels)` — wires a 103 `TypedRecipeRegistry` (processing
    kind) and the fuel registry into 109's `FurnaceContext` (`fuelBurnTicks`/`cookTicks`/
    `resultOf`/`experienceOf`), rejecting duplicate processing inputs atomically;
  - `takeFurnaceXp(xp)` — drains the integer floor and carries the fraction (vanilla-style
    fractional XP carry); `FURNACE_XP_SLOT`? not needed.
- 109 module extensions (additive, backward compatible):
  - `FurnaceState.xp` (validated finite >= 0; absent payloads default to 0 so existing saves
    load);
  - `FurnaceContext.experienceOf` (optional; absent = 0) so `tickFurnace` grants XP atomically
    on cook completion (the consume+produce+xp transition stays a single transaction).
- Data: `smelt_raw_iron` processing recipe (raw_iron -> iron_ingot, 200 ticks, 0.7 XP) added
  to `createDefaultTypedRecipes`; new `iron_ingot` item (id 27) with an original procedural
  atlas tile (index 29).
- `tests/unit/FurnaceRecipes.test.ts` covering fuel validation, context wiring, XP drain,
  end-to-end smelting with XP accumulation through `tickFurnace`, and backward-compatible
  payloads.

## Non-goals

- Furnace screen UI / XP orb entities (117-player-experience).
- Fuel consumption display wiring.
- New recipe kinds beyond the 103 `processing` kind.

## Preconditions

- Change 109 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 109 baseline (1253 unit / 19 e2e).

## Dependencies

- 109 `FurnaceBlockEntity` (`FurnaceState`, `FurnaceContext`, `tickFurnace`), 103
  `TypedRecipeRegistry`/`ProcessingRecipe`, 004 `ItemRegistry` vocabulary.

## Proposed change

- `src/inventory/FurnaceRecipes.ts` (NEW): `FuelValueRegistry`, `createDefaultFuelValues`,
  `createFurnaceContext`, `takeFurnaceXp`, `furnaceXpTotal`.
- `src/world/FurnaceBlockEntity.ts`: `xp` field on `FurnaceState` (absent -> 0), optional
  `experienceOf` on `FurnaceContext`, XP grant on cook completion, envelope includes `xp`.
- `src/inventory/TypedRecipe.ts`: add `smelt_raw_iron` to the default processing recipes.
- `src/inventory/ItemRegistry.ts`: `IronIngot` item id 27.
- `src/rendering/TextureAtlas.ts`: `ironIngot` tile index 29.
- `tests/unit/FurnaceRecipes.test.ts` (NEW); 109 test file updated for the `xp` field;
  registry enumeration tests updated for the new item.

## Compatibility and migration

The furnace payload gains an optional `xp` field; payloads without it validate as `xp: 0`, so
existing 109 saves load unchanged. `experienceOf` is optional in `FurnaceContext`, so existing
109 contexts behave as before.

## Risks

- Floating-point XP fractions must stay deterministic; the drain uses `floor` + carry and
  tests use exact/closest comparisons.
- The 109 state shape changes (additive field); all 109 tests re-verified.

## Rollback strategy

Revert the commit; the additive fields keep 109 behavior identical when unused.

## Definition of Done

- Fuel registry validates strictly; defaults match the documented values.
- `createFurnaceContext` rejects duplicate processing inputs and resolves recipes/fuels
  exactly.
- `tickFurnace` grants XP atomically on completion; `takeFurnaceXp` drains floor and carries
  the fraction.
- A full smelt run through the default context produces the expected outputs and XP.
- Full gate green; 110 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 110 suite; E2E stays 19/19.
