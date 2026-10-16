# Spec: comparator

## Contract
This capability adds the redstone comparator: the first analog component, outputting a clamped
signal strength via one of two selectable modes (compare, subtract) over a front and side input. No
container signal reads, no `Game`/`World` wiring, no observer — see the proposal's Non-goals.

## Definitions
- **Front input**: the comparator's primary sampled signal.
- **Side input**: the comparator's secondary sampled signal (a future container-fullness bridge is
  a plausible future source, out of scope here).
- **Compare mode**: output is the front input unchanged when it is at least the side input, else 0.
- **Subtract mode**: output is the front input minus the side input, floored at 0.
- **Powered**: whether the comparator's resolved output is greater than 0.

## Invariants
- `cycleComparatorMode` is a total bijection on `{'compare', 'subtract'}`.
- Both inputs are clamped through 154's signal domain before any comparison or arithmetic.
- Compare mode's threshold is inclusive: an equal front and side input still passes through
  unchanged.
- Subtract mode never returns a negative value.
- `comparatorIsPowered(output)` is exactly `output > MIN_SIGNAL_STRENGTH`.

## Requirements

### Requirement: the comparator block and item are registered
`BlockRegistry` MUST register `redstone_comparator` carrying `COMPARATOR_SCHEMA` with a default of
`{ facing: 'north', mode: 'compare', powered: false }`; `ItemTypeRegistry` MUST register a placing
item.

#### Scenario: the block carries its schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `redstone_comparator` block is looked up
- **THEN** it exposes `COMPARATOR_SCHEMA` and that default state

#### Scenario: the item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `redstone_comparator` item is looked up
- **THEN** its `placeBlock` resolves to the comparator block and
  `validateItemBlockCrossReferences` passes

#### Scenario: the block enumerates exactly 16 states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the comparator's states are counted
- **THEN** there are exactly 16 (4 facings × 2 modes × 2 powered), and the default is among them

### Requirement: mode cycling toggles between the two modes
`cycleComparatorMode` MUST return `'subtract'` for `'compare'` and `'compare'` for `'subtract'`.

#### Scenario: cycling toggles both ways
- **GIVEN** each mode
- **WHEN** `cycleComparatorMode` is called
- **THEN** it returns the other mode, and applying it twice returns the original

### Requirement: compare mode passes through at or above the threshold, else zero
`resolveComparatorOutput('compare', front, side)` MUST equal the clamped front input when it is
`>=` the clamped side input, and `MIN_SIGNAL_STRENGTH` otherwise.

#### Scenario: front above side passes through
- **GIVEN** `front = 10`, `side = 4`
- **WHEN** `resolveComparatorOutput('compare', 10, 4)` is called
- **THEN** it returns `10`

#### Scenario: front exactly equal to side passes through
- **GIVEN** `front = 7`, `side = 7`
- **WHEN** `resolveComparatorOutput('compare', 7, 7)` is called
- **THEN** it returns `7`

#### Scenario: front below side yields zero
- **GIVEN** `front = 3`, `side = 5`
- **WHEN** `resolveComparatorOutput('compare', 3, 5)` is called
- **THEN** it returns `MIN_SIGNAL_STRENGTH`

### Requirement: subtract mode floors the difference at zero
`resolveComparatorOutput('subtract', front, side)` MUST equal
`max(MIN_SIGNAL_STRENGTH, front - side)`.

#### Scenario: a positive difference passes through
- **GIVEN** `front = 10`, `side = 4`
- **WHEN** `resolveComparatorOutput('subtract', 10, 4)` is called
- **THEN** it returns `6`

#### Scenario: a negative difference floors at zero
- **GIVEN** `front = 3`, `side = 8`
- **WHEN** `resolveComparatorOutput('subtract', 3, 8)` is called
- **THEN** it returns `MIN_SIGNAL_STRENGTH`

### Requirement: out-of-domain inputs are clamped before computation
Both modes MUST clamp `frontInput`/`sideInput` into the signal domain before comparing or
subtracting.

#### Scenario: an out-of-range front input is clamped
- **GIVEN** `front = 99`, `side = 4`, mode `'compare'`
- **WHEN** `resolveComparatorOutput` is called
- **THEN** it returns `MAX_SIGNAL_STRENGTH`

#### Scenario: a non-finite input is clamped to the minimum
- **GIVEN** `front = NaN`, `side = 0`, mode `'subtract'`
- **WHEN** `resolveComparatorOutput` is called
- **THEN** it returns `MIN_SIGNAL_STRENGTH`

### Requirement: comparatorIsPowered reflects a positive output
`comparatorIsPowered(output)` MUST return `true` exactly when `output > MIN_SIGNAL_STRENGTH`.

#### Scenario: zero output reads unpowered
- **GIVEN** an output of `MIN_SIGNAL_STRENGTH`
- **WHEN** `comparatorIsPowered` is called
- **THEN** it returns `false`

#### Scenario: a positive output reads powered
- **GIVEN** an output of `1`
- **WHEN** `comparatorIsPowered` is called
- **THEN** it returns `true`

### Requirement: updates are scheduled and deterministically ordered
`scheduleComparatorUpdate` MUST schedule the update `COMPARATOR_UPDATE_DELAY_TICKS` after the
current tick; `dueComparatorUpdates` MUST return exactly the entries due at or before `nowTick`,
deterministically ordered.

#### Scenario: an update is not due early
- **GIVEN** an update scheduled at tick `0`
- **WHEN** the queue is drained at `COMPARATOR_UPDATE_DELAY_TICKS - 1`
- **THEN** nothing is returned

#### Scenario: an update fires at its tick
- **GIVEN** the same update
- **WHEN** the queue is drained at `COMPARATOR_UPDATE_DELAY_TICKS`
- **THEN** exactly that position is returned

#### Scenario: same-tick updates are deterministically ordered
- **GIVEN** two comparators scheduled for the same update tick
- **WHEN** the queue is drained at that tick
- **THEN** both are returned in scheduling order, and repeating the scenario yields the identical
  order

### Requirement: comparatorStateProperties projects the full state
`comparatorStateProperties(facing, mode, powered)` MUST return a record containing exactly
`facing`, `mode`, and `powered`, each legal for `COMPARATOR_SCHEMA`.

#### Scenario: the projection matches the schema
- **GIVEN** any legal combination of arguments
- **WHEN** `comparatorStateProperties` is called
- **THEN** the record's keys are exactly `facing`, `mode`, `powered`, each legal for its schema
  property

## Error and failure behavior
- No function throws for well-formed inputs; a non-finite tick is treated as `0`; out-of-domain
  signal inputs are clamped, never rejected.

## Performance and resource bounds
- Every function is O(1); `dueComparatorUpdates` is 047's own bounded pop. 16 new block states.

## Compatibility and migration
- One additive block id and one additive item id; one new simulation file; the documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted input surface.

## Observability
- `comparatorStateProperties` is the standard stateful-block record.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration + 16 states | `tests/unit/RedstoneComparator.test.ts` registration cases |
| REQ-2 mode cycling | cycling case |
| REQ-3 compare mode | compare-above/equal/below cases |
| REQ-4 subtract mode | subtract-positive/floor cases |
| REQ-5 input clamping | clamp cases |
| REQ-6 comparatorIsPowered | powered/unpowered cases |
| REQ-7 scheduling + ordering | scheduling cases |
| REQ-8 state projection | projection case |
