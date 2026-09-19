# Spec: live-raid-feedback

## Contract

This change makes the existing deterministic raid lifecycle player-visible as
an ephemeral HUD feedback bar. It does not claim that raider mobs, villages, or
bad-omen acquisition exist.

## Definitions

- **Active raid:** a `RaidState` whose status is `ACTIVE`.
- **Feedback bar:** the single DOM element `#raid-feedback`, including its
  title, detail, fill, `data-status`, and accessible live label.
- **Started raid:** the state returned after `startRaid` plus one `tickRaid`, so
  `waveIndex >= 1` and a current deterministic wave exists.
- **Clear wave:** record exactly one death for each current remaining raider,
  then apply one `tickRaid` transition.

## Invariants

1. `RaidStateMachine` remains authoritative; Game never edits counters by
   arithmetic other than calling its exported transition functions.
2. Feedback progress is finite and clamped to `[0,1]` for every input.
3. There is no raid persistence, archive row, new entity, new input container,
   or second feedback bar.
4. Pause and dispose are lifecycle boundaries: paused ticks do not advance raid
   state and disposed state is not rendered or resurrected.

## Requirements

### Requirement: Project raid state into bounded accessible feedback

`projectRaidFeedback` MUST be total for `null` and every valid `RaidState`, MUST
hide null/`INACTIVE`, MUST expose active wave/total/remaining values, and MUST
clamp finite progress to `[0,1]`.

#### Scenario: Active state shows current wave and remaining count

- **GIVEN** an active state at wave 2 of 3 with 4 remaining raiders
- **WHEN** the projection is computed
- **THEN** it is visible with status `ACTIVE`, detail `Wave 2/3 · 4 raiders remaining`, and progress `2/3`
- **AND** its label identifies the raid as active.

#### Scenario: Null and terminal-free state hide safely

- **GIVEN** `null` or an `INACTIVE` state
- **WHEN** the projection is computed
- **THEN** it is hidden, has empty detail, and progress `0`
- **AND** no exception is thrown.

### Requirement: Game owns one deterministic ephemeral raid

`Game` MUST start exactly one replacement state at the player's finite
position, apply the first `tickRaid`, and expose a read-only inspection seam.
Starting twice MUST replace the prior active or terminal state atomically.

#### Scenario: Start creates the first wave and replay replaces terminal state

- **GIVEN** no raid, then a completed terminal raid
- **WHEN** `debugStartRaid(1)` is called in each case
- **THEN** the returned state is `ACTIVE` with `waveIndex === 1` and positive remaining count
- **AND** the second start has fresh `ticks`/wave state and the bar is active.

#### Scenario: Omen boundary is fail-closed through the existing machine

- **GIVEN** a negative, fractional, `NaN`, or infinite omen argument
- **WHEN** `debugStartRaid` is called
- **THEN** it does not throw, produces the existing non-negative bounded wave contract, and never stores a non-finite counter.

### Requirement: Fixed-tick and clear transitions remain bounded

An active raid MUST receive exactly one `tickRaid` per unpaused fixed tick.
`debugClearRaidWave` MUST clear only the current wave and apply one tick; it
MUST NOT loop across future waves or use wall-clock time.

#### Scenario: Pause freezes the raid

- **GIVEN** an active raid and a captured state
- **WHEN** the Game is paused for any number of render frames
- **THEN** the raid state and feedback values remain unchanged
- **AND** resuming permits one normal fixed-tick transition.

#### Scenario: Clearing a wave advances once

- **GIVEN** an active wave with 3 remaining raiders
- **WHEN** `debugClearRaidWave` is called
- **THEN** the current count reaches zero before one `tickRaid` transition
- **AND** the result is the next wave or `VICTORY`, never a skipped intermediate wave.

### Requirement: DOM feedback has one accessible lifecycle

The live Game MUST update one `#raid-feedback` element with title, detail,
`data-status`, `aria-label`, live announcement semantics, and a fill width
matching the pure projection. It MUST be hidden for null and after dispose.

#### Scenario: Active, victory, and defeat states are rendered

- **GIVEN** the browser Game starts, clears waves, or reaches timeout
- **WHEN** the feedback state changes
- **THEN** the same element updates its status/title/detail/fill without adding a second element
- **AND** active and terminal text remains accessible through its label.

#### Scenario: Dispose does not leave a stale visible bar

- **GIVEN** a visible active or terminal feedback bar
- **WHEN** Game disposal occurs
- **THEN** the element is hidden and later frames cannot rewrite it.

### Requirement: Existing systems and persistence remain unchanged

The change MUST NOT add a persistence namespace/field, archive row, raider
entity, village detector, or headed/GPU path, and existing wither/HUD/container
flows MUST remain green.

#### Scenario: Reload has no raid resurrection

- **GIVEN** an active raid is visible
- **WHEN** pagehide and reload complete
- **THEN** no raid feedback is visible and `getRaidState()` is null
- **AND** no raid record is read or written.

## Error and failure behavior

Invalid omen input is delegated to the already verified `startRaid` clamp. Null
debug transitions return null. Missing feedback DOM is presentation-only no-op;
it never crashes or changes the state machine. Terminal transitions are
idempotent and replay replaces them.

## Performance and resource bounds

The live path performs one O(1) state transition and bounded DOM writes per
active fixed tick. It adds no entity iteration, timer, worker, texture, or
unbounded loop.

## Compatibility and migration

No stored data or migration exists. Existing saves, reset, archive, and visual
baselines remain compatible because the new element is hidden at boot.

## Security and integrity

The DOM receives generated text through `textContent` and attributes, never
HTML interpolation. Debug seams are exposed only through the existing
development/E2E `__voxelGame` handle.

## Observability

`getRaidState()` and `#raid-feedback[data-status]` are deterministic test
observables. The bar uses `aria-live="polite"` and an explicit label.

## Verification mapping

| Requirement | Evidence |
|---|---|
| Projection bounds/labels | `tests/unit/RaidFeedbackView.test.ts` |
| Game ownership/replay/invalid input | `tests/unit/LiveRaidFeedback.test.ts`, `tests/e2e/raid-feedback.spec.ts` |
| Fixed tick/pause/clear | `tests/unit/LiveRaidFeedback.test.ts` and browser active journey |
| DOM accessibility/terminal states | `tests/e2e/raid-feedback.spec.ts` |
| No resurrection/compatibility | reload/refusal browser journey, existing full unit/build/E2E gates |
