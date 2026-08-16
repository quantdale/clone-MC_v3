# Proposal: 225-connection-lifecycle

## Problem

223 defined the wire codecs and 224 the headless authoritative tick process, but nothing
models the client/server connection itself: there is no explicit state machine for
connecting, handshake/login-like profile exchange, graceful or remote disconnect, or
keepalive monitoring. Later changes (226 chunk streaming, 227 movement, 230 block
interaction) all assume a connection that exists, is authenticated, and can be assumed
alive — 225 provides that contract as a pure headless model.

## Goals

- An explicit connection lifecycle state machine: `disconnected`, `connecting`,
  `handshaking`, `connected`, `disconnecting`.
- Deterministic, scripted-time transitions: connect, transport-up (handshake begins),
  handshake accept/reject, keepalive refresh, graceful disconnect + completion, remote
  disconnect.
- Timeouts with injectable durations: connect, handshake, keepalive — expiry moves the
  machine to `disconnected` with an exact reason.
- Strict validation: every transition called from an invalid state throws a descriptive
  `ConnectionLifecycle: <detail>` error.
- Observability: `state`, `reason`, `profile`, `keepAliveCount`, and a bounded transition
  log with timestamps.
- Zero DOM/browser dependency; fully unit-testable headlessly with scripted time.

## Non-goals

- No actual sockets/transport/network IO (transport is simulated by the machine's own
  transitions).
- No wire encoding of messages (223 covers codecs; 226+ will use them).
- No server/process integration (a future change wires the machine into the server; 225
  stays a pure model).
- No player/auth storage or real login; the profile is an opaque non-empty label.

## Preconditions

- 223 `network-protocol-codecs` VERIFIED (codec surface exists).
- 224 `dedicated-server-tick-loop` VERIFIED (tick process conventions; this machine is
  drivable as a future TickSystem).

## Dependencies

- None at runtime (pure module). Conventions from 223/224: descriptive `Module: <detail>`
  throws, scripted-time testability, strict option validation.

## Proposed change

New module `src/simulation/ConnectionLifecycle.ts`:

- `ConnectionState` union of the five states.
- `ConnectionLifecycleOptions { connectTimeoutMs?, handshakeTimeoutMs?, keepAliveTimeoutMs?,
  historyLimit? }` (defaults 10000 / 10000 / 30000 / 32; validated).
- `TransitionRecord { at, from, to, reason? }`.
- Class `ConnectionLifecycle`: `connect(profile?)`, `connected()`, `handshakeAccepted()`,
  `handshakeRejected(reason)`, `keepAliveReceived()`, `disconnect()`, `disconnectComplete()`,
  `remoteDisconnect(reason)`, `update(nowMs)`, `reset()`; getters `state`, `reason`,
  `profile`, `keepAliveCount`, `history` (readonly snapshot).

## Compatibility and migration

Pure addition: one new simulation file plus tests. Zero registry changes, no `Game.ts` edit,
no save-format change.

## Risks

- Over-modeling the real Minecraft handshake → mitigated by keeping the state set to the
  narrow outcome (connect/handshake/login-like profile/disconnect/keepalive).
- Timeout semantics ambiguity → exact `>=` boundary and no-op rules pinned in the spec.

## Rollback strategy

Remove `src/simulation/ConnectionLifecycle.ts` and its test file; nothing else references it.

## Definition of Done

REQ-1..REQ-7 of the capability spec satisfied with unit tests; `npm run typecheck`,
`npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` green; OpenSpec
state files updated; change VERIFIED with advancement allowed.

## Advancement gate

100% task completion; every MUST/SHALL verified; baseline regression gate green; no
Advancement Exception required.
