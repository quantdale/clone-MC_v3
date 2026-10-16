# Spec: observer

## Contract
This capability adds the redstone observer: a block that watches the neighbour it faces and, on a
caller-detected change, emits a short two-phase pulse out its back. No change-detection itself, no
re-trigger suppression beyond 047's own dedup-by-position, no `Game`/`World` wiring — see the
proposal's Non-goals.

## Definitions
- **Watched neighbour**: the block one position in the observer's facing direction.
- **Emission neighbour**: the block one position opposite the observer's facing direction.
- **Pulse-start**: the scheduled event that turns the observer's `powered` state on.
- **Pulse-end**: the scheduled event that turns the observer's `powered` state back off.
- **Powered**: whether the observer's pulse is currently on.

## Invariants
- `observedNeighborPosition(x, y, z, facing)` equals `offsetInDirection(x, y, z, facing)`.
- `emissionNeighborPosition(x, y, z, facing)` equals
  `offsetInDirection(x, y, z, OPPOSITE_DIRECTION[facing])`.
- `observerSignalStrength(powered)` is `MAX_SIGNAL_STRENGTH` when `powered`, else
  `MIN_SIGNAL_STRENGTH`.
- Pulse-start and pulse-end scheduling/draining each behave identically to 157-160's 047 bridges.

## Requirements

### Requirement: the observer block and item are registered
`BlockRegistry` MUST register `observer` carrying `OBSERVER_SCHEMA` with a default of
`{ facing: 'north', powered: false }`; `ItemTypeRegistry` MUST register a placing item.

#### Scenario: the block carries its schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `observer` block is looked up
- **THEN** it exposes `OBSERVER_SCHEMA` and that default state

#### Scenario: the item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `observer` item is looked up
- **THEN** its `placeBlock` resolves to the observer block and
  `validateItemBlockCrossReferences` passes

#### Scenario: the block enumerates exactly 12 states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the observer's states are counted
- **THEN** there are exactly 12 (6 facings × 2 powered), and the default is among them

### Requirement: the watched and emission neighbours are opposite each other
`observedNeighborPosition`/`emissionNeighborPosition` MUST derive from 154's
`offsetInDirection`/`OPPOSITE_DIRECTION` exactly, for all six facings.

#### Scenario: watched and emission positions are derived correctly for every facing
- **GIVEN** an origin position and each of the six `Direction` values as `facing`
- **WHEN** `observedNeighborPosition` and `emissionNeighborPosition` are called
- **THEN** each equals `offsetInDirection` applied with `facing` and `OPPOSITE_DIRECTION[facing]`
  respectively, and the two positions are never equal

### Requirement: the pulse turns on and off on independent schedules
`scheduleObserverPulseStart`/`dueObserverPulseStarts` MUST schedule/drain a pulse-start
`OBSERVER_PULSE_START_DELAY_TICKS` after the current tick; `scheduleObserverPulseEnd`/
`dueObserverPulseEnds` MUST schedule/drain a pulse-end `OBSERVER_PULSE_DURATION_TICKS` after the
pulse-start tick; both MUST be deterministically ordered on same-tick collisions.

#### Scenario: a pulse-start is not due early
- **GIVEN** a pulse-start scheduled at tick `0`
- **WHEN** its queue is drained at `OBSERVER_PULSE_START_DELAY_TICKS - 1`
- **THEN** nothing is returned

#### Scenario: a pulse-start fires at its tick
- **GIVEN** the same pulse-start
- **WHEN** its queue is drained at `OBSERVER_PULSE_START_DELAY_TICKS`
- **THEN** exactly that position is returned

#### Scenario: same-tick pulse-starts are deterministically ordered
- **GIVEN** two observers scheduled for the same pulse-start tick
- **WHEN** the queue is drained at that tick
- **THEN** both are returned in scheduling order, and repeating the scenario yields the identical
  order

#### Scenario: a pulse-end is not due early
- **GIVEN** a pulse-end scheduled `OBSERVER_PULSE_DURATION_TICKS` after a pulse-start tick
- **WHEN** its queue is drained one tick before that
- **THEN** nothing is returned

#### Scenario: a pulse-end fires at its tick
- **GIVEN** the same pulse-end
- **WHEN** its queue is drained at its due tick
- **THEN** exactly that position is returned

### Requirement: observerSignalStrength reflects the powered flag
`observerSignalStrength(powered)` MUST return `MAX_SIGNAL_STRENGTH` when `powered` is `true`, else
`MIN_SIGNAL_STRENGTH`.

#### Scenario: powered on reads full signal
- **GIVEN** `powered = true`
- **WHEN** `observerSignalStrength` is called
- **THEN** it returns `MAX_SIGNAL_STRENGTH`

#### Scenario: powered off reads no signal
- **GIVEN** `powered = false`
- **WHEN** `observerSignalStrength` is called
- **THEN** it returns `MIN_SIGNAL_STRENGTH`

### Requirement: observerStateProperties projects the full state
`observerStateProperties(facing, powered)` MUST return a record containing exactly `facing` and
`powered`, each legal for `OBSERVER_SCHEMA`.

#### Scenario: the projection matches the schema
- **GIVEN** any legal combination of arguments
- **WHEN** `observerStateProperties` is called
- **THEN** the record's keys are exactly `facing`, `powered`, each legal for its schema property

## Error and failure behavior
- No function throws for well-formed inputs; a non-finite tick is treated as `0`.

## Performance and resource bounds
- Every function is O(1); both `due*` functions are 047's own bounded pop. 12 new block states.

## Compatibility and migration
- One additive block id and one additive item id; one new simulation file; the documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted input surface.

## Observability
- `observerStateProperties` is the standard stateful-block record.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration + 12 states | `tests/unit/RedstoneObserver.test.ts` registration cases |
| REQ-2 watched/emission positions | neighbour-position cases (all six facings) |
| REQ-3 pulse-start scheduling + ordering | pulse-start scheduling cases |
| REQ-3 pulse-end scheduling | pulse-end scheduling cases |
| REQ-4 observerSignalStrength | signal-strength cases |
| REQ-5 state projection | projection case |
