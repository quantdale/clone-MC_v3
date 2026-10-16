# Spec: brewing-stand

## Contract

This capability brews one potion from a bottle plus an ingredient using fuel, as a
deterministic, immutable, per-tick state machine. Recipes are pure data supplied through
`BrewingContext`; the engine consumes fuel only while brewing can progress, applies a
recipe on completion (writing the result into the bottle's `potion_contents` component
and consuming one ingredient), and persists its progress. It does NOT place the block,
wire a `Game` tick, or render a menu — those are downstream. The 109/122 contracts are
unchanged.

## Definitions

- **BrewingState**: `{ bottle: MenuSlot; fuel: MenuSlot; ingredient: MenuSlot; brewTime:
  number; brewTimeTotal: number; fuelBurnTime: number; fuelBurnTimeTotal: number }`.
  `bottle.components['minecraft:potion_contents']` (when present and valid) is the active
  potion; `base` is `contents.base`.
- **BrewingRecipeOutput**: `{ base?: string; customEffects?: readonly PotionEffectData[] }`.
- **BrewingContext**: `{ match(base, ingredient): BrewingRecipeOutput | null;
  fuelBurnTicks(item): number; brewTicks(): number }`.

## Invariants

- `tickBrewing` MUST be pure: it returns a new `BrewingState` and MUST NOT mutate its
  input.
- `brewTime <= brewTimeTotal` and `fuelBurnTime <= fuelBurnTimeTotal` (both enforced by
  `validateBrewingState`).
- A brew proceeds only when the bottle holds a valid `potion_contents`, an ingredient is
  present, and `match(base, ingredient)` is non-null.
- Identical `(state, ctx, ticks)` inputs MUST produce identical outputs (no randomness).

## Requirements

### Requirement: recipe matching

`BrewingContext.match(base, ingredient)` MUST return the `BrewingRecipeOutput` for a known
`(base, ingredient)` pair and MUST return `null` for any unknown pair.

#### Scenario: known pair resolves

- **GIVEN** bottle base `minecraft:potion/water` and ingredient `minecraft:item/nether_wart`
- **WHEN** `match` is called
- **THEN** it returns an output whose `base` is `minecraft:potion/awkward` and whose
  `customEffects` is empty

#### Scenario: unknown pair returns null

- **GIVEN** bottle base `minecraft:potion/water` and ingredient `minecraft:item/glowstone`
- **WHEN** `match` is called
- **THEN** it returns `null`

### Requirement: fuel and timing

`fuelBurnTicks(item)` MUST return a positive value for blaze powder and `0` otherwise;
`brewTicks()` MUST return a fixed positive integer.

#### Scenario: blaze powder is fuel

- **GIVEN** `minecraft:item/blaze_powder`
- **WHEN** `fuelBurnTicks` is called
- **THEN** it returns a value `> 0`

### Requirement: fuel consumption gating

`tickBrewing` MUST consume one fuel item only when a brew can progress and no fuel is
currently burning, setting `fuelBurnTimeTotal`/`fuelBurnTime` from `fuelBurnTicks`.

#### Scenario: fuel lights when a brew is possible

- **GIVEN** a state with a valid water bottle, nether_wart ingredient, and one blaze powder
- **WHEN** `tickBrewing` is called once
- **THEN** the fuel slot loses one item and `fuelBurnTime > 0`

#### Scenario: no fuel is consumed when no recipe applies

- **GIVEN** a state with a valid water bottle, an ingredient with no recipe, and one blaze powder
- **WHEN** `tickBrewing` is called once
- **THEN** the fuel slot is unchanged

### Requirement: brew completion

When `fuelBurnTime > 0` and a brew is possible, `tickBrewing` MUST advance `brewTime`;
once `brewTime >= brewTimeTotal` it MUST write the recipe output into the bottle's
`potion_contents`, consume exactly one ingredient, and reset `brewTime`/`brewTimeTotal`
to 0.

#### Scenario: full cycle brews the potion

- **GIVEN** a state where fuel is lit and `brewTicks()` ticks remain with a valid recipe
- **WHEN** `tickBrewing` is called for `brewTicks()` ticks
- **THEN** the bottle's `potion_contents` reflects the recipe output, the ingredient count
  dropped by 1, and `brewTime`/`brewTimeTotal` are 0

### Requirement: modifier effects

A modifier recipe (e.g. `redstone`) MUST replace the bottle's `customEffects` with the
output's effects (no base change unless the output specifies one).

#### Scenario: redstone extends the potion

- **GIVEN** an awkward potion and a `redstone` ingredient whose output is `[speed 1 x 480]`
- **WHEN** a full brew cycle completes
- **THEN** the bottle's `potion_contents.customEffects` equals `[speed 1 x 480]` and its
  `base` remains `minecraft:potion/awkward`

### Requirement: safe pause on invalid bottle

When the bottle slot has no item, or its `potion_contents` is missing/invalid, `tickBrewing`
MUST pause brewing (no write, no ingredient consumption) and MUST NOT throw for valid
inputs; any active fuel still burns down.

#### Scenario: empty bottle pauses safely

- **GIVEN** a state with an empty bottle slot and a valid fuel + ingredient
- **WHEN** `tickBrewing` is called
- **THEN** no error is thrown, the bottle is unchanged, and the ingredient is unchanged

### Requirement: persistence

`serializeBrewingState` and `deserializeBrewingState` MUST round-trip a valid state and
`deserializeBrewingState` MUST throw on a malformed payload.

#### Scenario: round-trip

- **GIVEN** a valid `BrewingState`
- **WHEN** it is serialized then deserialized
- **THEN** the result equals the original

## Error and failure behavior

- Valid inputs MUST NOT throw. Malformed deserialized data MUST throw via
  `validateBrewingState`. A corrupt bottle `potion_contents` is treated as "no valid
  potion" (safe pause), not an error.

## Performance and resource bounds

- `tickBrewing` is O(ticks), O(1) per tick, allocation-free beyond the new state object.
  No IO or registry mutation.

## Compatibility and migration

- `MenuSlot.components` is optional and additive; 109/122 remain green. No persisted-schema
  field is changed.

## Security and integrity

- `validateBrewingState` rejects `brewTime > brewTimeTotal` and negative timers before
  adoption; the bottle `potion_contents` is re-validated through `createPotionContents` on
  apply, so a broken recipe output cannot corrupt the slot.

## Observability

- `brewingIsLit`, `brewingBrewProgress`, `brewingFuelFraction` expose progress for future UI.

## Verification mapping

| Requirement | Test |
|---|---|
| Recipe matching | `BrewingRecipes.test.ts` |
| Fuel/timing | `BrewingRecipes.test.ts` |
| Fuel gating / completion / modifier / safe pause | `BrewingStandBlockEntity.test.ts` |
| Persistence | `BrewingStandBlockEntity.test.ts` round-trip |
| Regression | existing 109/122 suites |
