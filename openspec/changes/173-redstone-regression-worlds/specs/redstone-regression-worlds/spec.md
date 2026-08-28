# Spec: redstone-regression-worlds

## Contract
This capability is the section-closing regression contract for Redstone and automation (154-172):
eight canonical headless fixtures compose the section's pure modules into circuits and assert
tick-exact timelines. Test-only; no production code changes.

## Definitions
- **Fixture**: a self-contained `describe/it` scenario composing exported module APIs against an
  in-memory world and/or a 047 `ScheduledTickQueue`.
- **Timeline**: the tick-exact due/not-due assertions of scheduled events.

## Invariants
- Every timing fixture asserts both the not-due tick and the due tick.
- Fixtures use only exported module APIs.
- No fixture mutates shared state.

## Requirements

### Requirement: F1 — repeater delay chain (159)
A two-repeater chain MUST fire at ticks 2 and 4 for a tick-0 input, with `REPEATER_DELAY_TICKS[1]`
equal to 2 and nothing due at tick 1.

#### Scenario: chain timeline
- **GIVEN** `REPEATER_DELAY_TICKS[1] === 2` and `resolveRepeaterOutput(true, false, false) === true`
- **WHEN** repeater 1 is scheduled at tick 0 and repeater 2 at tick 2
- **THEN** nothing is due at tick 1, `(1,0,0)` is due at tick 2, and `(2,0,0)` is due at tick 4

### Requirement: F2 — comparator modes and delay (160)
`resolveComparatorOutput` MUST be the exact compare/subtract function of the clamped inputs, and
updates MUST be due exactly `COMPARATOR_UPDATE_DELAY_TICKS` (2) after scheduling.

#### Scenario: mode outputs and delay
- **GIVEN** inputs `(8, 3)` and `(3, 8)` in both modes
- **THEN** compare yields `8` and `0`; subtract yields `5` and `0`; an update scheduled at tick 0 is
  due at tick 2 and not at tick 1

### Requirement: F3 — torch inversion and burnout (158)
`torchShouldBeLit` MUST be `!attachmentPowered`, a lit torch MUST emit signal 15, and the burnout
tracker MUST burn out a torch only when toggles *exceed* `BURNOUT_TOGGLE_LIMIT` (8) within the window.

#### Scenario: inversion, signal, and strict-exceeds burnout
- **GIVEN** a powered/unpowered attachment and 8 vs 9 recorded toggles
- **THEN** `torchShouldBeLit` inverts, `torchSignalStrength(true) === 15`, 9 toggles burn out, and
  exactly 8 do not

### Requirement: F4 — piston push chain (163/164)
`planPistonPush` MUST produce a farthest-first move plan for a pushable chain, and
`executePistonPush` MUST apply it atomically so the farthest block lands at the push target.

#### Scenario: three-block chain
- **GIVEN** pushable blocks at `(1..3, 0, 0)` and a piston at `(0, 0, 0)` facing east
- **THEN** `blocksToMove` is `[[3,0,0],[2,0,0],[1,0,0]]`, the final store has the blocks at
  `(2..4, 0, 0)`, and `(1, 0, 0)` is cleared

### Requirement: F5 — hopper→dropper item pipeline (166/167)
A hopper transfer scheduled at tick 0 MUST be due at tick 8 (not 7) and move exactly one item; a
dropper drop scheduled at tick 8 MUST be due at tick 16 (not 15) and produce a `DroppedItem`.

#### Scenario: pipeline timeline
- **GIVEN** a hopper with 5 stone and an empty container, then a dropper with 4 stone facing air
- **THEN** at tick 8 one item transfers (container holds 1, hopper holds 4); at tick 16 the dropper
  yields a `drop` descriptor and holds 3

### Requirement: F6 — dispenser plain-item parity (168)
`dispenseFromDispenser` with a plain item and a container MUST return `kind: 'container'` with the
same merge semantics as a dropper.

#### Scenario: plain-item push
- **GIVEN** a dispenser holding 5 stone facing a container with a 10-stone slot and an empty slot
- **THEN** the result is `kind: 'container'`, the mergeable slot holds 11, and the dispenser holds 4

### Requirement: F7 — TNT detonation timeline (169/170)
Redstone-primed TNT MUST NOT be due at fuse 1 and MUST be due at fuse 0; `explodePrimedTnt` MUST
destroy the stone one block east and resolve its drop.

#### Scenario: fuse and detonation
- **GIVEN** a primed TNT at `(0, 0, 0)` with a stone block at `(1, 0, 0)`
- **THEN** fuse 1 is not due, fuse 0 is due, `destroyed` contains `[1, 0, 0]`, and `drops` contains
  the cobblestone at `[1, 0, 0]`

### Requirement: F8 — rail traversal and minecart timing (171/172)
A straight `north_south` rail MUST zero the cart's `vx`, keep `vz` at `MINECART_MAX_SPEED`, and
advance `z` by the speed; a `corner_north_east` MUST turn a north-bound cart onto the east axis.

#### Scenario: straight and corner
- **GIVEN** a cart at `(0.5, 0.5, 0.5)` with `(vx, vz) = (0.4, 0.4)` on `north_south`, and a cart
  with `vz = -0.2` on `corner_north_east`
- **THEN** the first cart ends with `(vx, vz) = (0, 0.4)` and `z = 0.9`; the second ends with
  `(vx, vz) = (0.2, 0)`

## Error and failure behavior
- A fixture failure identifies a module regression or contract drift; no fixture throws for its
  well-formed inputs.

## Performance and resource bounds
- All fixtures run in milliseconds.

## Compatibility and migration
- Test-only change; no production surface changes.

## Security and integrity
- No new inputs beyond module fixtures.

## Observability
- Fixture names (F1-F8) match the proposal and design; failures localize to one module surface.

## Verification mapping
| Requirement | Test / command |
|---|---|
| F1 | `tests/unit/RedstoneRegressionWorlds.test.ts` › `fixture 1` |
| F2 | › `fixture 2` |
| F3 | › `fixture 3` |
| F4 | › `fixture 4` |
| F5 | › `fixture 5` |
| F6 | › `fixture 6` |
| F7 | › `fixture 7` |
| F8 | › `fixture 8` |
