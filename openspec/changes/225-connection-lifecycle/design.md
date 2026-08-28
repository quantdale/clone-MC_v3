# Design: 225-connection-lifecycle

## Context/current state

- 223 added `NetworkProtocol` codecs (wire envelope, versioning, compatibility) — no
  connection concept.
- 224 added `WorldTickProcess` — the production headless tick driver; nothing models
  client/server lifecycle.
- No existing connection/auth/keepalive code in the repository (headless mode is a
  webdriver sniff in `Game.ts`, unrelated to a network connection).

## Target state

A pure headless connection lifecycle state machine (`ConnectionLifecycle`) with five explicit
states, strict validated transitions, injectable timeouts evaluated on scripted wall time,
a bounded transition log, and full determinism. It is the model 226+ will drive and extend.

## Invariants

- The machine is always in exactly one of the five states.
- `connect()` is valid only from `disconnected`; `connected()` only from `connecting`;
  `handshakeAccepted()`/`handshakeRejected()` only from `handshaking`;
  `keepAliveReceived()` only from `connected`; `disconnect()` only from
  `connecting`/`handshaking`/`connected`; `disconnectComplete()` only from `disconnecting`;
  `remoteDisconnect()` valid from `connecting`/`handshaking`/`connected`/`disconnecting`.
- A transition leaves no partial state: either the whole transition applies (new state,
  reason/profile/history updated) or a descriptive error is thrown and nothing changes.
- Timeouts are evaluated only by `update(nowMs)` with finite, non-decreasing timestamps;
  non-finite or backward timestamps are a no-op.
- A timeout expires when `nowMs - deadline >= timeoutMs` (inclusive boundary).
- Every disconnect (timeout, remote, or completed graceful) records an exact reason and is
  observable via `state`/`reason`/`history`.
- `reset()` returns the machine to the pristine disconnected state (all counters zeroed,
  log cleared).

## API and data model

```ts
// src/simulation/ConnectionLifecycle.ts
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'handshaking'
  | 'connected'
  | 'disconnecting';

export interface ConnectionLifecycleOptions {
  /** Connect phase timeout ms (default 10000). */
  readonly connectTimeoutMs?: number;
  /** Handshake phase timeout ms (default 10000). */
  readonly handshakeTimeoutMs?: number;
  /** Keepalive timeout ms while connected (default 30000). */
  readonly keepAliveTimeoutMs?: number;
  /** Bounded transition-log size (default 32, oldest dropped). */
  readonly historyLimit?: number;
}

export interface TransitionRecord {
  readonly at: number;      // scripted ms when the transition applied
  readonly from: ConnectionState;
  readonly to: ConnectionState;
  readonly reason?: string; // e.g. 'keepalive timeout', remote/local reason
}

export class ConnectionLifecycle {
  constructor(options?: ConnectionLifecycleOptions); // throws ConnectionLifecycle: <detail>

  connect(profile?: string): void;        // disconnected -> connecting
  connected(): void;                      // connecting -> handshaking
  handshakeAccepted(profile?: string): void; // handshaking -> connected
  handshakeRejected(reason: string): void;   // handshaking -> disconnected
  keepAliveReceived(): void;              // connected -> connected (refresh deadline)
  disconnect(): void;                     // connecting/handshaking/connected -> disconnecting
  disconnectComplete(): void;             // disconnecting -> disconnected ('disconnected')
  remoteDisconnect(reason: string): void; // -> disconnected (any active state)
  update(nowMs: number): void;            // evaluate timeouts (finite, monotonic)
  reset(): void;                          // pristine disconnected state

  get state(): ConnectionState;
  get reason(): string | null;            // reason of the last disconnect, if any
  get profile(): string | null;           // active profile label (connect/accept arg)
  get keepAliveCount(): number;           // keepalives received since last connect
  get history(): readonly TransitionRecord[]; // bounded snapshot, oldest first
}
```

Internal state: `{ state, profile, reason, keepAliveCount, history: TransitionRecord[],
connectAt, handshakeAt, lastKeepAliveAt, lastNow, options }`.

## Control/data flow

```
connect()      disconnected  -> connecting        (connectAt = lastNow; connect timeout armed)
connected()    connecting    -> handshaking       (handshakeAt = lastNow; handshake timeout armed)
handshakeAccepted() handshaking -> connected      (lastKeepAliveAt = lastNow; keepalive armed)
handshakeRejected(r) handshaking -> disconnected  (reason = r)
keepAliveReceived() connected -> connected        (keepAliveCount++; lastKeepAliveAt = lastNow)
disconnect()   active        -> disconnecting     (reason = 'local disconnect')
disconnectComplete() disconnecting -> disconnected (reason = 'disconnected')
remoteDisconnect(r) active   -> disconnected      (reason = r)
update(nowMs)  evaluate, in order:
               connecting   and nowMs - connectAt    >= connectTimeoutMs    -> disconnected 'connect timeout'
               handshaking  and nowMs - handshakeAt  >= handshakeTimeoutMs  -> disconnected 'handshake timeout'
               connected    and nowMs - lastKeepAliveAt >= keepAliveTimeoutMs -> disconnected 'keepalive timeout'
```

## Detailed behavior

- **Construction**: options fields must be finite numbers `> 0` (durations) or positive
  integers (history limit); defaults applied; invalid values throw
  `ConnectionLifecycle: <detail>` naming the field. Pristine state: `disconnected`, no
  profile/reason, zero keepalive count, empty history, `lastNow = null`.
- **Validation**: every transition validates its source state first; on mismatch throws
  `ConnectionLifecycle: cannot <action> from <state>` (exact message shape pinned in the
  spec). Profiles are non-empty strings when provided; reasons are non-empty strings.
- **Time**: `update(nowMs)` with non-finite or backward `nowMs` is a no-op. Finite monotonic
  timestamps update `lastNow`. Timeout checks use `>=`; at most one timeout per phase per
  update (the machine leaves the phase on expiry). After expiry the machine is
  `disconnected`; timeouts are inert in `disconnected`/`disconnecting`.
- **History**: every state-changing transition appends `{ at: lastNow, from, to, reason }`.
  `lastNow` is null before the first `update`; transitions before any timestamp record
  `at: null`-safe behavior — in practice `at` is 0 when no timestamp was fed (documented;
  callers drive time before or after transitions freely). The log is bounded: when full, the
  oldest record is dropped. `history` returns a copy, oldest first.
- **Reconnect**: from `disconnected` (including after any disconnect reason), `connect()`
  restarts the cycle; `keepAliveCount` resets at `connect()`.
- **`disconnect()` from `disconnecting`** is invalid (throws); completion uses
  `disconnectComplete()`.

## Failure modes

- Wrong-state transition → descriptive throw, state unchanged.
- Invalid options → construction throw.
- Non-finite/backward timestamps → silent no-op (never expire, never mutate).
- Timeout expiry → deterministic transition to `disconnected` with exact reason; no partial
  state; observable via `state`/`reason`/`history`.

## Compatibility/migration

Additive: new exported names only. No registry, save format, or existing public API changes.
`lastNow` starts null; callers may drive transitions without `update` (timeouts simply never
expire until time is fed) — documented behavior, not a migration concern.

## Performance/resource constraints

- Each event/update is O(1) except a history append (O(1) amortized with the bounded cap;
  drop-oldest is O(1) on array shift amortized or O(n) worst at cap — acceptable at 32
  entries; uses an internal counter + slice on demand).
- Memory: O(historyLimit) records.

## Testing seams

- Scripted time via `update(nowMs)` — no fakes, no timers.
- Custom short durations (e.g. 50 ms) to pin timeout expiry and boundaries.
- Recording via `history` snapshots and getters.

## Observability/debugging

- `state`, `reason`, `profile`, `keepAliveCount`, `history` — full machine state without
  logging. Exact reason strings: `connect timeout`, `handshake timeout`, `keepalive timeout`,
  `disconnected`, plus caller-supplied reasons.

## Affected files/symbols

- NEW `src/simulation/ConnectionLifecycle.ts` — `ConnectionState`,
  `ConnectionLifecycleOptions`, `TransitionRecord`, `ConnectionLifecycle`.
- NEW `tests/unit/ConnectionLifecycle.test.ts`.
- Docs/state: `openspec/PROGRAM_STATE.json`, `openspec/PROGRAM_STATE.md`.

## Rejected alternatives

- **Timer-based timeouts (setTimeout)**: rejected — not headless-safe; breaks determinism
  and the 222 boundary; scripted time is the established convention.
- **Event emitter / callback hooks**: rejected — the model stays passive; 226+ can poll
  state or extend the API.
- **Transitions as plain data (reduce)**: rejected — methods with validation give exact
  error messages and match 222-224 API style.
- **Implicit disconnecting state skipped (disconnect() straight to disconnected)**:
  rejected — graceful disconnect is a distinct phase with completion, matching the
  sequence's "disconnect" lifecycle wording.
- **Unbounded history**: rejected — bounded log keeps memory constant and matches the
  codebase's resource discipline.

## Downstream dependencies

- 226 `server-chunk-streaming` will use the connected state as the gating precondition.
- 227 `server-player-movement` / 230 `block-interaction-networking` will gate on
  `state === 'connected'`.
- The machine can later be adapted into a `TickSystem` for `WorldTickProcess` (224) with
  per-tick `update(tick * TICK_MS)`.
