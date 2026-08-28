# Spec: piston-move-planner

## Contract
This capability adds a pure push-chain planner for pistons: given a starting position, a facing,
and an injected `PistonWorld`, it computes whether a push succeeds, which positions would move (and
in what order), and which single position (if any) would be destroyed instead of moved. It performs
no mutation, adds no block/item, and does not decide whether a piston should push — see the
proposal's Non-goals.

## Definitions
- **Movable**: a position that continues the push chain and would itself move.
- **Terminates-clear**: a position that ends the chain successfully with nothing destroyed (e.g.
  air).
- **Terminates-destroy**: a position that ends the chain successfully and is itself destroyed.
- **Immovable**: a position that blocks the entire push, regardless of chain length so far.
- **Push limit**: the maximum number of movable positions a single push may include (`12`).

## Invariants
- `classifyPistonBlock` returns `'immovable'` whenever `isImmovable` is `true`, regardless of
  `isPushable`/`isDestroyedByPush`.
- `blocksToMove` is ordered farthest-from-the-start-position-first.
- `blocksToDestroy` has at most one entry, and only when the chain ended in `terminates-destroy`.
- A blocked push (`canPush: false`) always has empty `blocksToMove` and `blocksToDestroy`.

## Requirements

### Requirement: classifyPistonBlock resolves the four outcomes correctly
`classifyPistonBlock(world, x, y, z)` MUST return `'immovable'` when `isImmovable` is `true`
(regardless of the other two predicates); otherwise `'movable'` when `isPushable` is `true`;
otherwise `'terminates-destroy'` when `isDestroyedByPush` is `true`; otherwise `'terminates-clear'`.

#### Scenario: a movable position
- **GIVEN** `isImmovable = false`, `isPushable = true`
- **WHEN** `classifyPistonBlock` is called
- **THEN** it returns `'movable'`

#### Scenario: a clean terminator
- **GIVEN** `isImmovable = false`, `isPushable = false`, `isDestroyedByPush = false`
- **WHEN** `classifyPistonBlock` is called
- **THEN** it returns `'terminates-clear'`

#### Scenario: a destroying terminator
- **GIVEN** `isImmovable = false`, `isPushable = false`, `isDestroyedByPush = true`
- **WHEN** `classifyPistonBlock` is called
- **THEN** it returns `'terminates-destroy'`

#### Scenario: immovable takes precedence over an inconsistent pushable report
- **GIVEN** `isImmovable = true`, `isPushable = true`
- **WHEN** `classifyPistonBlock` is called
- **THEN** it returns `'immovable'`

### Requirement: planPistonPush succeeds and orders moves correctly when the chain terminates cleanly
`planPistonPush` MUST report `canPush: true` with `blocksToMove` containing every movable position
found, ordered farthest-first, and an empty `blocksToDestroy`, when the chain ends at a
`terminates-clear` position.

#### Scenario: immediate clear termination moves nothing
- **GIVEN** the position directly in front of the start is `terminates-clear`
- **WHEN** `planPistonPush` is called
- **THEN** `canPush` is `true`, `blocksToMove` is empty, `blocksToDestroy` is empty

#### Scenario: several movable blocks then a clear termination
- **GIVEN** three movable positions in a row followed by a `terminates-clear` position
- **WHEN** `planPistonPush` is called
- **THEN** `canPush` is `true`, `blocksToMove` contains exactly those three positions ordered
  farthest-from-the-start-first, `blocksToDestroy` is empty

### Requirement: planPistonPush succeeds and marks the terminator for destruction when it terminates by destruction
`planPistonPush` MUST report `canPush: true` with the same `blocksToMove` ordering, and
`blocksToDestroy` containing exactly the one terminating position, when the chain ends at a
`terminates-destroy` position.

#### Scenario: immediate destroy termination
- **GIVEN** the position directly in front of the start is `terminates-destroy`
- **WHEN** `planPistonPush` is called
- **THEN** `canPush` is `true`, `blocksToMove` is empty, `blocksToDestroy` contains exactly that
  position

#### Scenario: several movable blocks then a destroy termination
- **GIVEN** two movable positions in a row followed by a `terminates-destroy` position
- **WHEN** `planPistonPush` is called
- **THEN** `canPush` is `true`, `blocksToMove` contains exactly those two positions ordered
  farthest-first, `blocksToDestroy` contains exactly the terminating position

### Requirement: an immovable position blocks the push entirely, at any point in the chain
`planPistonPush` MUST report `canPush: false`, `blockedReason: 'immovable'`, `blockedAt` set to the
immovable position, and both `blocksToMove`/`blocksToDestroy` empty, whenever any position in the
chain classifies as `'immovable'`.

#### Scenario: immovable at the first position
- **GIVEN** the position directly in front of the start is `'immovable'`
- **WHEN** `planPistonPush` is called
- **THEN** `canPush` is `false`, `blockedReason` is `'immovable'`, `blockedAt` is that position,
  `blocksToMove` and `blocksToDestroy` are both empty

#### Scenario: immovable after some movable blocks
- **GIVEN** two movable positions in a row followed by an `'immovable'` position
- **WHEN** `planPistonPush` is called
- **THEN** `canPush` is `false`, `blockedReason` is `'immovable'`, `blockedAt` is the immovable
  position, and `blocksToMove` is empty even though two movable positions were found

### Requirement: exceeding the push limit blocks the push entirely
`planPistonPush` MUST report `canPush: false` and `blockedReason: 'exceeded-limit'` when
`PISTON_PUSH_LIMIT` movable positions are found in a row with no terminator or immovable block
within that span.

#### Scenario: exactly at the limit succeeds
- **GIVEN** exactly `PISTON_PUSH_LIMIT` movable positions followed by a `terminates-clear` position
- **WHEN** `planPistonPush` is called
- **THEN** `canPush` is `true` and `blocksToMove.length` is `PISTON_PUSH_LIMIT`

#### Scenario: one more than the limit fails
- **GIVEN** `PISTON_PUSH_LIMIT + 1` movable positions in a row
- **WHEN** `planPistonPush` is called
- **THEN** `canPush` is `false`, `blockedReason` is `'exceeded-limit'`, and `blocksToMove` is empty

### Requirement: the walk follows the given facing exactly
`planPistonPush` MUST classify positions in strict `offsetInDirection` order starting one block
from `(x, y, z)` in `facing`, for all six `Direction` values.

#### Scenario: every facing walks the geometrically correct line
- **GIVEN** each of the six `Direction` values as `facing`
- **WHEN** `planPistonPush` is called with a `PistonWorld` that records every position queried
- **THEN** the queried positions exactly match the sequence `offsetInDirection` produces stepping
  outward in that direction

## Error and failure behavior
- Neither `classifyPistonBlock` nor `planPistonPush` throws for well-formed inputs; a blocked push
  is represented in the returned plan, not an exception.

## Performance and resource bounds
- `planPistonPush` is O(`PISTON_PUSH_LIMIT`) — at most 13 `PistonWorld` calls per invocation.

## Compatibility and migration
- One new file; zero registry changes; zero characterization-test updates. No `Game.ts` edit; no
  schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted input surface.

## Observability
- `PistonPushPlan`'s `blockedReason`/`blockedAt` make a rejected push's cause explicit.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 classifyPistonBlock outcomes + precedence | `tests/unit/PistonMovePlanner.test.ts` classification cases |
| REQ-2 clear-termination success + ordering | clear-termination cases |
| REQ-3 destroy-termination success | destroy-termination cases |
| REQ-4 immovable blocks entirely | immovable-blocking cases |
| REQ-5 push-limit boundary | limit cases |
| REQ-6 facing-correct walk | all-six-facings case |
