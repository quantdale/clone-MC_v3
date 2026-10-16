# Spec: redstone-torch

## Contract
This capability adds the redstone torch: the first *inverting* component (powered exactly when its
attachment block is not), its update delay, and burnout protection against self-driving feedback
loops. No facing/attachment-direction state, no `Game`/`World` wiring, no other logic components —
see the proposal's Non-goals.

## Definitions
- **Attachment powered**: whether the block a torch is attached to currently receives power; a
  caller-supplied boolean.
- **Lit**: the torch's boolean block state; while lit it emits full signal.
- **Toggle**: a recorded lit↔unlit transition.
- **Burnt out**: a torch whose recent toggle count exceeded the limit; it stays unlit until it
  recovers.

## Invariants
- `torchShouldBeLit(attachmentPowered)` is exactly `!attachmentPowered`, with no other condition
  folded in — burnout is applied by the caller on top, never silently inside.
- `torchSignalStrength(lit)` is `MAX_SIGNAL_STRENGTH` when lit and `MIN_SIGNAL_STRENGTH` otherwise.
- The tracker retains only toggles within `BURNOUT_WINDOW_TICKS` of the newest one, so per-torch
  memory is bounded regardless of runtime.
- Burnout begins when the retained toggle count is **strictly greater than**
  `BURNOUT_TOGGLE_LIMIT`, and persists until `BURNOUT_RECOVERY_TICKS` have passed since the last
  recorded toggle.

## Requirements

### Requirement: the torch block and its item are registered
`BlockRegistry` MUST register a `redstone_torch` carrying `LIT_SCHEMA` with a `lit: false` default;
`ItemTypeRegistry` MUST register a `redstone_torch` item placing it.

#### Scenario: the block carries its schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `redstone_torch` block is looked up
- **THEN** it exposes `LIT_SCHEMA` and a `defaultState` of `{ lit: false }`

#### Scenario: the item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `redstone_torch` item is looked up
- **THEN** its `placeBlock` resolves to the torch block and
  `validateItemBlockCrossReferences` passes

#### Scenario: the block enumerates exactly two states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the torch states are counted
- **THEN** there are exactly 2, and the default reports `lit` false

### Requirement: a torch inverts its attachment power
`torchShouldBeLit` MUST return `true` when the attachment is unpowered and `false` when it is
powered.

#### Scenario: an unpowered attachment lights the torch
- **GIVEN** `attachmentPowered` of `false`
- **WHEN** `torchShouldBeLit` is called
- **THEN** it returns `true`

#### Scenario: a powered attachment extinguishes the torch
- **GIVEN** `attachmentPowered` of `true`
- **WHEN** `torchShouldBeLit` is called
- **THEN** it returns `false`

### Requirement: a lit torch emits full signal
`torchSignalStrength` MUST return `MAX_SIGNAL_STRENGTH` when lit and `MIN_SIGNAL_STRENGTH`
otherwise.

#### Scenario: lit and unlit emission
- **GIVEN** both lit states
- **WHEN** `torchSignalStrength` is called for each
- **THEN** they return `MAX_SIGNAL_STRENGTH` and `MIN_SIGNAL_STRENGTH` respectively

### Requirement: torch updates are delayed and deterministically ordered
`scheduleTorchUpdate` MUST schedule the update `TORCH_UPDATE_DELAY_TICKS` after the current tick,
and `dueTorchUpdates` MUST return exactly the entries due at or before `nowTick` in deterministic
order.

#### Scenario: an update is not due early
- **GIVEN** a torch update scheduled at tick `0`
- **WHEN** the queue is drained at `TORCH_UPDATE_DELAY_TICKS - 1`
- **THEN** nothing is returned

#### Scenario: an update fires at its tick
- **GIVEN** the same update
- **WHEN** the queue is drained at `TORCH_UPDATE_DELAY_TICKS`
- **THEN** exactly that position is returned

#### Scenario: same-tick updates are deterministically ordered
- **GIVEN** two torches scheduled for the same update tick
- **WHEN** the queue is drained at that tick
- **THEN** both are returned in scheduling order, and repeating the scenario yields the identical
  order

### Requirement: rapid toggling burns a torch out
`isBurnedOut` MUST become `true` once a torch retained toggle count exceeds
`BURNOUT_TOGGLE_LIMIT` within `BURNOUT_WINDOW_TICKS`, and MUST remain `false` at or below that
limit.

#### Scenario: toggling past the limit burns out
- **GIVEN** a torch toggled `BURNOUT_TOGGLE_LIMIT + 1` times on consecutive ticks
- **WHEN** `isBurnedOut` is queried at the last toggle tick
- **THEN** it returns `true`

#### Scenario: toggling at the limit does not burn out
- **GIVEN** a torch toggled exactly `BURNOUT_TOGGLE_LIMIT` times on consecutive ticks
- **WHEN** `isBurnedOut` is queried
- **THEN** it returns `false`

#### Scenario: the same toggles spread beyond the window do not burn out
- **GIVEN** `BURNOUT_TOGGLE_LIMIT + 1` toggles spaced more than `BURNOUT_WINDOW_TICKS` apart
- **WHEN** `isBurnedOut` is queried after the last
- **THEN** it returns `false`, because only recent toggles are retained

### Requirement: a burnt-out torch recovers only after quiet time
A burnt-out torch MUST stay burnt out until `BURNOUT_RECOVERY_TICKS` have passed since its last
recorded toggle, and recording another toggle while burnt out MUST extend it.

#### Scenario: still burnt out during recovery
- **GIVEN** a burnt-out torch
- **WHEN** `isBurnedOut` is queried before `BURNOUT_RECOVERY_TICKS` have elapsed
- **THEN** it returns `true`

#### Scenario: recovered after the quiet period
- **GIVEN** the same torch with no further toggles
- **WHEN** `isBurnedOut` is queried after `BURNOUT_RECOVERY_TICKS` have elapsed
- **THEN** it returns `false`

#### Scenario: continued toggling extends the burnout
- **GIVEN** a burnt-out torch that records another toggle partway through recovery
- **WHEN** `isBurnedOut` is queried at the point it would otherwise have recovered
- **THEN** it returns `true`

### Requirement: burnout state is per torch
Tracking one torch toggles MUST NOT affect another.

#### Scenario: a second torch is unaffected
- **GIVEN** one torch driven into burnout
- **WHEN** a different torch id is queried
- **THEN** it is not burnt out

### Requirement: torchStateProperties projects the lit flag
`torchStateProperties(lit)` MUST return exactly `{ lit }`, matching `LIT_SCHEMA`.

#### Scenario: the projection matches the schema
- **GIVEN** either boolean
- **WHEN** `torchStateProperties` is called
- **THEN** the record only key is `lit`, and its value is legal for the schema

## Error and failure behavior
- No function throws for well-formed inputs; a non-finite tick is treated as `0`.

## Performance and resource bounds
- O(1) amortised per operation; per-torch memory bounded by `BURNOUT_TOGGLE_LIMIT` retained ticks.
  2 new block states.

## Compatibility and migration
- One additive block id and one additive item id; one new simulation file; the documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted input surface.

## Observability
- `toggleCount(id, tick)` exposes the live toggle window for diagnosing a suspected loop.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration + 2 states | `tests/unit/RedstoneTorch.test.ts` registration cases |
| REQ-2 inversion | inversion cases |
| REQ-3 signal strength | signal case |
| REQ-4 delay + ordering | scheduling cases |
| REQ-5 burnout threshold | burnout cases |
| REQ-6 recovery | recovery cases |
| REQ-7 per-torch isolation | isolation case |
| REQ-8 state projection | projection case |
