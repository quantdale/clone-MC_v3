# Design: 047-scheduled-tick-queue

## Context / current state

044-046 provide the fixed clock, render interpolation, and pause gate. No primitive schedules
per-position logic at exact future ticks.

## Target state

A `ScheduledTickQueue` holds pending per-position ticks keyed by `x,y,z`, each with an absolute due
tick. `tick(nowTick)` pops due entries deterministically (due tick, then insertion order). The queue
serializes to a versioned, validated shape for persistence.

## Invariants

- One entry per position: `schedule` on an already-pending position updates its `tickTime` in place.
- `tick(nowTick)` returns exactly the entries with `tickTime <= nowTick`, ordered by `(tickTime, seq)`
  where `seq` is a monotonic insertion counter; popped entries are removed.
- `cancel(x, y, z)` removes a pending entry (idempotent); `has` reflects pending state.
- `serialize()`/`deserialize()` round-trip exactly; deserialization validates fully before mutating
  the queue (rejected input leaves the queue unchanged).
- Sequence numbers reset on `deserialize`/`clear` (ties re-order by deserialized order — deterministic).

## API and data model

```ts
// src/simulation/ScheduledTickQueue.ts
export interface ScheduledTick {
  x: number; y: number; z: number; tickTime: number;
}
export const SCHEDULED_TICK_QUEUE_VERSION = 1;
export interface SerializedScheduledTickQueue {
  version: 1;
  entries: ScheduledTick[];
}
export function validateSerializedScheduledTickQueue(input: unknown): SerializedScheduledTickQueue;
export class ScheduledTickQueue {
  schedule(x: number, y: number, z: number, dueTick: number): void;
  scheduleIn(x: number, y: number, z: number, delayTicks: number, currentTick: number): void;
  tick(nowTick: number): ScheduledTick[];
  has(x: number, y: number, z: number): boolean;
  cancel(x: number, y: number, z: number): void;
  clear(): void;
  get size(): number;
  serialize(): SerializedScheduledTickQueue;
  deserialize(data: unknown): void;
}
```

## Control / data flow

1. Block/fluid behavior calls `schedule(x, y, z, currentTick + delay)` (or `scheduleIn`).
2. Each fixed tick, the consumer calls `tick(currentTick)` and processes the returned entries.
3. `serialize()` emits `{ version: 1, entries }` for the save layer; `deserialize(data)` validates
   and restores (after `clear`).

## Detailed behavior

- Internally a `Map<positionKey, { entry, seq }>` for dedupe plus a `nextSeq` counter.
- `tick` collects entries with `tickTime <= nowTick`, sorts by `(tickTime, seq)`, removes them, and
  returns them.
- `deserialize` validates the whole payload first; only then clears and rebuilds the queue (assigning
  fresh sequential `seq` in payload order).

## Failure modes

- Malformed serialized data → `validateSerializedScheduledTickQueue` throws with a descriptive
  message; the queue is unchanged.
- Non-integer / non-finite `dueTick` or coordinates → rejected by the validator on deserialize;
  `schedule` throws on invalid inputs.

## Compatibility / migration

Additive. The serialized format is versioned; future format changes can migrate via 041-style chains.

## Performance / resource constraints

`tick` is O(n log n) in pending entries (sort of due subset); scheduling is O(1); typical pending
sets are small. No per-frame work beyond the consumer's own tick loop.

## Testing seams

- `tests/unit/ScheduledTickQueue.test.ts`:
  - schedule + tick: entries due at/after thresholds;
  - ordering: (tickTime, seq) with ties in insertion order;
  - dedupe: re-schedule updates time, size stays 1;
  - scheduleIn: due tick = current + delay;
  - has/cancel/clear/size;
  - serialize → deserialize round-trip equality;
  - validation: malformed entries/version rejected, queue unchanged.

## Observability / debugging

`size` and `has` expose pending work; serialized form is inspectable.

## Affected files / symbols

- `src/simulation/ScheduledTickQueue.ts` — NEW.
- `tests/unit/ScheduledTickQueue.test.ts` — NEW.

## Rejected alternatives

- *Heap-based priority queue*: faster asymptotically but harder to reason about tie-breaking and
  persistence; the small-pending-set regime makes a sorted pop simple and deterministic.
- *Storing absolute wall time*: scheduled ticks are game-time (tick) based for determinism.

## Downstream dependencies

048 (random ticks) and 050 (block behavior dispatch) consume the queue; 078/079 (fluid flow) schedule
fluid ticks through it; the save layer persists `serialize()` output.
