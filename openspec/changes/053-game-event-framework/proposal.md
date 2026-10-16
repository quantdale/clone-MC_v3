# Proposal: 053-game-event-framework

## Problem

Sensors, AI, advancements, and statistics all react to *gameplay occurrences* (block broken, entity
hurt, item crafted). Wiring those consumers directly to every producer couples systems together and
makes each new consumer touch every producer. There is no generic, decoupled event layer.

## Goals

- Provide a generic `GameEventBus`: producers `emit` typed events; consumers subscribe per type (or
  wildcard), without knowing each other.
- Deterministic delivery: listeners run in subscription order, synchronously; a throwing listener does
  not break the rest.
- `once` subscriptions, unsubscribe handles, and `clear` for teardown.

## Non-goals

- Event persistence/replay (a later determinism concern; 241 replay suite can record emitted events).
- Specific event types (advancements/statistics define theirs later — 185/187).
- Async or cross-tick delivery; events are synchronous broadcasts.

## Preconditions

- Change 052 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 052 baseline (651 unit / 19 e2e).

## Dependencies

- None beyond the standard library.

## Proposed change

- `src/simulation/GameEventBus.ts` (NEW): `GameEvent` (type, tick, optional position, optional opaque
  data), `GameEventListener`, `GameEventBus` (`emit`, `on`, `once`, `clear`).
- `tests/unit/GameEventBus.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet, no behavior changes.

## Risks

- Wildcard listeners receive every event; documented and cheap (one extra set lookup).
- A listener re-entering `emit` from inside a handler: supported iteratively (a snapshot semantics or
  documented append-during-emit) — defined below as: events emitted during delivery are delivered in
  the same synchronous call after the current batch, in order.

## Rollback strategy

Revert the commit; the bus is additive.

## Definition of Done

- `emit(event)` delivers to type listeners then wildcard listeners, in subscription order.
- `on` returns an unsubscribe; `once` auto-unsubscribes after the first delivery; `clear` empties all
  subscriptions.
- A throwing listener does not prevent other listeners from receiving the event.
- Unit tests cover typed + wildcard delivery, order, unsubscribe, once, clear, and listener isolation.
- Full gate green; 053 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 053 suite; E2E stays 19/19.
