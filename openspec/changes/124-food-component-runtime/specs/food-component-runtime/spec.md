# Spec: food-component-runtime

## Contract
This capability makes eating read a food item's hunger, saturation, and status-effect
data from the item registry, and applies food-borne status effects through the
change-121 `StatusEffectManager`. Potion drinking is out of scope (see Non-goals in the
proposal); the effect applier is reusable by that later path. No section is omitted.

## Definitions
- **Food item**: an `ItemTypeDefinition` with `isFood === true`.
- **FoodEffectData**: `{ typeId: string; duration: number; amplifier: number }`, identical
  in shape to a potion effect row (`PotionEffectData`). `typeId` follows the
  `minecraft:effect/<key>` convention.
- **ConsumeEffects**: `{ hunger; saturation; effects }` resolved for one eat action.
- **Player effects manager**: the per-player `StatusEffectManager` owned by `Game`.

## Invariants
- Hunger/saturation are clamped to `>= 0`; omitted values default to `0`.
- `resolveFoodConsume` returns `null` for a non-food item.
- `applyConsumeEffects` MUST NOT throw for any input; unparseable/unregistered `typeId`s
  are skipped.
- Effects are applied only after a successful (`true`) `SurvivalSystem.eat`.

## Requirements

### Requirement: food nutrition and effects resolve from item data
`resolveFoodConsume(def)` MUST return `null` when `def.isFood` is falsy. When `def.isFood`
is true it MUST return a `ConsumeEffects` whose `hunger` equals `max(0, def.foodHunger ?? 0)`,
whose `saturation` equals `max(0, def.foodSaturation ?? 0)`, and whose `effects` equals the
`def.foodEffects` list with every malformed row removed.

#### Scenario: non-food definition resolves to null
- **GIVEN** an `ItemTypeDefinition` with `isFood` undefined and no `foodEffects`
- **WHEN** `resolveFoodConsume(def)` is called
- **THEN** the result is `null`

#### Scenario: food with explicit nutrition
- **GIVEN** a food definition with `foodHunger: 4`, `foodSaturation: 2`
- **WHEN** `resolveFoodConsume(def)` is called
- **THEN** the result has `hunger: 4`, `saturation: 2`, and empty `effects`

#### Scenario: omitted nutrition defaults to zero
- **GIVEN** a food definition with `isFood: true` and no `foodHunger`/`foodSaturation`
- **WHEN** `resolveFoodConsume(def)` is called
- **THEN** the result has `hunger: 0` and `saturation: 0`

#### Scenario: malformed effect rows are dropped
- **GIVEN** a food definition whose `foodEffects` contains a row with an empty `typeId` and
  a row with negative `duration`
- **WHEN** `resolveFoodConsume(def)` is called
- **THEN** the resulting `effects` list excludes both malformed rows

### Requirement: food effects apply to the player's status-effect manager
`applyConsumeEffects(manager, effects)` MUST add each well-formed effect to `manager` via
`StatusEffectManager.add(typeId, duration, amplifier)`, parsing `typeId` as a `ResourceId`.
It MUST skip any effect whose `typeId` is not a parseable `ResourceId` or does not resolve to
a registered effect type, and MUST NOT throw while doing so.

#### Scenario: registered effect is applied
- **GIVEN** a `StatusEffectManager` built from the default registries and one effect
  `{ typeId: 'minecraft:effect/speed', duration: 60, amplifier: 1 }`
- **WHEN** `applyConsumeEffects(manager, [effect])` is called
- **THEN** `manager.get(createResourceId('minecraft','effect/speed'))` reports `duration: 60`
  and `amplifier: 1`

#### Scenario: unregistered typeId is skipped without throwing
- **GIVEN** effects `[{ typeId: 'minecraft:effect/not_a_real_effect', duration: 1, amplifier: 0 }]`
- **WHEN** `applyConsumeEffects(manager, effects)` is called
- **THEN** no exception is thrown and the manager has no active effects

#### Scenario: non-parseable typeId is skipped
- **GIVEN** effects `[{ typeId: '::', duration: 1, amplifier: 0 }]`
- **WHEN** `applyConsumeEffects(manager, effects)` is called
- **THEN** no exception is thrown and the manager has no active effects

#### Scenario: mixed valid/invalid effects keep the valid ones
- **GIVEN** one registered effect and one unregistered effect
- **WHEN** `applyConsumeEffects(manager, effects)` is called
- **THEN** exactly the registered effect is active and no exception is thrown

### Requirement: the engine eats the selected food from item data
When the player issues an eat input and the selected hotbar stack is a food item,
`Game` MUST compute nutrition from the item's `ItemTypeDefinition` (not hard-coded
literals) and call `SurvivalSystem.eat` with those values.

#### Scenario: eating a food item
- **GIVEN** the selected slot holds an apple (foodHunger 4, foodSaturation 2) and the
  player is not full
- **WHEN** an eat input occurs
- **THEN** `survival.eat({ hunger: 4, saturation: 2 })` is called, one item is consumed,
  and the eat audio/toast fire

#### Scenario: hunger full blocks consume
- **GIVEN** the player's hunger is already 20 and the selected slot holds food
- **WHEN** an eat input occurs
- **THEN** `survival.eat` returns `false`, no item is consumed, and no effects are applied

#### Scenario: non-food selected is ignored
- **GIVEN** the selected slot holds a non-food item
- **WHEN** an eat input occurs
- **THEN** no eat, consume, or effect application occurs

### Requirement: food effects are applied on a successful eat
On a successful (`true`) `survival.eat`, `Game` MUST apply the item's `foodEffects` to the
player's `StatusEffectManager` via `applyConsumeEffects`.

#### Scenario: effect-bearing food applies its effects
- **GIVEN** a selected food with `foodEffects: [{ typeId: 'minecraft:effect/regeneration', duration: 5, amplifier: 0 }]`
  and the player not full
- **WHEN** an eat input occurs and `eat` succeeds
- **THEN** the player's manager reports an active `regeneration` effect

### Requirement: the player's status effects tick each frame
`Game` MUST advance the player's `StatusEffectManager` by the frame delta during its update
so active effect durations count down deterministically.

#### Scenario: effects decay over time
- **GIVEN** an active effect with `duration: 1`
- **WHEN** the game updates with `dt: 1`
- **THEN** the effect has expired and been removed from the manager

## Error and failure behavior
- Unregistered or malformed `typeId`: skipped, no throw (REQ-3).
- Non-food or full hunger: no consume, no effects (REQ-4/REQ-6).
- `StatusEffectManager.add` clamps `duration`/`amplifier` to `>= 0`.

## Performance and resource bounds
- Per-frame: one `tick(dt)` over the active-effect map (empty in the common case).
- Eat resolution: O(1) over a small `foodEffects` list, allocation only on eat.

## Compatibility and migration
- `foodEffects` is optional; existing registry definitions and saves are unaffected.
- No snapshot/serialization format changes.

## Security and integrity
- No external/untrusted input reaches the manager without `tryParseResourceId` + registry
  validation; malformed `typeId`s cannot inject an effect.

## Observability
- Eat emits `audio.play('eat')` and a toast; active effects are inspectable via
  `StatusEffectManager.getAll()`.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 | `FoodComponentRuntime.test.ts` resolve scenarios |
| REQ-2 | `ItemRegistry.ts` field; compile-time + test usage |
| REQ-3 | `FoodComponentRuntime.test.ts` apply scenarios |
| REQ-4 | `Game.ts` `tryEatSelected`; e2e regression |
| REQ-5 | `Game.ts` update tick (covered by e2e + unit tick test) |
| REQ-6 | `Game.ts` `tryEatSelected` (covered by unit + e2e) |
