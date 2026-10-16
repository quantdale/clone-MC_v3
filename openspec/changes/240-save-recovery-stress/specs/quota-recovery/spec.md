# Spec: quota-recovery

## Contract

The save layer MUST detect, classify, and recover from storage quota exhaustion and private-mode/blocked
storage with a user-safe write policy, and MUST prove that recovery under stress. A `StorageHealthMonitor`
probe that fails MUST classify the failure (`quota` / `private-mode` / `unavailable` / `unknown`), track
`ok → degraded → failed` from consecutive outcomes, gate writes via `canWrite()` (false exactly when
`failed`), pause the autosave write path when writes are gated, and recover to `ok` when a later probe
succeeds. The matrix MUST inject quota/private-mode repository failures via `withStorageFailure` and
assert the full transition, gating, pause, and recovery cycle.

## Definitions

- **Probe failure**: a `StorageProbe.probe()` rejection, classified by `classifyStorageError`.
- **Consecutive failures**: failures between two successful probes.
- **Quota injection**: `withStorageFailure(deps, 'quota')` makes repository writes reject with an error
  that `classifyStorageError` maps to `quota`; likewise `'private-mode'` → `SecurityError`/code 18.
- **Write gate**: `StorageHealthMonitor.canWrite()`, false only when status is `failed`.

## Invariants

- 0 consecutive failures → `ok`; exactly 1 → `degraded`; ≥2 → `failed`.
- `canWrite()` is false exactly when status is `failed`.
- A successful probe resets consecutive failures to 0 and clears `lastFailure`.
- When `canWrite()` is false, the autosave path performs no repository writes.
- Listeners fire only on status change; `reset()` restores `ok`.

## Requirements

### Requirement: failures classify by kind
`classifyStorageError` MUST map `QuotaExceededError`/code 22 → `quota`, `SecurityError`/code 18 →
`private-mode`, `UnknownError`/`InvalidStateError` → `unavailable`, and anything else → `unknown`; the
matrix MUST inject quota and private-mode failures and observe the correct kinds.

#### Scenario: injected failures classify
- **GIVEN** a matrix that injects a `quota` failure and a `private-mode` failure via `withStorageFailure`
- **WHEN** the injected writes reject and are classified
- **THEN** the kinds are `quota` and `private-mode` respectively.

### Requirement: status transitions and recovery
A probe that fails once, then fails again, then succeeds MUST produce status `degraded`, then `failed`,
then `ok` (with `lastFailure` null on recovery).

#### Scenario: degrade → fail → recover
- **GIVEN** a quota-injected probe failing on its first two runs and succeeding on the third
- **WHEN** `check()` runs three times
- **THEN** status is `degraded` (first), `failed` (second), and `ok` with `lastFailure` null (third).

### Requirement: user-safe write gate
`canWrite()` MUST be `true` in `ok`/`degraded` and `false` in `failed`, and the autosave write path MUST
perform no writes while `canWrite()` is `false`.

#### Scenario: gate blocks writes when failed
- **GIVEN** a monitor that reaches `failed` and a coordinator draining pending units
- **WHEN** the drain runs while `canWrite()` is false
- **THEN** no repository write occurs, and all units remain pending (not dropped).

### Requirement: autosave pauses on failed and resumes on recovery
When storage becomes `failed`, the save layer MUST stop writing; after a successful probe restores `ok`,
the save layer MUST resume writing and persist previously pending units.

#### Scenario: paused then resumed
- **GIVEN** pending units, a monitor at `failed`, then a successful probe
- **WHEN** a drain runs before recovery (no writes) and a drain runs after recovery
- **THEN** the pre-recovery drain writes nothing and units stay pending, and the post-recovery drain
  persists them.

### Requirement: listeners and reset
`onStatusChange` MUST fire only on change, return an unsubscribe, and `reset()` MUST restore `ok` with no
`lastFailure`.

#### Scenario: change notifications and reset
- **GIVEN** a monitor with a listener transitioning `ok → degraded → failed → ok`
- **WHEN** the transitions occur, the listener is unsubscribed, and `reset()` is called
- **THEN** the listener fired on each change (not on no-change checks), unsubscribing stops delivery, and
  after `reset()` status is `ok` with `lastFailure` null.

## Error and failure behavior

- A probe failure is recorded with kind + message + timestamp; `check()` never throws.
- A probe cleanup (`__probe__` delete) failure is best-effort and swallowed in `finally`.
- Quota/private-mode injection must produce errors that `classifyStorageError` recognizes by name and by
  numeric code.

## Performance and resource bounds

One small probe round-trip per `check`; the matrix runs checks only on the autosave cadence, not per frame.
No hot-path impact.

## Compatibility and migration

No schema/API change; asserts 043's existing health/classification/gating contract and pauses writes at the
existing 039 coordinator boundary. No stored-data impact (probe record removed in all paths).

## Security and integrity

Classified, tracked failures prevent the save layer from hammering broken storage; gating and recovery
keep the game usable and loss-free when storage returns.

## Observability

`detail` cites each status transition, the classified failure kind, `canWrite()` at each step, and whether
the pre/post-recovery drains wrote units.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Failures classify by kind | injected quota/private-mode rejections map to the correct kinds |
| Status transitions and recovery | fail → fail → success yields degraded → failed → ok |
| User-safe write gate | canWrite true in ok/degraded, false in failed; failed drain writes nothing |
| Autosave pauses on failed and resumes on recovery | no writes while failed; pending units persisted after ok |
| Listeners and reset | fires on change only; unsubscribe; reset restores ok |
