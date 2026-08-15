# Spec: dispenser-behavior

## Contract
This capability adds the **dispenser**: for ordinary items it is behaviorally identical to 167's
dropper (push into a faced container via 166's `transferOneItem`, or drop into the world — both
through 167's `ejectFromDropper`), but for a **special** item it performs a data-driven *action*
instead of emitting the raw item. The action set is a `DISPENSER_ITEM_BEHAVIORS` table
(item → `DispenserItemBehavior`), so adding a dispenser behavior is a table row, not a code branch.
No real projectile/entity/block spawn, no real container-transaction integration, no `Game`/`World`
wiring — see the proposal's Non-goals.

## Definitions
- **Source**: the dispenser's own slot array (where the item comes from).
- **Destination container**: the slot array of the container in the dispenser's `facing` direction,
  when one exists; `null` means the dispenser faces air / no container.
- **Special item**: an item present in `DISPENSER_ITEM_BEHAVIORS` (arrow, egg, snowball, …).
- **Plain item**: any item not in `DISPENSER_ITEM_BEHAVIORS`.
- **Enabled**: whether a dispenser currently dispenses — `true` exactly when it is unpowered.

## Invariants
- `dispenseFromDispenser` consumes at most one item unit, taken from the first non-empty `source` slot.
- A **special** item yields `kind: 'behavior'` (consume one, carry the `DispenserItemBehavior`),
  independent of the destination/drop position.
- A **plain** item delegates to 167's `ejectFromDropper`: merge-first container push, else world
  `drop`, else `none`; a full container yields `kind: 'none'` (no spill).
- `dispenserShouldTransfer(powered)` is exactly `!powered`.
- `dispenserOutputPosition` always uses `offsetInDirection(x, y, z, facing)`.

## Requirements

### Requirement: the dispenser block and item are registered
`BlockRegistry` MUST register `dispenser` carrying `DISPENSER_SCHEMA` with a default of
`{ facing: 'down', enabled: true }`; `ItemTypeRegistry` MUST register a placing item.

#### Scenario: the block carries its schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `dispenser` block is looked up
- **THEN** it exposes `DISPENSER_SCHEMA` and that default state

#### Scenario: the item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `dispenser` item is looked up
- **THEN** its `placeBlock` resolves to the dispenser block and `validateItemBlockCrossReferences`
  passes

#### Scenario: the block enumerates exactly 10 states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the dispenser's states are counted
- **THEN** there are exactly 10 (5 facings × 2 enabled), and the default is among them

### Requirement: the behavior table maps special items to actions, plain items to null
`getDispenserBehavior(item)` MUST return the matching `DispenserItemBehavior` for an item in
`DISPENSER_ITEM_BEHAVIORS` and `null` for any other item (including `null`).

#### Scenario: a known special item resolves to its behavior
- **GIVEN** `item = 'minecraft:arrow'`
- **WHEN** `getDispenserBehavior` is called
- **THEN** it returns a behavior with `behavior === 'shoot_projectile'` and `projectile === 'arrow'`

#### Scenario: a plain item resolves to null
- **GIVEN** `item = 'stone'`
- **WHEN** `getDispenserBehavior` is called
- **THEN** it returns `null`

#### Scenario: the initial special-item set is present
- **GIVEN** `DISPENSER_ITEM_BEHAVIORS`
- **WHEN** the table is inspected
- **THEN** it contains `minecraft:arrow`, `minecraft:egg`, and `minecraft:snowball`

### Requirement: dispenseFromDispenser dispatches special vs plain correctly
`dispenseFromDispenser(source, destinationContainer, dropPosition)` MUST:
- for a **special** item, return `kind: 'behavior'` with the matched behavior and decrement `source`
  by one;
- for a **plain** item, delegate to 167's `ejectFromDropper` (`container` / `drop` / `none`);
- for an empty `source`, return `kind: 'none'`, `moved: false`.

#### Scenario: a special item performs a behavior and consumes one
- **GIVEN** a `source` slot with `minecraft:arrow` count `5`
- **WHEN** `dispenseFromDispenser` is called
- **THEN** `kind` is `'behavior'`, `behavior.behavior` is `'shoot_projectile'`,
  `behavior.projectile` is `'arrow'`, and the source slot's count is `4`

#### Scenario: an empty source is a none no-op
- **GIVEN** a `source` with no non-empty slots
- **WHEN** `dispenseFromDispenser` is called with a non-null `destinationContainer`
- **THEN** `kind` is `'none'`, `moved` is `false`, and `source` matches the input contents exactly

#### Scenario: a plain item pushes into a container (merge)
- **GIVEN** a `source` slot with `stone` count `5`, and a `destination` with a same-item slot at count
  `10` and an empty slot
- **WHEN** `dispenseFromDispenser` is called with that destination
- **THEN** `kind` is `'container'`, the mergeable slot's count is `11`, and the source count is `4`

#### Scenario: a plain item drops into the world when facing no container
- **GIVEN** a `source` slot with `stone` count `5` and `dropPosition = [7, 8, 9]`
- **WHEN** `dispenseFromDispenser` is called with `destinationContainer = null`
- **THEN** `kind` is `'drop'`, the `DroppedItem` is `{ item: 'stone', count: 1, position: [7, 8, 9] }`,
  and the source count is `4`

#### Scenario: a full container yields none with no world spill
- **GIVEN** a non-empty plain `source` slot and a `destination` with no room
- **WHEN** `dispenseFromDispenser` is called with that destination
- **THEN** `kind` is `'none'`, `moved` is `false`, and the source slot's count is unchanged

### Requirement: dispenserShouldTransfer is the inverse of the powered input
`dispenserShouldTransfer(powered)` MUST return exactly `!powered`.

#### Scenario: an unpowered dispenser is enabled
- **GIVEN** `powered = false`
- **WHEN** `dispenserShouldTransfer` is called
- **THEN** it returns `true`

#### Scenario: a powered dispenser is locked
- **GIVEN** `powered = true`
- **WHEN** `dispenserShouldTransfer` is called
- **THEN** it returns `false`

### Requirement: output position is derived correctly
`dispenserOutputPosition` MUST use `offsetInDirection(x, y, z, facing)` for each of the five
`DispenserFacing` values.

#### Scenario: output follows the given facing
- **GIVEN** each of the five `DispenserFacing` values
- **WHEN** `dispenserOutputPosition` is called
- **THEN** it equals `offsetInDirection(x, y, z, facing)`

### Requirement: dispenses are scheduled and deterministically ordered
`scheduleDispenserEject` MUST schedule the next attempt `DISPENSER_EJECT_COOLDOWN_TICKS` after the
current tick; `dueDispenserEjects` MUST return exactly the entries due at or before `nowTick`,
deterministically ordered.

#### Scenario: a dispense is not due early
- **GIVEN** a dispense scheduled at tick `0`
- **WHEN** the queue is drained at `DISPENSER_EJECT_COOLDOWN_TICKS - 1`
- **THEN** nothing is returned

#### Scenario: a dispense fires at its tick
- **GIVEN** the same dispense
- **WHEN** the queue is drained at `DISPENSER_EJECT_COOLDOWN_TICKS`
- **THEN** exactly that position is returned

#### Scenario: same-tick dispenses are deterministically ordered
- **GIVEN** two dispensers scheduled for the same tick
- **WHEN** the queue is drained at that tick
- **THEN** both are returned in scheduling order, and repeating the scenario yields the identical order

### Requirement: dispenserStateProperties projects the full state
`dispenserStateProperties(facing, enabled)` MUST return a record containing exactly `facing` and
`enabled`, each legal for `DISPENSER_SCHEMA`.

#### Scenario: the projection matches the schema
- **GIVEN** any legal combination of arguments
- **WHEN** `dispenserStateProperties` is called
- **THEN** the record's keys are exactly `facing`, `enabled`, each legal for its schema property

## Error and failure behavior
- No function throws for well-formed inputs; a failed/empty dispense is represented by `kind: 'none'`
  with `moved: false`. `getDispenserBehavior(null)` returns `null`.

## Performance and resource bounds
- `dispenseFromDispenser` is O(`source.length + destination.length`) plus a small fixed table scan.

## Compatibility and migration
- One additive block id and one additive item id; one new simulation file reusing 167's
  `ejectFromDropper`; the documented characterization-test updates. No `Game.ts` edit; no
  schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- `DispenserAction.kind` makes the behavior/container/drop/none outcomes explicit; `getDispenserBehavior`
  makes the data-driven mapping inspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration + 10 states | `tests/unit/DispenserBehavior.test.ts` registration cases |
| REQ-2 behavior-table lookup | behavior-table cases |
| REQ-3 dispense dispatch (behavior/container/drop/none) | dispense cases |
| REQ-4 dispenserShouldTransfer inversion | lockout cases |
| REQ-5 output position | position case |
| REQ-6 scheduling + ordering | scheduling cases |
| REQ-7 state projection | projection case |
