# Spec: reconnect-session

## Contract

The server-side session-epoch tracker that governs clean disconnect/reconnect: it issues a new
monotonically increasing `SessionEpoch` per connect, detects reconnects, ends sessions on
disconnect, rejects any message tagged with a stale (previous-session) epoch, and keeps a
bounded epoch history. It provides the duplicate/replay, stale-state, and
mid-transaction-disconnect protection that every sub-protocol (227/230/231) relies on.

## Definitions

- **Profile**: a non-empty string identifying one client connection identity.
- **Session Epoch**: a non-negative safe integer that uniquely identifies one connection session
  for a profile. It is strictly increasing across connects for the same profile.
- **Active Session**: the current session for a profile, which exists after `connect` and is
  removed by `disconnect`. Only the active session's epoch is current.
- **Reconnect**: a `connect` for a profile that already has a prior epoch.
- **Stale Message**: any message tagged with an epoch that is not the active session's epoch.

## Invariants

- **Epoch Monotonicity**: Each `connect` for a profile returns a strictly greater epoch than
  every prior connect for that profile; the first connect returns epoch `1`.
- **Active-Session Uniqueness**: At most one active session exists per profile.
- **Current-Only Rule**: `isSessionCurrent(profile, epoch)` is true iff the profile has an
  active session AND `epoch` equals that session's epoch.
- **Reconnect Rule**: A `connect` returns `isReconnect: true` iff the profile has any prior
  epoch, and it immediately makes all prior epochs stale.

## Requirements

### Requirement: REQ-1 Session Epoch Issuance on Connect

The `ReconnectStateManager` SHALL issue a fresh, strictly increasing `SessionEpoch` for each
`connect(profile)` and report whether the connect is a reconnect.

#### Scenario: First connect issues epoch 1
- **GIVEN** a `ReconnectStateManager` with no prior activity for profile `"alice"`.
- **WHEN** `connect("alice")` is called.
- **THEN** the result MUST be `{ epoch: 1, isReconnect: false }`.

#### Scenario: Reconnect while active issues an incremented epoch
- **GIVEN** `connect("alice")` returned epoch 1.
- **WHEN** `connect("alice")` is called again while the first session is still active.
- **THEN** the result MUST be `{ epoch: 2, isReconnect: true }`.

#### Scenario: Connect after a clean disconnect issues an incremented epoch
- **GIVEN** `connect("alice")` then `disconnect("alice")`.
- **WHEN** `connect("alice")` is called.
- **THEN** the result MUST be `{ epoch: 2, isReconnect: true }`.

#### Scenario: Empty or whitespace profile is rejected
- **GIVEN** a `ReconnectStateManager`.
- **WHEN** `connect("")` or `connect("   ")` is called.
- **THEN** it MUST throw an error matching `Reconnect:` and no session MUST be created.

---

### Requirement: REQ-2 Active-Session Tracking and Disconnect

The `ReconnectStateManager` SHALL track the active session per profile, end it on
`disconnect(profile)`, and reject invalid disconnect transitions.

#### Scenario: Disconnect ends the active session
- **GIVEN** `connect("alice")` returned epoch 1.
- **WHEN** `disconnect("alice")` is called.
- **THEN** `hasActiveSession("alice")` MUST return false and `currentEpoch("alice")` MUST return null.

#### Scenario: Disconnect with no active session throws
- **GIVEN** a `ReconnectStateManager` with no active session for `"bob"`.
- **WHEN** `disconnect("bob")` is called.
- **THEN** it MUST throw an error matching `Reconnect: profile has no active session`.

#### Scenario: Double disconnect throws
- **GIVEN** `connect("alice")` followed by `disconnect("alice")`.
- **WHEN** `disconnect("alice")` is called a second time.
- **THEN** it MUST throw an error matching `Reconnect: profile has no active session`.

---

### Requirement: REQ-3 Stale-Session Rejection

The `ReconnectStateManager` SHALL reject any epoch that is not the active session's current
epoch via `isSessionCurrent(profile, epoch)`, covering replay of previous-session messages and
all traffic after disconnect.

#### Scenario: Current epoch is accepted
- **GIVEN** `connect("alice")` returned epoch 1 and the session is still active.
- **WHEN** `isSessionCurrent("alice", 1)` is called.
- **THEN** it MUST return true.

#### Scenario: Previous-session epoch is rejected
- **GIVEN** `connect("alice")` returned epoch 1, then `connect("alice")` returned epoch 2 (reconnect).
- **WHEN** `isSessionCurrent("alice", 1)` is called.
- **THEN** it MUST return false.

#### Scenario: All epochs are rejected after disconnect
- **GIVEN** `connect("alice")` then `disconnect("alice")`.
- **WHEN** `isSessionCurrent("alice", 1)` is called.
- **THEN** it MUST return false.

#### Scenario: Unknown profile is rejected
- **GIVEN** a `ReconnectStateManager` that never saw profile `"carol"`.
- **WHEN** `isSessionCurrent("carol", 1)` is called.
- **THEN** it MUST return false.

---

### Requirement: REQ-4 Bounded Epoch History

The `ReconnectStateManager` SHALL record connect and disconnect transitions in a bounded,
oldest-first log whose size does not exceed `historyLimit` (default 32).

#### Scenario: History records connect and disconnect transitions
- **GIVEN** `connect("alice")` then `disconnect("alice")` then `connect("alice")`.
- **WHEN** the `history` getter is read.
- **THEN** it MUST contain three records, oldest first, with kinds `connect`, `disconnect`, `connect`.

#### Scenario: History is bounded
- **GIVEN** a manager constructed with `historyLimit: 2`.
- **WHEN** three transitions are recorded.
- **THEN** the `history` length MUST be 2 and the oldest record MUST have been dropped.

#### Scenario: Invalid historyLimit is rejected at construction
- **GIVEN** a manager constructed with `historyLimit: 0` or a non-integer.
- **THEN** construction MUST throw an error matching `Reconnect: historyLimit must be a positive integer`.

---

### Requirement: REQ-5 Mid-Transaction Disconnect Invalidation

A reconnect MUST immediately invalidate the prior session's in-flight sub-protocol state so any
late message from that session is rejected, including messages that were mid-transaction
(e.g. an active inventory drag, pending movement intents, or pending block predictions).

#### Scenario: Late inventory transaction from the old session is rejected after reconnect
- **GIVEN** `connect("alice")` returned epoch 1 and an inventory drag was mid-flight (started but
  not ended) under that session.
- **WHEN** the client disconnects, reconnects (`connect("alice")` returns epoch 2), and a `drag
  end` transaction tagged with epoch 1 is received.
- **THEN** `isSessionCurrent("alice", 1)` MUST return false and the transaction MUST be rejected.

#### Scenario: Pending movement intent from the old session cannot be applied after reconnect
- **GIVEN** `connect("alice")` returned epoch 1 with a pending movement intent.
- **WHEN** the client reconnects (epoch 2) and the server rechecks the old epoch.
- **THEN** `isSessionCurrent("alice", 1)` MUST return false, so the intent is discarded.

---

## Error and failure behavior

- Empty/whitespace profile on `connect`/`disconnect`/`isSessionCurrent` → descriptive
  `Reconnect:` throw; no mutation.
- `disconnect` with no active session → `Reconnect: profile has no active session`.
- Construction with invalid `historyLimit` → throw before the manager is usable.

## Performance and resource bounds

- `connect`/`disconnect`/`isSessionCurrent`/`hasActiveSession`/`currentEpoch`: O(1).
- History log bounded by `historyLimit`; oldest records are dropped, so memory is constant.

## Compatibility and migration

- Pure additive module in `src/simulation/ReconnectStateRecovery.ts`. No wire-format, registry,
  or save changes. Composes with `ConnectionLifecycle` (225): a fresh `connect()` after
  `disconnected` maps to `ReconnectStateManager.connect`.

## Security and integrity

- All numeric inputs (epoch) are validated as non-negative safe integers; all profile strings are
  non-empty. Stale/replayed epochs are rejected before reaching any sub-protocol validator.

## Observability

- `hasActiveSession(profile)`, `currentEpoch(profile)`, `epochCount`, and the bounded `history`
  log for auditing connect/disconnect/reconnect transitions.

## Verification mapping

- Tests in `tests/unit/ReconnectStateRecovery.test.ts` verify every scenario above; the stale
  sub-protocol rejection scenarios are covered by unit tests on `isSessionCurrent` plus an
  integration scenario driving a mid-drag inventory transaction against the old epoch.
