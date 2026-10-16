# Spec: repeater

## Contract
This capability adds the redstone repeater: a configurable-delay signal line that can be locked by
a perpendicular neighbour, holding its output frozen while locked. No `Game`/`World` wiring, no
comparator/observer, no input-change tracking, no rendering distinction — see the proposal's
Non-goals.

## Definitions
- **Delay**: one of `1|2|3|4`, mapping to `REPEATER_DELAY_TICKS`.
- **Locked**: a repeater ignoring its front input, frozen at its last output, because a
  perpendicular neighbour is powered.
- **Powered**: the repeater's current output boolean state.

## Invariants
- `REPEATER_DELAY_TICKS` is defined for every delay `1..4` and strictly increasing.
- `cycleRepeaterDelay` is a total bijection on `{1,2,3,4}` with period 4.
- `repeaterShouldLock(p)` is exactly `p`.
- `resolveRepeaterOutput` returns `currentPowered` unchanged when `locked`, and `currentInput`
  otherwise.
- `repeaterSignalStrength` mirrors 158's full/none rule exactly.

## Requirements

### Requirement: the repeater block and item are registered
`BlockRegistry` MUST register `redstone_repeater` carrying `REPEATER_SCHEMA` with a default of
`{ facing: 'north', delay: 1, locked: false, powered: false }`; `ItemTypeRegistry` MUST register a
placing item.

#### Scenario: the block carries its schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `redstone_repeater` block is looked up
- **THEN** it exposes `REPEATER_SCHEMA` and that default state

#### Scenario: the item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `redstone_repeater` item is looked up
- **THEN** its `placeBlock` resolves to the repeater block and
  `validateItemBlockCrossReferences` passes

#### Scenario: the block enumerates exactly 64 states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the repeater's states are counted
- **THEN** there are exactly 64 (4 facings × 4 delays × 2 locked × 2 powered), and the default is
  among them

### Requirement: each delay setting maps to the correct tick cost
`REPEATER_DELAY_TICKS[d]` MUST equal `2, 4, 6, 8` for `d = 1, 2, 3, 4` respectively.

#### Scenario: all four delays resolve correctly
- **GIVEN** delays `1`, `2`, `3`, `4`
- **WHEN** each is looked up in `REPEATER_DELAY_TICKS`
- **THEN** they resolve to `2`, `4`, `6`, `8` respectively

### Requirement: cycling wraps after the fourth delay
`cycleRepeaterDelay` MUST advance `1→2→3→4→1`.

#### Scenario: cycling four times returns to the start
- **GIVEN** delay `1`
- **WHEN** `cycleRepeaterDelay` is applied four times in sequence
- **THEN** each call yields `2`, `3`, `4`, `1` in order

### Requirement: locking follows the perpendicular input directly
`repeaterShouldLock(perpendicularPowered)` MUST return `perpendicularPowered` unchanged.

#### Scenario: a powered perpendicular neighbour locks
- **GIVEN** `perpendicularPowered` of `true`
- **WHEN** `repeaterShouldLock` is called
- **THEN** it returns `true`

#### Scenario: an unpowered perpendicular neighbour does not lock
- **GIVEN** `perpendicularPowered` of `false`
- **WHEN** `repeaterShouldLock` is called
- **THEN** it returns `false`

### Requirement: resolveRepeaterOutput holds when locked and follows when not
`resolveRepeaterOutput(currentInput, locked, currentPowered)` MUST return `currentPowered`
unchanged when `locked` is `true`, and `currentInput` when `locked` is `false`, regardless of the
other argument's value.

#### Scenario: a locked repeater ignores a changed input
- **GIVEN** `currentPowered` of `true`, `locked` of `true`, and `currentInput` of `false`
- **WHEN** `resolveRepeaterOutput` is called
- **THEN** it returns `true` (unchanged)

#### Scenario: an unlocked repeater follows its input
- **GIVEN** `currentPowered` of `false`, `locked` of `false`, and `currentInput` of `true`
- **WHEN** `resolveRepeaterOutput` is called
- **THEN** it returns `true`

### Requirement: a powered repeater emits full signal
`repeaterSignalStrength` MUST return `MAX_SIGNAL_STRENGTH` when powered and `MIN_SIGNAL_STRENGTH`
otherwise.

#### Scenario: powered and unpowered emission
- **GIVEN** both powered states
- **WHEN** `repeaterSignalStrength` is called for each
- **THEN** they return `MAX_SIGNAL_STRENGTH` and `MIN_SIGNAL_STRENGTH` respectively

### Requirement: output scheduling honors the selected delay and orders deterministically
`scheduleRepeaterOutput` MUST schedule the output `REPEATER_DELAY_TICKS[delay]` after the current
tick, for every delay setting; `dueRepeaterOutputs` MUST return exactly the entries due at or
before `nowTick`, deterministically ordered.

#### Scenario: each delay setting is not due before its own tick cost
- **GIVEN** a repeater scheduled at each of the four delay settings from tick `0`
- **WHEN** the queue is drained one tick before each setting's `REPEATER_DELAY_TICKS` value
- **THEN** none of them are due yet

#### Scenario: each delay setting fires at its own tick cost
- **GIVEN** the same four schedules
- **WHEN** the queue is drained at each setting's exact `REPEATER_DELAY_TICKS` value
- **THEN** each fires at its own tick, not before

#### Scenario: same-tick outputs are deterministically ordered
- **GIVEN** two repeaters scheduled for the same output tick
- **WHEN** the queue is drained at that tick
- **THEN** both are returned in scheduling order, and repeating the scenario yields the identical
  order

### Requirement: repeaterStateProperties projects the full state
`repeaterStateProperties(facing, delay, locked, powered)` MUST return a record containing exactly
`facing`, `delay`, `locked`, and `powered`, each legal for `REPEATER_SCHEMA`.

#### Scenario: the projection matches the schema
- **GIVEN** any legal combination of arguments
- **WHEN** `repeaterStateProperties` is called
- **THEN** the record's keys are exactly `facing`, `delay`, `locked`, `powered`, and each value is
  legal for its schema property

## Error and failure behavior
- No function throws for well-formed inputs; a non-finite tick is treated as `0`.

## Performance and resource bounds
- Every function is O(1); `dueRepeaterOutputs` is 047's own bounded pop. 64 new block states.

## Compatibility and migration
- One additive block id and one additive item id; one new simulation file; the documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted input surface.

## Observability
- `repeaterStateProperties` is the standard stateful-block record.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration + 64 states | `tests/unit/RedstoneRepeater.test.ts` registration cases |
| REQ-2 delay tick mapping | delay-mapping case |
| REQ-3 delay cycling | cycling case |
| REQ-4 lock predicate | lock cases |
| REQ-5 output resolution | resolution cases |
| REQ-6 signal strength | signal case |
| REQ-7 scheduling + ordering | scheduling cases |
| REQ-8 state projection | projection case |
