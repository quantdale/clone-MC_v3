# Design: 049-neighbor-update-queue

## Context / current state

Block cascades are currently handled by caller code without ordering or bounds (see `World`'s
falling queue pattern). 047/048 cover timed and random ticks; immediate neighbor updates need their
own ordered, bounded primitive.

## Target state

A `NeighborUpdateQueue` holds pending positions in FIFO order (deduplicated), drains at most
`maxPerDrain` per call through a handler, and caps its size (dropping the newest beyond the cap with a
`false` return). Handler-enqueued positions join the same iterative drain, so cascades cannot recurse
into the stack.

## Invariants

- At most one pending entry per `(x, y, z)`.
- `drain` processes positions in FIFO order, at most `maxPerDrain` per call, and returns the processed
  count.
- `enqueue` returns `false` (and does not add) when the queue already holds `maxQueueSize` positions.
- A handler may enqueue during `drain`; those positions are processed in the same drain up to the
  budget (iteratively — `drain` is never re-entered, so there is no recursion).
- `size`/`has` reflect pending state; `clear` empties it.

## API and data model

```ts
// src/simulation/NeighborUpdateQueue.ts
export type NeighborUpdateHandler = (x: number, y: number, z: number) => void;
export interface NeighborUpdateQueueOptions {
  maxPerDrain?: number;   // default 64
  maxQueueSize?: number;  // default 4096
}
export class NeighborUpdateQueue {
  constructor(opts?: NeighborUpdateQueueOptions);
  enqueue(x: number, y: number, z: number): boolean; // false when dropped (queue at cap)
  drain(handler: NeighborUpdateHandler): number;     // processed count
  get size(): number;
  has(x: number, y: number, z: number): boolean;
  clear(): void;
}
```

## Control / data flow

1. A block change calls `enqueue(x, y, z)` for each affected neighbor position.
2. Each fixed tick (or per-frame budget), the consumer calls `drain(handler)`; the handler performs
   the neighbor reaction and may call `enqueue` again.
3. Enqueues during `drain` append to the same FIFO; the loop continues until the budget is consumed or
   the queue empties.

## Detailed behavior

- Internally a `Map<positionKey, true>` (dedupe) plus a FIFO array of keys; enqueue checks the map,
   pushes, and returns `false` when at capacity (the map/array stay unchanged).
- `drain` iterates the FIFO, shifting processed entries; positions enqueued by the handler are
   processed within the same call up to `maxPerDrain`.

## Failure modes

- Overflow: `enqueue` returns `false` (documented lossy policy; callers may react).
- A handler throwing propagates and aborts the drain; already-processed entries stay removed.

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

Enqueue O(1); drain O(processed) with a shift-based FIFO (or index pointer); bounded by `maxPerDrain`
per call and `maxQueueSize` total.

## Testing seams

- `tests/unit/NeighborUpdateQueue.test.ts`:
  - FIFO order;
  - dedupe (double enqueue → one processing);
  - budget (`maxPerDrain` splits work across drains);
  - cascade: handler enqueues new positions, all processed within budget in the same drain (no
    recursion — verified by processing order);
  - overflow: enqueue returns false at cap and the queue does not grow;
  - size/has/clear.

## Observability / debugging

`size`/`has` expose pending work; processed counts from `drain` are loggable.

## Affected files / symbols

- `src/simulation/NeighborUpdateQueue.ts` — NEW.
- `tests/unit/NeighborUpdateQueue.test.ts` — NEW.

## Rejected alternatives

- *Recursive notify*: stack overflow on deep cascades; the iterative budgeted drain is the standard
  safe pattern.
- *Unbounded queue*: memory risk; the cap with drop-newest keeps behavior predictable.

## Downstream dependencies

050 (block behavior dispatch) and redstone (156) consume the queue; the world wiring (later change)
runs `drain` per tick.
