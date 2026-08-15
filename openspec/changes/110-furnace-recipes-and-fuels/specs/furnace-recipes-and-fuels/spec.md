# Spec: furnace-recipes-and-fuels

## Contract

`FuelValueRegistry.register` MUST accept each item at most once with an integer `burnTicks`
>= 1 and MUST throw on duplicates or invalid values. `burnTicksOf` MUST return 0 for absent
items. `createDefaultFuelValues` MUST register coal 1600, wood 300, planks 300, stick 100.
`createFurnaceContext` MUST resolve `fuelBurnTicks`/`cookTicks`/`resultOf`/`experienceOf` from
the 103 `processing` recipes and the fuel registry, and MUST throw when two processing recipes
share an input. `tickFurnace` MUST grant the recipe's experience exactly once per completed
cook, atomically with input consumption and result production. `FurnaceState.xp` MUST be a
finite number >= 0; payloads without `xp` MUST validate as 0. `takeFurnaceXp` MUST return
`{ taken: floor(xp), remaining: xp - floor(xp) }` and MUST throw on invalid xp.

## Definitions

- **Fuel value**: an item resource-id string mapped to integer burn ticks (>= 1).
- **Processing recipe**: 103 kind `'processing'` (`input`, `result`, `cookingTime`,
  `experience`).
- **XP**: a float accumulated per completed cook; the integer floor is granted on take and the
  fraction is carried.
- **Default fuels**: coal 1600, wood 300, planks 300, stick 100.

## Invariants

- Registries are atomic: a failed registration leaves them unchanged.
- Recipe/fuel lookups are exact by item string; unknown items return 0/null.
- Each completed cook adds exactly the recipe's experience, once.
- XP is always finite and >= 0; identical inputs produce identical outputs.

## Requirements

### Requirement: fuel registry
`FuelValueRegistry` MUST implement the documented rules.

#### Scenario: registration and lookup
- **GIVEN** a registry with coal 1600
- **WHEN** items are looked up
- **THEN** coal returns 1600, an absent item returns 0, `has` reflects membership, and the
  defaults register exactly the documented four fuels.

#### Scenario: invalid registrations
- **GIVEN** duplicate items, zero/negative/fractional burn ticks, or empty item strings
- **WHEN** registration runs
- **THEN** a descriptive error is thrown and the registry is unchanged.

### Requirement: context wiring
`createFurnaceContext` MUST resolve the 109 context exactly.

#### Scenario: resolution
- **GIVEN** the default typed recipes and default fuels
- **WHEN** the context runs lookups
- **THEN** `fuelBurnTicks('minecraft:coal')` is 1600; `cookTicks('minecraft:sand')` is 200;
  `resultOf('minecraft:sand')` is glass x1; `experienceOf('minecraft:cobblestone')` is 0.1;
  unknown items yield 0/null.

#### Scenario: duplicate input rejection
- **GIVEN** two processing recipes with the same input
- **WHEN** the context is built
- **THEN** a descriptive error is thrown.

### Requirement: XP accumulation
`tickFurnace` MUST grant experience atomically on completion.

#### Scenario: smelt with XP
- **GIVEN** a furnace with input sand x2 and fuel coal x1 and the default context
- **WHEN** 200 ticks run
- **THEN** one sand is consumed, one glass is in the output, and `xp` is 0.1; after 200 more
  ticks, two glasses and `xp` 0.2.

#### Scenario: no XP without completion
- **GIVEN** a paused or unfinished furnace
- **WHEN** ticks run
- **THEN** `xp` stays unchanged.

### Requirement: XP drain
`takeFurnaceXp` MUST implement floor-drain with fractional carry.

#### Scenario: drains
- **GIVEN** xp 1.7, xp 2.0, xp 0.3, and xp 0
- **WHEN** `takeFurnaceXp` runs
- **THEN** taken/remaining are 1/0.7, 2/0, 0/0.3, and 0/0; invalid xp (negative, NaN,
  non-finite) throws.

### Requirement: backward compatibility
Payloads without `xp` MUST load as 0.

#### Scenario: legacy payload
- **GIVEN** a 109-shape payload without an `xp` field
- **WHEN** `deserializeFurnaceState` runs
- **THEN** the state has `xp` 0; payloads with invalid `xp` throw.

### Requirement: iron ingot data
The iron_ingot item and smelt_raw_iron recipe MUST be registered.

#### Scenario: registry integration
- **GIVEN** the default item registry and default typed recipes
- **WHEN** item id 27 and the `smelt_raw_iron` recipe are looked up
- **THEN** the item key is `iron_ingot`; the recipe input is `minecraft:raw_iron`, result
  `minecraft:iron_ingot` x1, 200 ticks, 0.7 XP; `validateItemBlockCrossReferences` passes.

## Error and failure behavior

Duplicate/invalid registrations, duplicate recipe inputs, invalid xp, and legacy-incompatible
payloads throw descriptive errors; valid inputs never throw.

## Performance and resource bounds

All lookups O(1); context construction O(recipes + fuels).

## Compatibility and migration

Payloads without `xp` load as 0; `experienceOf` absent behaves as 0. No data migration.

## Security and integrity

XP validated on read and on drain; registries atomic.

## Observability

Plain data; tests assert exact lookups, states, XP values, and drains.

## Verification mapping

- `tests/unit/FurnaceRecipes.test.ts` — fuel validation/duplicates, context resolution and
  duplicate-input rejection, XP drain vectors, end-to-end smelting with XP accumulation
  through `tickFurnace`, backward-compatible payloads, iron ingot/recipe data.
