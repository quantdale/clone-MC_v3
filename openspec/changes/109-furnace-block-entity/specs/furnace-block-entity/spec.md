# Spec: furnace-block-entity

## Contract

`createFurnaceState` MUST build a state with three empty slots (input, fuel, output) and all
timers 0. `validateFurnaceState` MUST reject every malformed shape, slot, and time, and MUST
enforce `burnTime <= burnTimeTotal` and `smeltTime <= smeltTimeTotal` (total 0 implies time 0).
`furnaceIsLit` MUST return `burnTime > 0`. `tickFurnace` MUST apply `ticks` (default 1, positive
integer) deterministic game ticks against the injected `FurnaceContext` and return a NEW state:
fuel is consumed only when smelting can progress and the fuel has a positive burn value; lit is
`burnTime > 0`; a blocked output pauses all timers; removing the input resets `smeltTime`;
cooking completion consumes one input and merges the result into the output. Serialization MUST
be lossless and round-trip exact; deserialization MUST throw on malformed payloads.
`createFurnaceMenu` MUST build a 39-slot menu (input 0, fuel 1, output 2, player 3-38) with
`playerSlotStart` 3. `extractFurnaceSlots`/`extractFurnacePlayerSlots` MUST return the matching
regions and reject foreign menus. `withFurnaceSlots` MUST return a new state with the same
timers. `furnaceTickProgress`/`furnaceBurnFraction` MUST return fractions in [0,1].
`createFurnaceBlockEntity` MUST build a 052 instance with typeKey `furnace`, tickable true, and
`data` = the serialized state. `readFurnaceState` MUST throw unless the typeKey is `furnace`
and the payload is valid. `updateFurnaceState` MUST return a NEW instance.

## Definitions

- **FurnaceState**: input/fuel/output slots plus `burnTime`, `burnTimeTotal`, `smeltTime`,
  `smeltTimeTotal` (non-negative integers; totals 0 iff the matching time is 0; time <= total).
- **Can smelt**: input present, `resultOf(input)` non-null, output accepts the result (empty,
  or same item with room).
- **FurnaceContext**: `fuelBurnTicks`, `cookTicks`, `resultOf` (110 supplies real values).
- **Furnace menu**: 39 slots; 0 input, 1 fuel, 2 output, 3-38 player; `playerSlotStart` 3.
- **FURNACE_BLOCK_ID**: 20. **FURNACE_ITEM_ID**: 26. **FURNACE_TYPE_KEY**: `'furnace'`.

## Invariants

- States always hold 3 valid slots and time invariants; updates are immutable.
- Fuel is never consumed without progress; timers never advance while paused.
- Envelopes round-trip exactly; malformed payloads throw.
- Identical inputs produce identical results.

## Requirements

### Requirement: state construction and validation
`createFurnaceState`/`validateFurnaceState` MUST implement the documented rules.

#### Scenario: empty creation
- **GIVEN** nothing
- **WHEN** `createFurnaceState` runs
- **THEN** the state has three empty slots and all timers 0; validation accepts it.

#### Scenario: malformed states
- **GIVEN** invalid slots (107 rules), negative or fractional times, `burnTime >
  burnTimeTotal`, `smeltTime > smeltTimeTotal`, or a non-zero time with total 0
- **WHEN** validation runs
- **THEN** a descriptive error is thrown.

### Requirement: tick engine
`tickFurnace` MUST implement the documented state machine deterministically and immutably.

#### Scenario: burn start and fuel consumption
- **GIVEN** a state with input sand (cookTicks 200, result glass x1), fuel coal (burnTicks
  1600), empty output
- **WHEN** one tick runs
- **THEN** the fuel slot is emptied (one coal consumed), `burnTimeTotal` is 1600,
  `burnTime` is 1599, `smeltTime` is 1, `smeltTimeTotal` is 200, output unchanged, and the
  furnace is lit.

#### Scenario: no fuel means no progress
- **GIVEN** the same input but an empty fuel slot
- **WHEN** ticks run
- **THEN** burnTime stays 0, smeltTime stays 0, input unchanged.

#### Scenario: non-fuel items are never consumed
- **GIVEN** a fuel slot holding an item with `fuelBurnTicks` 0
- **WHEN** ticks run
- **THEN** the fuel slot is unchanged and nothing burns.

#### Scenario: paused on blocked output
- **GIVEN** a lit furnace whose output is full with a different item
- **WHEN** ticks run
- **THEN** burnTime, smeltTime, fuel, and input are unchanged (paused).

#### Scenario: input removal resets progress
- **GIVEN** a furnace with `smeltTime` 50 and an empty input
- **WHEN** a tick runs
- **THEN** `smeltTime` is 0.

#### Scenario: cook completion
- **GIVEN** `smeltTime` 199, `smeltTimeTotal` 200, lit, input sand x1 (result glass x1),
  empty output
- **WHEN** a tick runs
- **THEN** the input consumed one, output holds glass x1, `smeltTime` 0, `smeltTimeTotal` 0,
  and burning continues.

#### Scenario: multi-tick determinism
- **GIVEN** an identical state and context
- **WHEN** `tickFurnace(state, ctx, 10)` runs and `tickFurnace(state, ctx, 1)` runs ten times
- **THEN** both results are identical, and the input state is unchanged.

### Requirement: serialization
Serialization MUST be lossless and exact.

#### Scenario: round-trip
- **GIVEN** an empty and a burning state
- **WHEN** each is serialized then deserialized
- **THEN** the result equals the input exactly.

#### Scenario: malformed payloads
- **GIVEN** non-object data, missing fields, invalid slots, or broken time invariants
- **WHEN** deserialization runs
- **THEN** a descriptive error is thrown.

### Requirement: furnace menu bridge
The menu MUST expose the three furnace slots and the player region.

#### Scenario: construction
- **GIVEN** a state and 36 player slots
- **WHEN** `createFurnaceMenu` runs
- **THEN** the menu has 39 slots, `playerSlotStart` 3, input 0, fuel 1, output 2, player 3-38,
  empty cursor; invalid player slots or cursors throw.

#### Scenario: transactions and extraction
- **GIVEN** a furnace menu
- **WHEN** transactions run (pickup, place, quick-move between furnace and player regions)
- **THEN** results follow 106 semantics, the source menu is unchanged, `extractFurnaceSlots`
  reflects the new slots, and `withFurnaceSlots` preserves the timers; foreign menus throw.

### Requirement: entity lifecycle
The 052 instance MUST carry the furnace payload.

#### Scenario: create/read/update
- **GIVEN** a state
- **WHEN** `createFurnaceBlockEntity(x, y, z, state)` runs and is read
- **THEN** the instance has typeKey `furnace`, is tickable, and `readFurnaceState` returns the
  exact state; `updateFurnaceState` returns a NEW instance and the old one is unchanged.

#### Scenario: wrong type key and malformed payload
- **GIVEN** a non-furnace typeKey or an invalid payload
- **WHEN** `readFurnaceState` runs
- **THEN** a descriptive error is thrown.

### Requirement: progress helpers
`furnaceTickProgress`/`furnaceBurnFraction` MUST return fractions in [0,1].

#### Scenario: fractions
- **GIVEN** `smeltTime` 100 / `smeltTimeTotal` 200 and `burnTime` 800 / `burnTimeTotal` 1600
- **WHEN** the helpers run
- **THEN** progress is 0.5 and burn fraction is 0.5; zero totals yield 0.

### Requirement: manager chunk round-trip
Furnace entities MUST survive a 052 chunk serialize/deserialize.

#### Scenario: chunk save/load
- **GIVEN** a `BlockEntityManager` with a furnace entity
- **WHEN** `serializeChunk` then `deserializeChunk` run
- **THEN** `readFurnaceState` on the restored instance returns the exact state.

### Requirement: registry integration
The furnace block and item MUST be registered and cross-validated.

#### Scenario: block and item definitions
- **GIVEN** the default block and item registries
- **WHEN** furnace id 20 / item id 26 are looked up and `validateItemBlockCrossReferences` runs
- **THEN** the block is solid, breakable, pickaxe-preferred, hardness 3.5, drops the furnace
  item; the item places the furnace block; no cross-reference errors are thrown.

## Error and failure behavior

Malformed states, payloads, foreign menus, out-of-bounds indices, wrong type keys, and invalid
`ticks` throw descriptive errors; valid inputs never throw.

## Performance and resource bounds

`tickFurnace` is O(ticks) with O(1) per tick; no allocations beyond result objects.

## Compatibility and migration

Additive. New registry ids (block 20, item 26) and atlas tile 28 were unused.

## Security and integrity

Payloads validated strictly on read; timers bounded by totals.

## Observability

Plain data; tests assert exact states, times, menus, and envelopes.

## Verification mapping

- `tests/unit/FurnaceBlockEntity.test.ts` — state validation matrix, envelope round-trips and
  rejects, tick vectors (burn start/fuel consume, no-fuel, non-fuel item, blocked-output
  pause, input-removal reset, cook completion, multi-tick determinism, immutability), menu
  bridge and extraction, entity lifecycle, manager chunk round-trip, registry
  cross-references.
