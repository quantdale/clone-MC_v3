# Spec: dropper-eject

## Contract
This capability adds directional, timed, one-item-at-a-time **ejection** from a container (the
dropper) into either another container or the world: an `ejectFromDropper` core that reuses 166's
`transferOneItem`/`MenuSlot` shape for the container case and models a world drop as a returned
`DroppedItem` descriptor (no actual entity spawn — see the proposal's Non-goals), a redstone lockout
that is the *inverse* of 162's consumer rule (identical to 166's `hopperShouldTransfer`), and a
`dropper` block. No real container-transaction integration, no real item-entity spawn, no `Game`/
`World` wiring.

## Definitions
- **Source**: the dropper's own slot array (where the ejected item comes from).
- **Destination container**: the slot array of the container in the dropper's `facing` direction, when
  one exists; `null` means the dropper faces air / no container (so it drops into the world).
- **Enabled**: whether a dropper currently ejects — `true` exactly when it is unpowered.
- **Drop**: a pure description of a world item entity: `{ item, count, position }`.

## Invariants
- `ejectFromDropper` ejects at most one item unit, taken from the first non-empty `source` slot.
- When a destination container is supplied, ejection reuses 166's `transferOneItem` (merge-first,
  then first-empty); a failed push (no room anywhere) leaves `source` unchanged with `kind: 'none'`
  — **a dropper never spills into the world when facing a container it cannot fill**.
- When the destination is `null`, ejection produces a `DroppedItem` of `count: 1` at `dropPosition`
  and decrements `source` by exactly one.
- `dropperShouldTransfer(powered)` is exactly `!powered`.
- `dropperOutputPosition` always uses `offsetInDirection(x, y, z, facing)`.

## Requirements

### Requirement: the dropper block and item are registered
`BlockRegistry` MUST register `dropper` carrying `DROPPER_SCHEMA` with a default of
`{ facing: 'down', enabled: true }`; `ItemTypeRegistry` MUST register a placing item.

#### Scenario: the block carries its schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `dropper` block is looked up
- **THEN** it exposes `DROPPER_SCHEMA` and that default state

#### Scenario: the item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `dropper` item is looked up
- **THEN** its `placeBlock` resolves to the dropper block and `validateItemBlockCrossReferences`
  passes

#### Scenario: the block enumerates exactly 10 states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the dropper's states are counted
- **THEN** there are exactly 10 (5 facings × 2 enabled), and the default is among them

### Requirement: ejectFromDropper pushes into a container, merges first
`ejectFromDropper(source, destinationContainer, dropPosition)` MUST, when `destinationContainer` is
a non-null array, reuse 166's `transferOneItem` (merge into a same-item slot with room first, else
the first empty slot) and return `kind: 'container'` with `moved: true` and the updated arrays; a
destination with no room MUST return `kind: 'none'`, `moved: false`, and leave `source` unchanged
(no world spill).

#### Scenario: an empty source is a none no-op
- **GIVEN** a `source` with no non-empty slots
- **WHEN** `ejectFromDropper` is called with a non-null `destinationContainer`
- **THEN** `kind` is `'none'`, `moved` is `false`, and `source` matches the input contents exactly

#### Scenario: a container push merges into an existing stack
- **GIVEN** a `source` slot with item `X` count `5`, and a `destination` with a same-item slot at
  count `10` and an empty slot
- **WHEN** `ejectFromDropper` is called with that destination
- **THEN** `kind` is `'container'`, the mergeable slot's count is `11`, the empty slot stays empty,
  and the source slot's count is `4`

#### Scenario: a container push uses an empty slot when no mergeable slot exists
- **GIVEN** a `source` slot with item `X` count `5`, and a `destination` with only an empty slot
- **WHEN** `ejectFromDropper` is called with that destination
- **THEN** `kind` is `'container'`, the empty slot now holds one unit of `X`, and the source count is `4`

#### Scenario: a full container yields none with no world spill
- **GIVEN** a non-empty `source` slot and a `destination` with no room (no mergeable slot, no empty
  slot)
- **WHEN** `ejectFromDropper` is called with that destination
- **THEN** `kind` is `'none'`, `moved` is `false`, and the source slot's count is unchanged

### Requirement: ejectFromDropper drops into the world when facing no container
`ejectFromDropper(source, null, dropPosition)` MUST return `kind: 'drop'`, `moved: true`, a
`DroppedItem` with `item` equal to the source item, `count: 1`, and `position` equal to
`dropPosition`, and MUST decrement `source` by exactly one.

#### Scenario: facing no container drops one item into the world
- **GIVEN** a `source` slot with item `X` count `5` and `dropPosition = [7, 8, 9]`
- **WHEN** `ejectFromDropper` is called with `destinationContainer = null`
- **THEN** `kind` is `'drop'`, the `DroppedItem` is `{ item: 'X', count: 1, position: [7, 8, 9] }`,
  and the source slot's count is `4`

### Requirement: dropperShouldTransfer is the inverse of the powered input
`dropperShouldTransfer(powered)` MUST return exactly `!powered`.

#### Scenario: an unpowered dropper is enabled
- **GIVEN** `powered = false`
- **WHEN** `dropperShouldTransfer` is called
- **THEN** it returns `true`

#### Scenario: a powered dropper is locked
- **GIVEN** `powered = true`
- **WHEN** `dropperShouldTransfer` is called
- **THEN** it returns `false`

### Requirement: output position is derived correctly
`dropperOutputPosition` MUST use `offsetInDirection(x, y, z, facing)` for each of the five
`DropperFacing` values.

#### Scenario: output follows the given facing
- **GIVEN** each of the five `DropperFacing` values
- **WHEN** `dropperOutputPosition` is called
- **THEN** it equals `offsetInDirection(x, y, z, facing)`

### Requirement: ejections are scheduled and deterministically ordered
`scheduleDropperEject` MUST schedule the next attempt `DROPPER_EJECT_COOLDOWN_TICKS` after the
current tick; `dueDropperEjects` MUST return exactly the entries due at or before `nowTick`,
deterministically ordered.

#### Scenario: an ejection is not due early
- **GIVEN** an ejection scheduled at tick `0`
- **WHEN** the queue is drained at `DROPPER_EJECT_COOLDOWN_TICKS - 1`
- **THEN** nothing is returned

#### Scenario: an ejection fires at its tick
- **GIVEN** the same ejection
- **WHEN** the queue is drained at `DROPPER_EJECT_COOLDOWN_TICKS`
- **THEN** exactly that position is returned

#### Scenario: same-tick ejections are deterministically ordered
- **GIVEN** two droppers scheduled for the same tick
- **WHEN** the queue is drained at that tick
- **THEN** both are returned in scheduling order, and repeating the scenario yields the identical
  order

### Requirement: dropperStateProperties projects the full state
`dropperStateProperties(facing, enabled)` MUST return a record containing exactly `facing` and
`enabled`, each legal for `DROPPER_SCHEMA`.

#### Scenario: the projection matches the schema
- **GIVEN** any legal combination of arguments
- **WHEN** `dropperStateProperties` is called
- **THEN** the record's keys are exactly `facing`, `enabled`, each legal for its schema property

## Error and failure behavior
- No function throws for well-formed inputs; a failed/empty ejection is represented by `kind: 'none'`
  with `moved: false`.

## Performance and resource bounds
- `ejectFromDropper` is O(`source.length + destination.length`) (one `transferOneItem` call).

## Compatibility and migration
- One additive block id and one additive item id; one new simulation file reusing 166's
  `transferOneItem`; the documented characterization-test updates. No `Game.ts` edit; no
  schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- `DropperEjectResult.kind` makes the container/drop/none outcomes explicit.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration + 10 states | `tests/unit/DropperEject.test.ts` registration cases |
| REQ-2 container push (merge/empty/none) | eject container cases |
| REQ-3 world drop | eject drop case |
| REQ-4 dropperShouldTransfer inversion | lockout cases |
| REQ-5 output position | position case |
| REQ-6 scheduling + ordering | scheduling cases |
| REQ-7 state projection | projection case |
