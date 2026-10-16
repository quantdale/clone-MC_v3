# Spec: connection-lifecycle

## Contract

A pure, headless connection lifecycle state machine: five explicit states
(`disconnected`, `connecting`, `handshaking`, `connected`, `disconnecting`), strictly
validated transitions, injectable timeouts evaluated on scripted wall time, a bounded
transition log, and full observability. No transport, no timers, no IO.

## Definitions

- **Active state**: `connecting`, `handshaking`, `connected`, or `disconnecting`.
- **Deadline**: the timestamp stored when a phase began (connect, handshake) or was last
  refreshed (keepalive).
- **Timeout expiry**: `nowMs - deadline >= timeoutMs` (inclusive boundary), evaluated only
  inside `update`.
- **Transition log**: bounded (default 32) oldest-first list of
  `{ at, from, to, reason? }` records appended on every state-changing transition.

## Invariants

- The machine is always in exactly one of the five states.
- A rejected transition changes nothing (no partial state).
- Timeouts never expire outside `update`, and `update` never acts on non-finite or backward
  timestamps.
- Every transition to `disconnected` carries an exact reason.
- `keepAliveCount` resets only at `connect()`; `history` drops oldest records beyond the
  limit.

## Requirements

### Requirement: construction and option validation

`new ConnectionLifecycle(options?)` MUST construct in the `disconnected` state with no
profile, no reason, zero keepalive count, and an empty history. Options MUST default to
`connectTimeoutMs: 10000`, `handshakeTimeoutMs: 10000`, `keepAliveTimeoutMs: 30000`,
`historyLimit: 32` and MUST reject non-finite or non-positive durations and non-positive
non-integer history limits with a descriptive `ConnectionLifecycle: <detail>` throw. A
rejected construction MUST NOT yield a partially usable machine.

#### Scenario: default construction
- **GIVEN** no arguments
- **WHEN** `new ConnectionLifecycle()` is evaluated
- **THEN** `state === 'disconnected'`, `profile === null`, `reason === null`,
  `keepAliveCount === 0`, `history` is empty

#### Scenario: invalid duration
- **GIVEN** `options.keepAliveTimeoutMs = -5`
- **WHEN** the machine is constructed
- **THEN** a `ConnectionLifecycle: ...` error is thrown

#### Scenario: invalid history limit
- **GIVEN** `options.historyLimit = 0`
- **WHEN** the machine is constructed
- **THEN** a `ConnectionLifecycle: ...` error is thrown

### Requirement: connect and handshake happy path

`connect(profile?)` MUST move `disconnected -> connecting`, arm the connect timeout, and set
the profile when a non-empty string is provided. `connected()` MUST move
`connecting -> handshaking` and arm the handshake timeout. `handshakeAccepted(profile?)`
MUST move `handshaking -> connected`, arm the keepalive timeout, and update the profile when
provided. Each transition MUST append a log record with the current scripted time (0 when no
`update` was fed yet).

#### Scenario: full happy path
- **GIVEN** a fresh machine, `update(1000)` fed
- **WHEN** `connect('alice')`, `connected()`, then `handshakeAccepted()` are called
- **THEN** `state === 'connected'`, `profile === 'alice'`, `keepAliveCount === 0`, and the
  history has three records whose `at` values are all 1000 and `from`/`to` chain
  disconnected→connecting→handshaking→connected

#### Scenario: profile updated at accept
- **GIVEN** a machine with `connect('alice')` and `connected()`
- **WHEN** `handshakeAccepted('bob')` is called
- **THEN** `state === 'connected'` and `profile === 'bob'`

### Requirement: transition validation

Each event MUST throw a descriptive `ConnectionLifecycle: <detail>` error when invoked from
a state that cannot perform it, and MUST NOT change state, profile, reason, keepalive count,
or history: `connect` only from `disconnected`; `connected` only from `connecting`;
`handshakeAccepted`/`handshakeRejected` only from `handshaking`; `keepAliveReceived` only
from `connected`; `disconnect` only from `connecting`/`handshaking`/`connected`;
`disconnectComplete` only from `disconnecting`; `remoteDisconnect` only from an active
state. Empty profile/reason strings MUST also be rejected.

#### Scenario: reconnect attempt while active
- **GIVEN** a machine in `connecting` (after `connect()`)
- **WHEN** `connect('alice')` is called
- **THEN** an error is thrown and `state` is still `connecting`

#### Scenario: keepalive before connected
- **GIVEN** a machine in `handshaking`
- **WHEN** `keepAliveReceived()` is called
- **THEN** an error is thrown and `keepAliveCount` is still 0

#### Scenario: handshake accept before handshake phase
- **GIVEN** a machine in `connecting`
- **WHEN** `handshakeAccepted()` is called
- **THEN** an error is thrown and `state` is still `connecting`

#### Scenario: empty reason and profile rejected
- **GIVEN** a machine in `handshaking`
- **WHEN** `handshakeRejected('')` is called
- **THEN** an error is thrown and `state` is still `handshaking`

### Requirement: disconnect paths

`disconnect()` MUST move `connecting`/`handshaking`/`connected -> disconnecting` with reason
`local disconnect`. `disconnectComplete()` MUST move `disconnecting -> disconnected` with
reason `disconnected`. `remoteDisconnect(reason)` MUST move any active state to
`disconnected` recording the given non-empty reason. After a disconnect the machine MUST
accept a new `connect()`.

#### Scenario: graceful disconnect
- **GIVEN** a connected machine
- **WHEN** `disconnect()` then `disconnectComplete()` are called
- **THEN** the intermediate state is `disconnecting`; finally `state === 'disconnected'`
  and `reason === 'disconnected'`

#### Scenario: remote disconnect mid-handshake
- **GIVEN** a machine in `handshaking`
- **WHEN** `remoteDisconnect('server shutdown')` is called
- **THEN** `state === 'disconnected'` and `reason === 'server shutdown'`

#### Scenario: reconnect after disconnect
- **GIVEN** the machine from the previous scenario
- **WHEN** `connect('alice')` is called
- **THEN** `state === 'connecting'` again and `keepAliveCount === 0`

### Requirement: keepalive

`keepAliveReceived()` MUST be valid only in `connected`, MUST increment `keepAliveCount`,
and MUST refresh the keepalive deadline so a previously-failing timeout no longer expires.

#### Scenario: keepalive refreshes the deadline
- **GIVEN** a connected machine with `keepAliveTimeoutMs: 100`, `update(1000)` fed, and
  `keepAliveReceived()` at 1000
- **WHEN** `update(1099)` then `update(1100)` are called
- **THEN** the first update keeps `state === 'connected'`; the second moves to
  `disconnected` with reason `keepalive timeout`

### Requirement: timeout expiry

`update(nowMs)` MUST expire `connecting` after `connectTimeoutMs` (reason `connect
timeout`), `handshaking` after `handshakeTimeoutMs` (reason `handshake timeout`), and
`connected` after `keepAliveTimeoutMs` since the last keepalive (reason `keepalive
timeout`), using the inclusive `>=` boundary. It MUST be a no-op for non-finite or backward
timestamps and MUST NOT expire timeouts while `disconnected`/`disconnecting`.

#### Scenario: connect timeout
- **GIVEN** a machine with `connectTimeoutMs: 100` after `connect()` and `update(1000)`
- **WHEN** `update(1100)` is called
- **THEN** `state === 'disconnected'` and `reason === 'connect timeout'`

#### Scenario: handshake timeout
- **GIVEN** a machine with `handshakeTimeoutMs: 100` after `connect()`, `connected()`, and
  `update(1000)`
- **WHEN** `update(1100)` is called
- **THEN** `state === 'disconnected'` and `reason === 'handshake timeout'`

#### Scenario: keepalive timeout boundary
- **GIVEN** a connected machine with `keepAliveTimeoutMs: 100` after `update(1000)`
- **WHEN** `update(1100)` is called
- **THEN** `state === 'disconnected'` and `reason === 'keepalive timeout'` (the `>=`
  boundary expires exactly at the deadline)

#### Scenario: backward time is inert
- **GIVEN** a connected machine with `keepAliveTimeoutMs: 100` after `update(1000)`
- **WHEN** `update(900)` is called
- **THEN** `state === 'connected'` and no history record was appended

### Requirement: reset and history

`reset()` MUST restore the pristine disconnected state: `disconnected`, null profile/reason,
zero keepalive count, empty history. The transition log MUST drop the oldest record when it
exceeds `historyLimit` and `history` MUST return a snapshot (mutating the returned array MUST
NOT affect the machine).

#### Scenario: reset
- **GIVEN** a connected machine with profile and keepalives
- **WHEN** `reset()` is called
- **THEN** the machine matches the pristine default-construction state

#### Scenario: bounded history
- **GIVEN** a machine with `historyLimit: 3`
- **WHEN** `connect()`, `connected()`, `handshakeAccepted()`, `disconnect()`, and
  `disconnectComplete()` are called
- **THEN** `history` has exactly 3 records and the oldest is `handshaking -> connected`
  (the two earliest records were dropped)

#### Scenario: history is a snapshot
- **GIVEN** a machine with at least one record
- **WHEN** the array returned by `history` is mutated (e.g. `pop()`)
- **THEN** a subsequent `history` read still contains the original record

## Error and failure behavior

- Construction: `ConnectionLifecycle: <detail>` naming the invalid option field.
- Events: `ConnectionLifecycle: cannot <event> from <state>` for wrong-state calls;
  `ConnectionLifecycle: <field> must be a non-empty string` for empty profile/reason.
  Failed events change nothing.
- `update`: non-finite/backward timestamps are silently inert.

## Performance and resource bounds

- Every event and `update` is O(1) besides a bounded log append; memory is
  O(historyLimit). No timers, IO, DOM, or network.

## Compatibility and migration

Additive: new exported names only; no existing API, registry, save format, or state
changes. Transitions driven before any `update` record `at: 0`; timeouts only begin once
timestamps are fed.

## Security and integrity

- No external inputs besides strings and numbers; no storage or network access.
- Integrity: rejected transitions cannot corrupt machine state; timeouts are monotonic and
  never fire on backward time.

## Observability

- `state`, `reason`, `profile`, `keepAliveCount`, `history` — complete passive observation
  without logging or callbacks.

## Verification mapping

| Requirement | Evidence |
|---|---|
| REQ construction and option validation | `tests/unit/ConnectionLifecycle.test.ts` › construction |
| REQ connect and handshake happy path | › happy path |
| REQ transition validation | › validation |
| REQ disconnect paths | › disconnects |
| REQ keepalive | › keepalive |
| REQ timeout expiry | › timeouts |
| REQ reset and history | › reset/history |
