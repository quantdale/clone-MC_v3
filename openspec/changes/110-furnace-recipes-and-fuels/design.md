# Design: 110-furnace-recipes-and-fuels

## Context/current state

- 109 `FurnaceBlockEntity` ticks against an injected `FurnaceContext`
  (`fuelBurnTicks`/`cookTicks`/`resultOf`) with no real data; `FurnaceState` has no XP.
- 103 `TypedRecipeRegistry` already defines `processing` recipes (`smelt_sand`, `smelt_cobblestone`).
- Item vocabulary is resource-id strings (`minecraft:sand`); `ItemId` uses 0-26; atlas tiles
  0-28.

## Target state

Real smelting: a strict fuel registry, a `FurnaceContext` built from the typed recipe registry,
XP accumulation granted atomically on cook completion, and an iron ingot item so
raw_iron -> iron_ingot smelts.

## Invariants

- `FuelValueRegistry` accepts each item at most once, with integer burn ticks >= 1.
- `createFurnaceContext` throws on duplicate processing inputs (atomic, deterministic).
- `tickFurnace` grants the recipe's experience exactly once per completed cook, atomically
  with input consumption and result production.
- `FurnaceState.xp` is a finite number >= 0; payloads without `xp` load as 0.
- Identical inputs produce identical outputs (including XP).

## API and data model

`src/inventory/FurnaceRecipes.ts` (NEW):

- `interface FuelValue { item: string; burnTicks: number }`.
- `class FuelValueRegistry` — `register(item, burnTicks)` (strict, duplicate-rejecting),
  `burnTicksOf(item): number` (0 when absent), `has(item)`, `size`, `all(): FuelValue[]`.
- `createDefaultFuelValues(): FuelValueRegistry` — coal 1600, wood 300, planks 300, stick 100.
- `createFurnaceContext(recipes: TypedRecipeRegistry, fuels: FuelValueRegistry):
  FurnaceContext` — indexes processing recipes by input (duplicate input throws), resolves
  `fuelBurnTicks`/`cookTicks`/`resultOf`/`experienceOf`.
- `takeFurnaceXp(xp: number): { taken: number; remaining: number }` — validates finite >= 0;
  `taken = floor(xp)`, `remaining = xp - taken` (vanilla fractional carry).
- `furnaceXpTotal(state: FurnaceState): number` — convenience read of the validated xp.

`src/world/FurnaceBlockEntity.ts` (extensions):

- `FurnaceState` gains `xp: number` (validation: finite >= 0; parse absent as 0).
- `FurnaceContext` gains optional `experienceOf(item: string): number` (absent = 0).
- `tickOnce` captures `experience = experienceOf(input.item)` before consumption and adds it
  to `state.xp` in the cook-completion transition.
- `serializeFurnaceState` includes `xp`; `deserializeFurnaceState` accepts absent `xp`.

Data: `smelt_raw_iron` processing recipe (input `minecraft:raw_iron`, result
`minecraft:iron_ingot` x1, 200 ticks, 0.7 XP) added to `createDefaultTypedRecipes`;
`IronIngot` item id 27 (iconTile 29, stackSize 64); `ironIngot` atlas tile 29.

## Control/data flow

Wiring: `createFurnaceContext(defaultTypedRecipes, defaultFuelValues)` ->
`tickFurnace(state, ctx)` accumulates XP -> screen take: `takeFurnaceXp(state.xp)` grants
floor XP to the player and the fraction stays in the state (wiring responsibility).

## Detailed behavior

- Fuel lookup is exact: absent items burn 0 ticks and are never consumed (109 rule).
- Recipe lookup is exact by input item; unknown inputs have no result, no cook time, no XP.
- On cook completion the new state atomically carries: input -1, output +result, `xp +=
  experience`, smelt timers reset.
- XP is float; the drain floor/carry keeps deterministic whole-XP grants.
- 109 behavior is unchanged when `experienceOf` is absent and `xp` stays 0.

## Failure modes

Duplicate fuel items, duplicate processing inputs, invalid burn ticks, invalid xp values, and
negative/NaN drains throw descriptive errors; valid inputs never throw.

## Compatibility/migration

Payloads without `xp` load as 0 (109 saves unaffected). `experienceOf` optional.

## Performance/resource constraints

Context lookup is O(1) via maps; tick cost unchanged.

## Testing seams

Pure registries and context factory; end-to-end tests run `tickFurnace` with the default
context.

## Observability/debugging

Plain data; tests assert exact states, XP values, and drained amounts.

## Affected files/symbols

- `src/inventory/FurnaceRecipes.ts` (NEW)
- `src/world/FurnaceBlockEntity.ts` (`xp`, `experienceOf`, tick grant, envelope)
- `src/inventory/TypedRecipe.ts` (`smelt_raw_iron` default)
- `src/inventory/ItemRegistry.ts` (`ItemId.IronIngot`)
- `src/rendering/TextureAtlas.ts` (`ironIngot` tile 29)
- `tests/unit/FurnaceRecipes.test.ts` (NEW); `FurnaceBlockEntity.test.ts` updated; registry
  enumeration tests updated

## Rejected alternatives

- A separate XP field outside `FurnaceState`: XP must persist with the entity; it belongs in
  the envelope.
- A parallel smelting-recipe registry duplicating 103's `processing` kind: 103 already owns
  the vocabulary; 110 consumes it.
- Integer XP storage: vanilla uses fractional XP; floor-drain with carry matches it.

## Downstream dependencies

117 consumes drained XP for player levels; a future furnace screen wires take-from-output to
`takeFurnaceXp`; `smelt_raw_iron` needs the iron_ingot item (added here).
