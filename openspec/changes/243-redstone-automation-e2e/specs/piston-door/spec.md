# Spec: piston-door

## Contract

The piston-driven barrier circuit of change 243. A canonical **piston door** is a
piston (normal or sticky, via 163/164/165) that, when powered, pushes a movable
door block away from its base to open the doorway, and when unpowered retracts so
the door block returns to close it. The contract under test is that the piston's
`extended` state, the moved door block's final position (and the cleared source
position), and the closed-state door position all survive full save→reload and
single-chunk unload→reload. Circuit-state validity (the piston property record
`{ facing, extended }` and the exact block-position map) is asserted at every
step.

## Definitions

- **Extended**: the piston's `extended === true` state (property record
  `pistonStateProperties(facing, true)`).
- **Door position**: the block position of the movable door block after a push or
  after a retract.
- **Open/closed**: the doorway is open when the piston is extended and the door
  block sits at the pushed destination; closed when the piston is retracted and
  the door block sits at the closed position.
- **Block-position map**: the exact `Map<pos, blockState>` after an operation,
  used to assert no block is lost or duplicated.

## Invariants

- A push moves the door block farthest-first (163 ordering) so the farthest block
  lands at the push target; the source position MUST be cleared.
- No block is created, destroyed, or duplicated by a push/retract; the block-
  position map before and after an open+close round trip MUST contain the same
  block identities at the same positions.
- The piston `extended`/`facing` property record and the door block positions MUST
  be preserved losslessly across save→reload and chunk cycling.

## Requirements

### Requirement: open and close
When powered, the piston MUST extend and the door block MUST move to the pushed
destination (farthest-first, source cleared). When unpowered, the piston MUST
retract and the door block MUST return to the closed position.

#### Scenario: piston opens then closes the door
- **GIVEN** a built piston door with a door block at the closed position `C` and
  the piston unpowered
- **WHEN** the piston is powered, the harness steps for the extension to complete,
  then the piston is unpowered and the harness steps for the retract to complete
- **THEN** while powered the piston `extended` is `true` and the door block is at
  the pushed destination `D`
- **AND** while powered the source position `C` is cleared (air)
- **AND** after unpowering the piston `extended` is `false` and the door block is
  back at `C`

### Requirement: open state survives save→reload
A full `saveReload()` while the piston is extended MUST preserve `extended ===
true`, the door block at `D`, and the cleared source `C`.

#### Scenario: extended door preserved across save→reload
- **GIVEN** a piston door with the piston extended and the door block at `D`
- **WHEN** `saveReload()` runs, then the block-position map and piston property
  record are read
- **THEN** the piston `extended` is `true` and `facing` is unchanged
- **AND** the door block is still at `D` and position `C` is still air

### Requirement: closed state survives save→reload
A full `saveReload()` while the piston is retracted MUST preserve `extended ===
false` and the door block at the closed position `C`.

#### Scenario: closed door preserved across save→reload
- **GIVEN** a piston door with the piston retracted and the door block at `C`
- **WHEN** `saveReload()` runs, then the block-position map and piston property
  record are read
- **THEN** the piston `extended` is `false`
- **AND** the door block is still at `C`

### Requirement: door state survives single-chunk unload→reload
A `cycleChunk` over the chunk(s) containing the piston and door block MUST
preserve the extended/retracted state and the exact block-position map.

#### Scenario: extended door preserved across chunk cycle
- **GIVEN** a piston door spanning one or two chunks with the piston extended and
  the door block at `D`
- **WHEN** `cycleChunk` runs over each chunk the piston door occupies
- **THEN** the piston `extended` is `true`
- **AND** the door block is at `D` and the source `C` is air (block-position map
  unchanged)

## Error and failure behavior

- A push that plans `canPush: false` (immovable block or exceeded `PISTON_PUSH_LIMIT`)
  is a circuit-construction failure; the test MUST NOT observe a moved door.
- A round-trip that loses the door block, duplicates it, or flips the piston
  extended state is a failure caught by the block-position-map and property-record
  assertions.
- A moved-block position written before its destination is vacated (non-farthest-
  first ordering) is a failure.

## Performance and resource bounds

- Each piston-door scenario runs under a bounded `maxSteps` budget (a few tens of
  ticks for extend/retract); no unbounded stepping.

## Compatibility and migration

Test-only; the circuit uses the real 163/164/165 piston modules and the 047 queue.
No stored format changes; no migration.

## Security and integrity

No external input surface beyond the round-trip payloads handled by the
`automation-harness` spec's atomic-rejection contract.

## Observability

- The piston `extended`/`facing` property record and the block-position map
  localize whether a failure is a wrong move order, a lost/duplicated block, or a
  state flip.

## Verification mapping

- `tests/unit/RedstoneAutomationCircuits.test.ts`: `piston door open then close`,
  `piston door open survives save→reload`, `piston door closed survives
  save→reload`, `piston door survives chunk cycle`.
