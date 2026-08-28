# Spec: game-event-framework

## Contract

Gameplay occurrences MUST be broadcast through a generic, decoupled event bus: producers `emit` typed
`GameEvent`s; consumers subscribe per type or via a `'*'` wildcard. Delivery MUST be synchronous, in
subscription order (typed listeners then wildcard), with a throwing listener not blocking the rest.
`on` MUST return an unsubscribe, `once` MUST self-unsubscribe after one delivery, and `clear` MUST
remove all subscriptions.

## Definitions

- **GameEvent**: `{ type, tick, position?, data? }`.
- **Wildcard**: the `'*'` type, subscribed by listeners that want every event.

## Invariants

- `emit` delivers to type listeners then wildcard listeners, each in subscription order.
- A throwing listener is isolated; remaining listeners still receive the event.
- Events emitted during delivery are delivered after the current batch in the same synchronous call.
- `once` unsubscribes before its first invocation; `clear` empties all subscriptions.

## Requirements

### Requirement: typed delivery
`emit` MUST deliver only to listeners of the event's type (plus wildcard listeners).

#### Scenario: type filtering
- **GIVEN** listeners for `'a'`, `'b'`, and `'*'`
- **WHEN** `emit({ type: 'a', tick: 1 })` runs
- **THEN** the `'a'` and `'*'` listeners receive it; the `'b'` listener does not.

### Requirement: delivery order
Listeners MUST run in subscription order, typed first, wildcard after.

#### Scenario: ordering
- **GIVEN** typed listeners `t1`, `t2` and wildcard listeners `w1`, `w2` in that subscription order
- **WHEN** `emit({ type: 't', tick: 1 })` runs
- **THEN** the invocation order is `t1, t2, w1, w2`.

### Requirement: unsubscribe and once
`on` MUST return a working unsubscribe; `once` MUST deliver exactly once.

#### Scenario: handles
- **GIVEN** an `on` listener unsubscribed before a second emit, and a `once` listener
- **WHEN** two emits run
- **THEN** the unsubscribed listener received only the first event and the `once` listener received
  exactly one event.

### Requirement: listener isolation
A throwing listener MUST NOT prevent other listeners from receiving the event.

#### Scenario: throwing listener
- **GIVEN** a listener that throws and a second listener
- **WHEN** `emit` runs
- **THEN** the second listener still receives the event (no throw escapes `emit`).

### Requirement: nested emits
Events emitted during a delivery MUST be delivered after the current batch, in order, in the same
synchronous call.

#### Scenario: nested emit
- **GIVEN** a listener that emits `{ type: 'inner' }` while handling `{ type: 'outer' }`
- **WHEN** `emit({ type: 'outer', tick: 1 })` runs
- **THEN** the outer listeners run first, then the inner listeners, in order.

### Requirement: clear
`clear` MUST remove all subscriptions.

#### Scenario: clearing
- **GIVEN** several listeners
- **WHEN** `clear()` then `emit` run
- **THEN** no listener receives the event.

## Error and failure behavior

- Listener exceptions are swallowed per listener (never propagate out of `emit`).

## Performance and resource bounds

`emit` is O(type listeners + wildcard listeners); fan-out is small in practice.

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Decoupled broadcast keeps producers and consumers independent; defensive isolation keeps one bad
listener from breaking the simulation.

## Observability

Listeners themselves observe; no bus-internal state beyond subscriptions.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Typed delivery | type filtering with wildcard |
| Delivery order | t1,t2,w1,w2 |
| Unsubscribe and once | handles work |
| Listener isolation | throwing listener isolated |
| Nested emits | inner delivered after outer batch |
| Clear | no deliveries after clear |
