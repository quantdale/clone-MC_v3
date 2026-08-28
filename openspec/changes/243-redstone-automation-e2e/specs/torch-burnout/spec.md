# Spec: torch-burnout

## Contract

The torch burnout/recovery edge case of change 243. A torch driven to toggle
rapidly exceeds `BURNOUT_TOGGLE_LIMIT` (8) toggles within `BURNOUT_WINDOW_TICKS`
(60) and burns out: it is unlit (`torchShouldBeLit` inverted by burnout) and stays
off until `BURNOUT_RECOVERY_TICKS` (60) of quiet have passed since its last
toggle. The contract under test is that the burnout state and the tracked toggle
history survive full save→reload and single-chunk unload→reload, that a burnt-out
torch stays unlit through the recovery window, and that it recovers (relights) only
after the window has elapsed. The boundary is strict: exactly 8 toggles within the
window MUST NOT burn out; exceeding 8 MUST.

## Definitions

- **Toggle**: a lit↔unlit transition of a torch, recorded via
  `TorchBurnoutTracker.recordToggle(torchId, tick)`.
- **Burnt out**: `TorchBurnoutTracker.isBurnedOut(torchId, tick) === true` — the
  retained toggle count exceeded `BURNOUT_TOGGLE_LIMIT` within `BURNOUT_WINDOW_TICKS`
  and fewer than `BURNOUT_RECOVERY_TICKS` have passed since the last toggle.
- **Recovery**: the torch relights once `BURNOUT_RECOVERY_TICKS` of quiet have
  passed since its last toggle (the tracker then reads not-burnt-out).
- **Toggle history**: the serialized per-torch list of recorded toggle ticks that
  a round-trip must preserve.

## Invariants

- Exactly `BURNOUT_TOGGLE_LIMIT` toggles within the window MUST NOT burn the torch
  out; more than `BURNOUT_TOGGLE_LIMIT` MUST.
- A burnt-out torch MUST remain unlit until `BURNOUT_RECOVERY_TICKS` of quiet since
  its last toggle, then MUST recover.
- The burnout state and the toggle history MUST be preserved losslessly across
  save→reload and chunk cycling.

## Requirements

### Requirement: strict burnout boundary
A torch MUST NOT burn out when it has exactly `BURNOUT_TOGGLE_LIMIT` toggles
within `BURNOUT_WINDOW_TICKS`, and MUST burn out when it exceeds that limit.

#### Scenario: exactly the limit does not burn out
- **GIVEN** a torch with exactly 8 toggles recorded within `BURNOUT_WINDOW_TICKS`
- **WHEN** `isBurnedOut(torchId, tick)` is queried within the window
- **THEN** it returns `false` and the torch remains lit (`torchShouldBeLit` as
  normal)

#### Scenario: exceeding the limit burns out
- **GIVEN** a torch with 9 toggles recorded within `BURNOUT_WINDOW_TICKS`
- **WHEN** `isBurnedOut(torchId, tick)` is queried within the window
- **THEN** it returns `true` and the torch is unlit

### Requirement: recovery timing
A burnt-out torch MUST stay unlit until `BURNOUT_RECOVERY_TICKS` (60) of quiet
since its last toggle, and MUST recover (become lit) once the window has elapsed.

#### Scenario: stays unlit through the window, then recovers
- **GIVEN** a burnt-out torch whose last toggle was at tick `L`
- **WHEN** the torch is queried at tick `L + BURNOUT_RECOVERY_TICKS - 1` and at tick
  `L + BURNOUT_RECOVERY_TICKS`
- **THEN** at `L + 59` the torch is still burnt out and unlit
- **AND** at `L + 60` it is no longer burnt out and is lit again

### Requirement: burnout state survives save→reload
A full `saveReload()` while a torch is burnt out MUST preserve the burnt-out
(unlit) state and the toggle history; after the round-trip the torch MUST still be
burnt out and MUST recover only after the remaining `BURNOUT_RECOVERY_TICKS` have
elapsed.

#### Scenario: burnt-out torch preserved across save→reload
- **GIVEN** a burnt-out torch with last toggle at `L`, currently at tick `L + 20`
  (still within recovery)
- **WHEN** `saveReload()` runs at `L + 20`
- **THEN** immediately after `saveReload()` the torch is still burnt out and unlit
- **AND** at tick `L + 60` (after the full remaining window from `L`) the torch has
  recovered and is lit
- **AND** the torch was not lit at any tick strictly between `L + 20` and `L + 60`

### Requirement: burnout state survives single-chunk unload→reload
A `cycleChunk` over the chunk containing the torch MUST preserve the burnt-out
state and toggle history, and the recovery timing must continue correctly.

#### Scenario: burnt-out torch preserved across chunk cycle
- **GIVEN** a burnt-out torch in chunk `(cx, cz)` with last toggle at `L`, currently
  at tick `L + 20`
- **WHEN** `cycleChunk(cx, cz)` runs at `L + 20`
- **THEN** immediately after the cycle the torch is still burnt out and unlit
- **AND** at tick `L + 60` the torch has recovered and is lit

### Requirement: a healthy torch is unaffected by a round-trip
A torch that has never exceeded `BURNOUT_TOGGLE_LIMIT` MUST remain lit and
non-burnt-out across a save→reload and a chunk cycle; its sub-limit toggle history
MUST be preserved (so it does not spuriously burn out or prematurely recover).

#### Scenario: healthy torch preserved across a round-trip
- **GIVEN** a torch with 4 toggles recorded within `BURNOUT_WINDOW_TICKS`, currently
  lit
- **WHEN** `saveReload()` then `cycleChunk(cx, cz)` both run
- **THEN** after both operations the torch is lit and `isBurnedOut` returns `false`
- **AND** the 4-tick toggle history is unchanged

## Error and failure behavior

- A round-trip that loses the toggle history (so a burnt-out torch recovers early)
  or that flips a burnt-out torch to lit is a failure.
- A round-trip that resets a healthy torch's history is a failure only if it
  changes the torch's observable lit/burnt-out behavior; the sub-limit history is
  asserted to be preserved.

## Performance and resource bounds

- Each torch-burnout scenario runs under a bounded `maxSteps` budget on the order
  of `2 × BURNOUT_RECOVERY_TICKS` ticks (a couple of hundred); no unbounded
  stepping. The tracker's pruning keeps memory bounded by `BURNOUT_TOGGLE_LIMIT`
  per torch.

## Compatibility and migration

Test-only; the circuit uses the real 158 `TorchBurnoutTracker` and the 047 queue.
The toggle history is serialized by the harness into `AutomationStateSnapshot`
(`burnoutToggles`); no production format changes; no migration.

## Security and integrity

No external input surface beyond the round-trip payloads handled by the
`automation-harness` spec's atomic-rejection contract.

## Observability

- `isBurnedOut` at the boundary ticks and the lit/unlit probe localize whether a
  failure is the strict-exceeds rule, an early recovery, a lost history, or a
  timing shift.

## Verification mapping

- `tests/unit/RedstoneAutomationCircuits.test.ts`: `exactly the limit does not burn
  out`, `exceeding the limit burns out`, `stays unlit through the window then
  recovers`, `burnt-out torch survives save→reload`, `burnt-out torch survives
  chunk cycle`, `healthy torch unaffected by round-trip`.
