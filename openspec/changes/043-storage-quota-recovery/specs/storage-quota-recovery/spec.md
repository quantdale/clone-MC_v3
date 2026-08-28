# Spec: storage-quota-recovery

## Contract

The game MUST be able to detect, classify, and recover from storage failures (quota exhaustion,
private mode, unavailable IndexedDB) with a user-safe policy. A `StorageHealthMonitor` MUST probe
storage on demand, track `ok | degraded | failed` status from consecutive probe outcomes, remember the
last failure, notify listeners on status changes, and recover to `ok` when a probe succeeds.
`classifyStorageError` MUST map known DOMException names/codes to `quota` / `private-mode` /
`unavailable`, else `unknown`. `createWorldStorageProbe` MUST exercise the five repositories with a
tiny reserved-key write/read/delete round-trip that is cleaned up in all paths.

## Definitions

- **StorageStatus**: `ok` | `degraded` | `failed`.
- **StorageFailureKind**: `quota` | `private-mode` | `unavailable` | `unknown`.
- **Probe**: an injected `probe(): Promise<void>` that throws when storage is unhealthy.
- **Consecutive failures**: failures between two successful probes.

## Invariants

- 0 consecutive failures → `ok`; exactly 1 → `degraded`; ≥2 → `failed`.
- A successful probe resets consecutive failures to 0 and clears `lastFailure`.
- `canWrite()` is false exactly when status is `failed`.
- Listeners fire only on status change; `onStatusChange` returns an unsubscribe function.
- The world probe leaves no `__probe__` record behind (deleted in `finally`).

## Requirements

### Requirement: failure classification
`classifyStorageError` MUST return `quota` for `QuotaExceededError`/code 22, `private-mode` for
`SecurityError`/code 18, `unavailable` for `UnknownError`/`InvalidStateError`, and `unknown` otherwise.

#### Scenario: known and unknown errors
- **GIVEN** errors with `name: 'QuotaExceededError'`, `{ name: 'SecurityError' }`, `{ code: 22 }`,
  `{ name: 'UnknownError' }`, and `{ message: 'x' }`
- **WHEN** classified
- **THEN** kinds are `quota`, `private-mode`, `quota`, `unavailable`, `unknown` respectively.

### Requirement: status transitions and recovery
`check()` MUST derive status from consecutive probe outcomes and recover on success.

#### Scenario: degrade then fail then recover
- **GIVEN** a probe that fails once, then fails again, then succeeds
- **WHEN** `check()` runs three times
- **THEN** status is `degraded` (with `lastFailure.kind` set), then `failed` with `canWrite()` false,
  then `ok` with `lastFailure` null.

### Requirement: user-safe write gate
`canWrite()` MUST be false exactly when status is `failed`.

#### Scenario: write gate
- **GIVEN** a monitor in `ok` and then `failed` states
- **WHEN** `canWrite()` is queried
- **THEN** it is `true` in `ok` and `false` in `failed`.

### Requirement: listeners and reset
`onStatusChange` MUST fire only on changes, return an unsubscribe, and `reset()` MUST restore the
initial state.

#### Scenario: change notifications
- **GIVEN** a monitor with a listener
- **WHEN** the status changes `ok → degraded → failed`, then the listener is unsubscribed and `reset()`
  is called
- **THEN** the listener was invoked on each change, not on no-change checks, and after `reset()` the
  status is `ok` with no `lastFailure`.

### Requirement: world storage probe
`createWorldStorageProbe` MUST open the five repositories, write/read/delete a `__probe__` metadata
record, and leave the stores clean.

#### Scenario: healthy probe
- **GIVEN** healthy in-memory-mock repositories
- **WHEN** `probe()` runs
- **THEN** it resolves and `listMetadata()` contains no `__probe__` record.

#### Scenario: failing probe classifies
- **GIVEN** a metadata repository whose writes reject (quota simulation)
- **WHEN** `probe()` runs and the monitor `check()`s
- **THEN** `probe()` rejects and the monitor reports the classified kind.

## Error and failure behavior

- Probe failures are classified and recorded with message + timestamp.
- Cleanup failure in the probe's `finally` is best-effort (swallowed).
- `check()` never throws; failures are reported via status/lastFailure.

## Performance and resource bounds

One small write/read/delete round-trip per `check`; intended on autosave ticks or explicit intervals,
not per frame.

## Compatibility and migration

No `WORLD_DB_VERSION` change; the probe record is removed in all paths, so no stored-data impact.

## Security and integrity

Classified, tracked failures prevent the save layer from hammering broken storage; recovery keeps the
game usable when storage returns.

## Observability

`status`, `lastFailure`, and change notifications are the health audit surface.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Failure classification | name/code matrix |
| Status transitions and recovery | fail → fail → success sequence |
| User-safe write gate | canWrite true in ok, false in failed |
| Listeners and reset | fires on change only; unsubscribe; reset restores ok |
| World storage probe | healthy probe leaves no __probe__ record; failing probe classifies |
