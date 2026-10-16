# Spec: piston-execution

## Contract
This capability adds an execution engine that applies an already-validated `PistonPushPlan` (163)
against an injected, generic `PistonExecutionWorld<TState>`, plus the plain (non-sticky) `piston`
block. No sticky/pull behavior, no loot generation, no direct 156 composition, no `Game`/`World`
wiring — see the proposal's Non-goals.

## Definitions
- **Snapshot-then-apply**: reading every moved block's source state before performing any write.
- **Affected positions**: every position whose block identity changes as a result of applying a
  plan — the piston, each moved block's source and destination, and any destroyed position.

## Invariants
- `executePistonPush` performs zero `PistonExecutionWorld` calls when `plan.canPush` is `false`.
- All `getBlockState` reads for a given execution happen before any `setBlockState`/
  `clearBlockState` write.
- Moves apply in `plan.blocksToMove`'s existing order; destroyed positions are cleared before any
  move-write.
- `pistonAffectedPositions` returns `[]` for a blocked plan.
- `pistonShouldBeExtended(powered)` is exactly `powered`.

## Requirements

### Requirement: the piston block and item are registered
`BlockRegistry` MUST register `piston` carrying `PISTON_SCHEMA` with a default of
`{ facing: 'north', extended: false }`; `ItemTypeRegistry` MUST register a placing item.

#### Scenario: the block carries its schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `piston` block is looked up
- **THEN** it exposes `PISTON_SCHEMA` and that default state

#### Scenario: the item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `piston` item is looked up
- **THEN** its `placeBlock` resolves to the piston block and `validateItemBlockCrossReferences`
  passes

#### Scenario: the block enumerates exactly 12 states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the piston's states are counted
- **THEN** there are exactly 12 (6 facings × 2 extended), and the default is among them

### Requirement: executePistonPush is a no-op for a blocked plan
`executePistonPush` MUST call no `PistonExecutionWorld` method when `plan.canPush` is `false`.

#### Scenario: a blocked plan changes nothing
- **GIVEN** a plan with `canPush: false`
- **WHEN** `executePistonPush` is called against a world that records every method call
- **THEN** no calls were recorded

### Requirement: executePistonPush applies an immediate-clear or immediate-destroy plan correctly
When `blocksToMove` is empty, `executePistonPush` MUST clear the destroyed position (if any) and
perform no other write.

#### Scenario: immediate clear termination
- **GIVEN** a plan with `canPush: true`, empty `blocksToMove`, empty `blocksToDestroy`
- **WHEN** `executePistonPush` is called
- **THEN** no world state changes

#### Scenario: immediate destroy termination
- **GIVEN** a plan with `canPush: true`, empty `blocksToMove`, `blocksToDestroy` containing one
  position
- **WHEN** `executePistonPush` is called
- **THEN** exactly that position is cleared

### Requirement: executePistonPush applies a multi-block chain to the correct final state
`executePistonPush` MUST move every `blocksToMove` entry to its `offsetInDirection(source, facing)`
destination and clear every source, producing a final world state with each original state now one
step further in `facing` and every original source position empty.

#### Scenario: a three-block chain ends in the correct final positions
- **GIVEN** a plan with three `blocksToMove` entries (farthest-first) and an empty
  `blocksToDestroy`, and a world pre-populated with distinguishable states at each source
- **WHEN** `executePistonPush` is called
- **THEN** each destination position holds its source's original (distinguishable) state, and every
  original source position is now empty

#### Scenario: a chain terminating in destruction moves and destroys correctly
- **GIVEN** a plan with two `blocksToMove` entries and one `blocksToDestroy` entry (the position the
  farthest block moves into)
- **WHEN** `executePistonPush` is called
- **THEN** the destroyed position ends up holding the farthest block's original state (the move
  overwrites the just-cleared destroy), the nearer block's destination holds its own original
  state, and both original source positions are empty

### Requirement: pistonAffectedPositions reports exactly what changed
`pistonAffectedPositions` MUST return `[]` for a blocked plan; otherwise it MUST return the
piston's own position, every moved block's source and computed destination, and every destroyed
position — no more, no fewer.

#### Scenario: a blocked plan reports no affected positions
- **GIVEN** a plan with `canPush: false`
- **WHEN** `pistonAffectedPositions` is called
- **THEN** it returns `[]`

#### Scenario: a successful plan reports the piston, sources, destinations, and destroyed positions
- **GIVEN** a plan with two `blocksToMove` entries and one `blocksToDestroy` entry
- **WHEN** `pistonAffectedPositions` is called
- **THEN** the returned positions are exactly the piston's own position, both sources, both
  computed destinations, and the destroyed position

### Requirement: pistonShouldBeExtended mirrors the powered input
`pistonShouldBeExtended(powered)` MUST return exactly `powered`.

#### Scenario: powered reads extended
- **GIVEN** `powered = true`
- **WHEN** `pistonShouldBeExtended` is called
- **THEN** it returns `true`

#### Scenario: unpowered reads retracted
- **GIVEN** `powered = false`
- **WHEN** `pistonShouldBeExtended` is called
- **THEN** it returns `false`

### Requirement: pistonStateProperties projects the full state
`pistonStateProperties(facing, extended)` MUST return a record containing exactly `facing` and
`extended`, each legal for `PISTON_SCHEMA`.

#### Scenario: the projection matches the schema
- **GIVEN** any legal combination of arguments
- **WHEN** `pistonStateProperties` is called
- **THEN** the record's keys are exactly `facing`, `extended`, each legal for its schema property

## Error and failure behavior
- No function throws for well-formed inputs; a blocked plan is handled as a documented no-op.

## Performance and resource bounds
- `executePistonPush` is O(`plan.blocksToMove.length`), bounded by 163's `PISTON_PUSH_LIMIT`.

## Compatibility and migration
- One additive block id and one additive item id; one new simulation file; the documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted input surface.

## Observability
- `pistonStateProperties` is the standard stateful-block record; `pistonAffectedPositions` makes
  "what changed" explicit.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration + 12 states | `tests/unit/PistonExecution.test.ts` registration cases |
| REQ-2 no-op on blocked plan | no-op case |
| REQ-3 immediate clear/destroy | immediate-termination cases |
| REQ-4 multi-block chain final state | chain cases |
| REQ-5 pistonAffectedPositions | affected-positions cases |
| REQ-6 pistonShouldBeExtended | extend/retract cases |
| REQ-7 state projection | projection case |
