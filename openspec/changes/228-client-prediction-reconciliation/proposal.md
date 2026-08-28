# Proposal: 228-client-prediction-reconciliation

## Problem

227 built the server-authoritative movement validator that returns a teleport
`correction` on violation. But a client that simply waits for the server would feel
laggy, and a client that blindly predicts would desync when a correction arrives. The
client needs local prediction (apply its own movement immediately) plus reconciliation
(snap to the authoritative position on a server correction and replay the intents it sent
afterwards). 228 provides that as a pure headless model.

## Goals

- A client-side reconciler that holds a predicted position and a buffer of pending intents.
- `predict(position, tick)`: locally apply a movement intent (advance the predicted
  position, buffer it for replay).
- `reconcile(authoritativePosition, authoritativeTick)`: snap to the server's authoritative
  position for that tick and replay buffered intents with a newer tick, keeping the client
  in sync with the server's truth.
- Strict validation: malformed coords/ticks throw; only newer-than-confirmed corrections are
  applied (stale corrections are ignored).
- Determinism: identical schedules yield identical predicted position, confirmed tick, and
  pending count.
- Zero DOM/browser dependency; fully unit-testable headlessly.

## Non-goals

- No render interpolation between server snapshots (a later, render-side concern).
- No networking/serialization (223 codecs; 229+ wire intents/corrections).
- No world collision or 227's server-side authority logic (227 owns that).
- No actual entity/player state.

## Preconditions

- 227 `server-player-movement` VERIFIED (the server-side authority this reconciles against).

## Dependencies

- None at runtime (pure module). Conventions from 222-227: `Module: <detail>` throws,
  scripted determinism, strict validation, bounded resources.

## Proposed change

New module `src/simulation/MovementReconciler.ts`:

- `Position { x, y, z }`.
- `PendingIntent { tick, position }` (internal buffer element, exported for inspection).
- `MovementReconcilerOptions { maxPending? }` (bounded buffer, positive integer, default 1024).
- `MovementReconciler` with `predict(position, tick)`, `reconcile(authoritativePosition,
  authoritativeTick)`, getters `predicted`, `confirmedTick`, `pendingCount`, and `reset()`.

## Compatibility and migration

Pure addition: one new simulation file plus tests. Zero registry changes, no `Game.ts` edit,
no save-format change.

## Risks

- Replay semantics ambiguity → pinned: on reconcile, snap to authoritative position for the
  confirmed tick, then re-apply buffered intents with `tick > authoritativeTick` in tick
  order; buffer entries `<= authoritativeTick` are dropped.
- Stale correction handling → pinned: corrections with `authoritativeTick <= confirmedTick`
  are ignored (no-op).

## Rollback strategy

Remove `src/simulation/MovementReconciler.ts` and its test file; nothing else references it.

## Definition of Done

REQ-1..REQ-6 of the capability spec satisfied with unit tests; `npm run typecheck`,
`npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` green; OpenSpec
state files updated; change VERIFIED with advancement allowed.

## Advancement gate

100% task completion; every MUST/SHALL verified; baseline regression gate green; no
Advancement Exception required.
