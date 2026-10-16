# Spec: redstone-input-components

## Contract
This capability adds the three foundational redstone sources — lever, button, pressure plate — as
registered 2-state blocks plus a pure model of their signal emission and, crucially, their differing
*timing*: a latch, a self-releasing delay, and occupancy with a trailing delay. No facing/attachment
state, no `Game`/`World` wiring, no interaction or entity detection, no weighted plates — see the
proposal's Non-goals.

## Definitions
- **Component**: one of `'lever' | 'button' | 'pressure_plate'`.
- **Powered**: the component's boolean block state; while true it emits full signal.
- **Release**: the transition back to unpowered — immediate-by-toggle for a lever, scheduled for a
  button and a plate.

## Invariants
- Every component emits `MAX_SIGNAL_STRENGTH` when powered and `MIN_SIGNAL_STRENGTH` otherwise;
  they differ in *when* they are powered, never in *how strongly*.
- `toggleLever` is an involution.
- A button's release is always `BUTTON_ACTIVE_TICKS` after its most recent press.
- `platePowered(n)` is true exactly when `n > 0`.
- `dueComponentReleases` returns exactly the entries due at or before `nowTick`, in deterministic
  order, leaving later entries queued.

## Requirements

### Requirement: the three component blocks and their items are registered
`BlockRegistry` MUST register `lever`, `stone_button`, and `pressure_plate`, each with
`POWERED_SCHEMA` and a `powered: false` default; `ItemTypeRegistry` MUST register a placing item
for each.

#### Scenario: each block carries the powered schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** each of the three blocks is looked up
- **THEN** each exposes `POWERED_SCHEMA` and a `defaultState` of `{ powered: false }`

#### Scenario: each item places its block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the lever, stone button, and pressure plate items are looked up
- **THEN** each `placeBlock` resolves to its matching block and
  `validateItemBlockCrossReferences` passes

#### Scenario: each block enumerates exactly two states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** each component block's states are counted
- **THEN** each has exactly 2, and its default state reports `powered` false

### Requirement: every component emits full signal only while powered
`componentSignalStrength(kind, powered)` MUST return `MAX_SIGNAL_STRENGTH` when `powered` is true
and `MIN_SIGNAL_STRENGTH` otherwise, for every kind.

#### Scenario: powered components emit full strength
- **GIVEN** each of the three kinds
- **WHEN** `componentSignalStrength(kind, true)` is called
- **THEN** each returns `MAX_SIGNAL_STRENGTH`

#### Scenario: unpowered components emit nothing
- **GIVEN** each of the three kinds
- **WHEN** `componentSignalStrength(kind, false)` is called
- **THEN** each returns `MIN_SIGNAL_STRENGTH`

### Requirement: a lever latches
`toggleLever` MUST return the inverse of its input, and MUST return the original value when applied
twice.

#### Scenario: toggling flips the state
- **GIVEN** an unpowered lever
- **WHEN** `toggleLever(false)` is called
- **THEN** it returns `true`

#### Scenario: toggling twice restores the state
- **GIVEN** either starting state
- **WHEN** `toggleLever` is applied twice
- **THEN** the original value is returned

### Requirement: a button powers on and schedules its own release
`pressButton(currentTick)` MUST return `powered: true` with `releaseTick` exactly
`currentTick + BUTTON_ACTIVE_TICKS`.

#### Scenario: pressing sets the release tick
- **GIVEN** the current tick `100`
- **WHEN** `pressButton(100)` is called
- **THEN** it returns `{ powered: true, releaseTick: 100 + BUTTON_ACTIVE_TICKS }`

#### Scenario: re-pressing extends the release
- **GIVEN** a button pressed at tick `100` and scheduled, then pressed again at tick `110` and
  re-scheduled
- **WHEN** the queue is drained at tick `120`
- **THEN** nothing is due yet, because the release moved to `110 + BUTTON_ACTIVE_TICKS`

### Requirement: a pressure plate follows occupancy
`platePowered(entityCount)` MUST return `true` exactly when `entityCount > 0`, treating a negative
or non-finite count as `false`.

#### Scenario: an occupied plate is powered
- **GIVEN** an entity count of `1`
- **WHEN** `platePowered` is called
- **THEN** it returns `true`

#### Scenario: an empty plate is unpowered
- **GIVEN** an entity count of `0`
- **WHEN** `platePowered` is called
- **THEN** it returns `false`

#### Scenario: an invalid count reads unpowered
- **GIVEN** counts of `-1` and `NaN`
- **WHEN** `platePowered` is called on each
- **THEN** both return `false`

### Requirement: scheduled releases fire in deterministic order and only when due
`scheduleComponentRelease` MUST schedule a button/plate release and MUST NOT schedule anything for
a lever (returning `false`). `dueComponentReleases` MUST return exactly the entries due at or
before `nowTick`, in deterministic order, leaving later entries queued.

#### Scenario: a lever is never scheduled
- **GIVEN** an empty queue
- **WHEN** `scheduleComponentRelease(queue, x, y, z, 'lever', 0)` is called
- **THEN** it returns `false` and the queue stays empty

#### Scenario: a button release is not due before its tick
- **GIVEN** a button scheduled at tick `0`
- **WHEN** the queue is drained at `BUTTON_ACTIVE_TICKS - 1`
- **THEN** no entries are returned and the release stays queued

#### Scenario: a button release fires at its tick
- **GIVEN** the same button
- **WHEN** the queue is drained at `BUTTON_ACTIVE_TICKS`
- **THEN** exactly that position is returned

#### Scenario: components due on the same tick release deterministically
- **GIVEN** two components at different positions scheduled for the same release tick
- **WHEN** the queue is drained at that tick
- **THEN** both are returned, in their scheduling order, and repeating the whole scenario yields the
  identical order

### Requirement: componentStateProperties projects the powered flag
`componentStateProperties(powered)` MUST return exactly `{ powered }`, matching `POWERED_SCHEMA`.

#### Scenario: the projection matches the schema
- **GIVEN** either boolean
- **WHEN** `componentStateProperties` is called
- **THEN** the record's only key is `powered`, and its value is a legal value of the schema's
  `powered` property

## Error and failure behavior
- No function throws for well-formed inputs; ill-formed counts degrade to `false`.

## Performance and resource bounds
- Every function is O(1); `dueComponentReleases` is 047's own bounded pop. 6 new block states.

## Compatibility and migration
- Three additive block ids and three additive item ids (none renumbered); one new simulation file;
  the documented block/item characterization-test updates. No `Game.ts` edit; no schema/save-format
  change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted input surface.

## Observability
- `componentStateProperties` is the standard stateful-block record; scheduled releases are visible
  through 047's queue.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration + 2-state enumeration | `tests/unit/RedstoneInputComponents.test.ts` registration cases |
| REQ-2 signal strength | signal cases |
| REQ-3 lever latch | toggle cases |
| REQ-4 button press/release tick | button cases |
| REQ-5 plate occupancy | plate cases |
| REQ-6 scheduling + due ordering | scheduling cases |
| REQ-7 state projection | projection case |
