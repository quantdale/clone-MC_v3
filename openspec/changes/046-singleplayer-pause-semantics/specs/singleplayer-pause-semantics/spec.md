# Spec: singleplayer-pause-semantics

## Contract

Singleplayer simulation MUST pause explicitly and reason-based: the simulation clock is gated by a
`PauseManager` that pauses while any active reason exists. `pause(reason)`/`resume(reason)` MUST be
idempotent; `isPaused` MUST be true while the active-reason set is non-empty; listeners MUST fire only
on paused-state transitions; `resumeAll()` MUST clear all reasons.

## Definitions

- **PauseReason**: a named source of pausing (e.g. `menu-open`, `pointer-lock-lost`, `window-blur`,
  `auto-pause`).
- **Paused**: the active-reason set is non-empty; simulation advancement is gated off.

## Invariants

- `pause(reason)` adds; `resume(reason)` removes; both idempotent.
- `isPaused === activeReasons.size > 0`.
- Listeners fire only when `isPaused` changes; `onChange` returns an unsubscribe.
- `resumeAll()` empties the set; `reasons` reflects the active set in insertion order.

## Requirements

### Requirement: single-reason pause/resume
`pause(reason)` MUST pause the simulation; `resume(reason)` MUST unpause it when it was the only reason.

#### Scenario: menu open/close
- **GIVEN** a fresh `PauseManager`
- **WHEN** `pause('menu-open')` then `resume('menu-open')` run
- **THEN** `isPaused` is `true` after the pause and `false` after the resume.

### Requirement: multi-reason pause
The simulation MUST stay paused while any reason is active, resuming only when the last reason clears.

#### Scenario: overlapping reasons
- **GIVEN** `pause('menu-open')` then `pause('pointer-lock-lost')`
- **WHEN** `resume('menu-open')` runs, then `resume('pointer-lock-lost')`
- **THEN** `isPaused` is still `true` after the first resume and `false` after the second.

### Requirement: idempotency
`pause`/`resume` MUST be idempotent; resuming an unknown reason MUST be a no-op.

#### Scenario: repeated calls
- **GIVEN** a `PauseManager`
- **WHEN** `pause('x')` twice, then `resume('x')` twice, then `resume('never-paused')` run
- **THEN** `isPaused` ends `false`, `reasons` is empty, and no error is thrown.

### Requirement: change listeners
`onChange` MUST fire only when the paused state actually changes and MUST return an unsubscribe.

#### Scenario: notifications
- **GIVEN** a listener subscribed via `onChange`
- **WHEN** `pause('a')`, `pause('b')`, `resume('a')`, `resume('b')` run, then the listener is
  unsubscribed and `pause('c')` runs
- **THEN** the listener was called exactly twice (paused true, then false) and not after unsubscribe.

### Requirement: resumeAll
`resumeAll()` MUST clear every active reason.

#### Scenario: full resume
- **GIVEN** `pause('a')` and `pause('b')`
- **WHEN** `resumeAll()` runs
- **THEN** `isPaused` is `false` and `reasons` is empty.

## Error and failure behavior

- A listener that throws during notification does not break other listeners (defensive invocation).

## Performance and resource bounds

O(1) pause/resume; listener fan-out is O(listeners).

## Compatibility and migration

Additive; no consumers yet; no existing behavior changes.

## Security and integrity

Explicit reasons prevent accidental single-flag toggles from racing multiple pause sources.

## Observability

`reasons` and `isPaused` expose exactly why the simulation is frozen.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Single-reason pause/resume | pause → true; resume → false |
| Multi-reason pause | paused until last reason released |
| Idempotency | repeated pause/resume; unknown resume no-op |
| Change listeners | fires twice on transitions; unsubscribe works |
| resumeAll | clears all reasons |
