# Design: 051-block-event-queue

## Context / current state

047-050 cover scheduled/random/neighbor ticks and behavior dispatch. Local block events
(Minecraft's `addBlockEvent`) need their own ordered, bounded queue with per-(position, eventId)
dedupe.

## Target state

A `BlockEventQueue` holds `BlockEvent`s (`x`, `y`, `z`, `blockId`, `eventId`, `param`) in FIFO order,
deduplicated per `(position, eventId)` with newest-param-wins, delivered at most `maxPerDrain` per
`drain`, capped at `maxQueueSize` (drop-newest with `false`).

## Invariants

- At most one pending event per `(position, eventId)`; re-adding updates `param` in place (and keeps
  the original FIFO position).
- Different `eventId`s at the same position are independent entries.
- `drain` delivers in FIFO order, at most `maxPerDrain` per call, returning the processed count.
- `add` at the cap returns `false` and does not grow the queue.
- `size` reflects pending events; `clear` empties them.

## API and data model

```ts
// src/simulation/BlockEventQueue.ts
export interface BlockEvent {
  x: number; y: number; z: number;
  blockId: number;
  eventId: number;
  param: number;
}
export type BlockEventHandler = (event: BlockEvent) => void;
export interface BlockEventQueueOptions {
  maxPerDrain?: number;   // default 64
  maxQueueSize?: number;  // default 4096
}
export class BlockEventQueue {
  constructor(opts?: BlockEventQueueOptions);
  add(x: number, y: number, z: number, blockId: number, eventId: number, param: number): boolean;
  drain(handler: BlockEventHandler): number;
  get size(): number;
  clear(): void;
}
```

## Control / data flow

1. Block behavior calls `queue.add(x, y, z, blockId, eventId, param)`.
2. Each fixed tick, the consumer calls `drain(handler)`; the handler processes each event (e.g.
   play the sound / start the piston).
3. Re-adds for a pending `(position, eventId)` update `param` in place (newest wins).

## Detailed behavior

- Key: `${x},${y},${z}:${eventId}`. `add` updates the stored event's `param`/`blockId` when the key
  exists; otherwise appends FIFO.
- `drain` shifts from the FIFO head up to `maxPerDrain`, invoking the handler per event.

## Failure modes

- Overflow: `add` returns `false` (documented lossy policy).
- A handler throwing propagates and aborts the drain; already-delivered events stay removed.

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

`add` O(1); `drain` O(processed) bounded by `maxPerDrain`; total bounded by `maxQueueSize`.

## Testing seams

- `tests/unit/BlockEventQueue.test.ts`:
  - FIFO delivery order;
  - per-(position, eventId) dedupe with param update (newest wins, single delivery);
  - different eventIds at one position coexist;
  - budget split across drains;
  - overflow: `false` return, size stable, dropped event never delivered;
  - size/clear.

## Observability / debugging

`size` exposes pending events; drain counts are loggable.

## Affected files / symbols

- `src/simulation/BlockEventQueue.ts` — NEW.
- `tests/unit/BlockEventQueue.test.ts` — NEW.

## Rejected alternatives

- *One event per position (eventId ignored)*: loses Minecraft's per-eventId coexistence semantics;
  the `(position, eventId)` key is the minimal faithful model.
- *Scheduled-tick delivery*: block events are immediate (delivered next drain), not timed.

## Downstream dependencies

Piston (164), note blocks, dispensers (168), and TNT (170) add events through this queue; the world
wiring (later change) drains it per tick.
