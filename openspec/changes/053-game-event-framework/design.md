# Design: 053-game-event-framework

## Context / current state

No decoupled gameplay-event layer exists; consumers would otherwise couple directly to producers.

## Target state

A `GameEventBus` with typed `emit`/`on`/`once`/`clear`. Producers emit `GameEvent`s; consumers
subscribe per type or via `'*'`. Delivery is synchronous, in subscription order, with defensive
listener isolation.

## Invariants

- `emit(event)` delivers to the event-type listeners, then the `'*'` wildcard listeners, each in
  subscription order.
- `on` returns an unsubscribe; `once` unsubscribes automatically after its first delivery.
- A listener throwing does not stop delivery to the remaining listeners.
- Events emitted *during* a delivery are queued and delivered in the same synchronous `emit` call,
  after the current batch (append semantics), preserving order.
- `clear` removes all subscriptions.

## API and data model

```ts
// src/simulation/GameEventBus.ts
export interface GameEventPosition { x: number; y: number; z: number; }
export interface GameEvent {
  type: string;
  tick: number;
  position?: GameEventPosition;
  data?: unknown;
}
export type GameEventListener = (event: GameEvent) => void;
export class GameEventBus {
  emit(event: GameEvent): void;
  on(type: string, listener: GameEventListener): () => void;
  once(type: string, listener: GameEventListener): () => void;
  clear(): void;
}
```

## Control / data flow

1. A producer calls `bus.emit({ type: 'block-broken', tick, position, data })`.
2. `emit` snapshots the current type listeners, invokes them in order (each in try/catch), then
   invokes wildcard listeners in order.
3. Events emitted during delivery are appended to a pending queue and delivered after the current
   batch (iteratively, no recursion).
4. `once` wraps the listener and self-unsubscribes before invoking.

## Detailed behavior

- Subscription order is insertion order per type; wildcard is a separate list delivered after the
  typed list.
- `once` on a type: the wrapper removes itself from that type's list on first delivery.
- `clear` empties both maps.

## Failure modes

- A listener throwing: caught per listener; the event is still delivered to the rest.

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

`emit` O(listeners of type + wildcard); typical fan-out is small.

## Testing seams

- `tests/unit/GameEventBus.test.ts`:
  - typed delivery: only matching type listeners receive the event;
  - wildcard delivery: `'*'` receives every event;
  - order: type listeners then wildcard, in subscription order;
  - unsubscribe: after `on`'s handle, no delivery;
  - once: delivered exactly once, then removed;
  - listener isolation: a throwing listener does not block others;
  - nested emit: events emitted during delivery are delivered after the current batch, in order;
  - clear: no deliveries afterward.

## Observability / debugging

No persistent state; counts are observable by listeners themselves.

## Affected files / symbols

- `src/simulation/GameEventBus.ts` — NEW.
- `tests/unit/GameEventBus.test.ts` — NEW.

## Rejected alternatives

- *Emitter-per-system*: every system would need its own bus; one generic bus with typed events is the
  minimal decoupling layer.
- *Async (microtask) delivery*: order becomes racy; synchronous broadcast keeps determinism.

## Downstream dependencies

149 (POIs), 185 (advancements), 187 (statistics), and 199 (particles) subscribe; producers emit
without knowing consumers.
