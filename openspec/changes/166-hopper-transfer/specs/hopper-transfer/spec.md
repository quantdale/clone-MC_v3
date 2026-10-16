# Spec: hopper-transfer

## Contract
This capability adds directional, timed, one-item-at-a-time transfer between containers: a
`transferOneItem` core reused with 106's `MenuSlot` shape, a redstone lockout that is the *inverse*
of 162's consumer rule, and a `hopper` block. No item-entity scooping, no real container-transaction
integration, no `Game`/`World` wiring — see the proposal's Non-goals.

## Definitions
- **Source**: the container slots a hopper pulls from (always the container directly above it).
- **Destination**: the container slots a hopper pushes into (the container in its `facing`
  direction).
- **Enabled**: whether a hopper currently transfers — `true` exactly when it is unpowered.

## Invariants
- `transferOneItem` moves at most one item unit, taken from the first non-empty `source` slot.
- The destination slot is chosen by merge-first, then first-empty; a failed search never depletes
  the source.
- `hopperShouldTransfer(powered)` is exactly `!powered`.
- `hopperIntakePosition` always uses the fixed `'up'` direction, independent of `facing`.

## Requirements

### Requirement: the hopper block and item are registered
`BlockRegistry` MUST register `hopper` carrying `HOPPER_SCHEMA` with a default of
`{ facing: 'down', enabled: true }`; `ItemTypeRegistry` MUST register a placing item.

#### Scenario: the block carries its schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `hopper` block is looked up
- **THEN** it exposes `HOPPER_SCHEMA` and that default state

#### Scenario: the item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `hopper` item is looked up
- **THEN** its `placeBlock` resolves to the hopper block and `validateItemBlockCrossReferences`
  passes

#### Scenario: the block enumerates exactly 10 states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the hopper's states are counted
- **THEN** there are exactly 10 (5 facings × 2 enabled), and the default is among them

### Requirement: transferOneItem moves at most one item unit, correctly prioritized
`transferOneItem` MUST move one item from the first non-empty `source` slot into the first
same-item slot with room, or else the first empty `destination` slot; a failed search MUST leave
both sides unchanged (but freshly copied) with `moved: false`.

#### Scenario: an empty source is a no-op
- **GIVEN** a `source` with no non-empty slots
- **WHEN** `transferOneItem` is called
- **THEN** `moved` is `false` and both returned slot arrays match the inputs' contents exactly

#### Scenario: a full destination is a no-op that does not deplete the source
- **GIVEN** a non-empty `source` slot and a `destination` with no room (no matching mergeable slot,
  no empty slot)
- **WHEN** `transferOneItem` is called
- **THEN** `moved` is `false`, the source slot's count is unchanged

#### Scenario: merging into an existing stack is preferred over an empty slot
- **GIVEN** a `source` slot with item `X`, and a `destination` with both a same-item slot with room
  and an empty slot
- **WHEN** `transferOneItem` is called
- **THEN** the mergeable slot's count increases by one and the empty slot remains empty

#### Scenario: an empty slot is used when no mergeable slot exists
- **GIVEN** a `source` slot with item `X`, and a `destination` with only an empty slot (no matching
  item anywhere)
- **WHEN** `transferOneItem` is called
- **THEN** the empty slot now holds one unit of `X`

#### Scenario: a successful transfer decrements the source by exactly one
- **GIVEN** a `source` slot with item `X` and count `5`, and a `destination` with room
- **WHEN** `transferOneItem` is called
- **THEN** `moved` is `true` and the source slot's count is `4`

### Requirement: hopperShouldTransfer is the inverse of the powered input
`hopperShouldTransfer(powered)` MUST return exactly `!powered`.

#### Scenario: an unpowered hopper is enabled
- **GIVEN** `powered = false`
- **WHEN** `hopperShouldTransfer` is called
- **THEN** it returns `true`

#### Scenario: a powered hopper is locked
- **GIVEN** `powered = true`
- **WHEN** `hopperShouldTransfer` is called
- **THEN** it returns `false`

### Requirement: intake and output positions are derived correctly
`hopperIntakePosition` MUST always use `offsetInDirection(x, y, z, 'up')`; `hopperOutputPosition`
MUST use `offsetInDirection(x, y, z, facing)` for each of the five `HopperFacing` values.

#### Scenario: intake is always straight up regardless of facing
- **GIVEN** each of the five `HopperFacing` values
- **WHEN** `hopperIntakePosition` is called
- **THEN** it always equals `offsetInDirection(x, y, z, 'up')`

#### Scenario: output follows the given facing
- **GIVEN** each of the five `HopperFacing` values
- **WHEN** `hopperOutputPosition` is called
- **THEN** it equals `offsetInDirection(x, y, z, facing)`

### Requirement: transfers are scheduled and deterministically ordered
`scheduleHopperTransfer` MUST schedule the next attempt `HOPPER_TRANSFER_COOLDOWN_TICKS` after the
current tick; `dueHopperTransfers` MUST return exactly the entries due at or before `nowTick`,
deterministically ordered.

#### Scenario: a transfer is not due early
- **GIVEN** a transfer scheduled at tick `0`
- **WHEN** the queue is drained at `HOPPER_TRANSFER_COOLDOWN_TICKS - 1`
- **THEN** nothing is returned

#### Scenario: a transfer fires at its tick
- **GIVEN** the same transfer
- **WHEN** the queue is drained at `HOPPER_TRANSFER_COOLDOWN_TICKS`
- **THEN** exactly that position is returned

#### Scenario: same-tick transfers are deterministically ordered
- **GIVEN** two hoppers scheduled for the same tick
- **WHEN** the queue is drained at that tick
- **THEN** both are returned in scheduling order, and repeating the scenario yields the identical
  order

### Requirement: hopperStateProperties projects the full state
`hopperStateProperties(facing, enabled)` MUST return a record containing exactly `facing` and
`enabled`, each legal for `HOPPER_SCHEMA`.

#### Scenario: the projection matches the schema
- **GIVEN** any legal combination of arguments
- **WHEN** `hopperStateProperties` is called
- **THEN** the record's keys are exactly `facing`, `enabled`, each legal for its schema property

## Error and failure behavior
- No function throws for well-formed inputs; a failed transfer is represented by `moved: false`.

## Performance and resource bounds
- `transferOneItem` is O(`source.length + destination.length`).

## Compatibility and migration
- One additive block id and one additive item id; one new simulation file; the documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted input surface.

## Observability
- `HopperTransferResult.moved` and `hopperStateProperties` make outcomes explicit.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration + 10 states | `tests/unit/HopperTransfer.test.ts` registration cases |
| REQ-2 transferOneItem priority/no-op cases | transfer cases |
| REQ-3 hopperShouldTransfer inversion | lockout cases |
| REQ-4 intake/output position derivation | position cases |
| REQ-5 scheduling + ordering | scheduling cases |
| REQ-6 state projection | projection case |
