# Design: 077-fluid-tick-dispatch

## Context / current state

047 `ScheduledTickQueue` pops all due entries unboundedly and is kind-less. 076 defines fluid
states but nothing schedules or bounds fluid work.

## Target state

`FluidTickDispatcher` owns fluid scheduling on a dedicated 047 queue instance, drains it with a
validated per-tick budget, and invokes a handler per due tick — the integration surface for
078/079.

## Invariants

- Dispatch order is the queue's deterministic `(tickTime, insertion seq)` order.
- At most `maxPerTick` handlers run per `tick()` call; the rest are deferred (re-scheduled at their
  original due tick, acquiring fresh insertion order — deterministic).
- Scheduling uses relative delays from a current tick; positions dedupe (047).
- `maxPerTick` is a positive integer (validated at construction).
- The dispatcher never interprets fluid state; the handler owns semantics.

## API and data model

```ts
// src/simulation/FluidTickDispatcher.ts (NEW)
export type FluidTickHandler = (x: number, y: number, z: number, dueTick: number) => void;

export interface FluidTickDispatchReport {
  /** Handlers invoked this tick. */
  processed: number;
  /** Due entries deferred to a later tick (kept at their original due tick). */
  deferred: number;
  /** Entries still pending after this tick. */
  pending: number;
}

export const DEFAULT_MAX_FLUID_TICKS_PER_TICK = 1000;

export class FluidTickDispatcher {
  constructor(queue: ScheduledTickQueue, handler: FluidTickHandler, maxPerTick?: number);
  schedule(x: number, y: number, z: number, delayTicks: number, currentTick: number): void;
  tick(nowTick: number): FluidTickDispatchReport;
  get pendingCount(): number;
  clear(): void;
}
```

## Control / data flow

1. The wiring (078) calls `schedule(x, y, z, delayTicks, currentTick)` when a cell needs fluid work.
2. Each engine tick, the wiring calls `tick(nowTick)`.
3. The dispatcher pops all due entries (047), processes at most `maxPerTick` in order, defers the
   rest, and returns the report.
4. The handler performs flow (078/079) and may re-schedule itself or neighbors.

## Detailed behavior

- `schedule` validates delay/current ticks via 047 (`scheduleIn`).
- `tick`: `due = queue.tick(nowTick)`; `toProcess = due.slice(0, maxPerTick)`;
  `toDefer = due.slice(maxPerTick)` re-scheduled via `queue.schedule(x, y, z, tickTime)` (original
  due tick); handler invoked per processed entry with its due tick; report reflects counts.
- Deferral re-inserts entries at their original due tick — they remain due for the next `tick()`
  (bounded budgets across heavy ticks).
- `clear()` delegates to the queue; `pendingCount` mirrors `queue.size`.

## Failure modes

- Non-positive/non-integer `maxPerTick` throws at construction.
- Handler exceptions propagate (caller bug); queue state already popped for processed entries
  (documented).

## Compatibility / migration

Additive. The queue instance is caller-provided and MUST be dedicated to fluid ticks (047 entries
carry no kind).

## Performance / resource constraints

`tick` is O(due log due) from 047 plus O(due) dispatcher work; deferral re-inserts are O(1) each.
Bounded dispatch prevents unbounded per-tick fluid work.

## Testing seams

- `tests/unit/FluidTickDispatcher.test.ts` (NEW):
  - deterministic order `(tickTime, seq)`;
  - budget: processed/deferred split and deferred execution on the next tick;
  - handler arguments and self-rescheduling;
  - relative scheduling and dedupe;
  - not-yet-due entries untouched; pendingCount/clear;
  - invalid `maxPerTick` throws;
  - scripted determinism.

## Observability / debugging

Reports expose processed/deferred/pending; tests assert exact sequences.

## Affected files / symbols

- `src/simulation/FluidTickDispatcher.ts` — NEW.
- `tests/unit/FluidTickDispatcher.test.ts` — NEW.

## Rejected alternatives

- *Bounded pop inside 047*: touches a verified, serialized primitive; the dispatcher layers the
  budget on top.
- *Unbounded dispatch*: contradicts the change scope ("bounded updates").
- *Queue kind field*: would churn 047's serialized format; a dedicated queue instance per kind is
  sufficient and documented.

## Downstream dependencies

078/079 implement `FluidTickHandler` flow rules and drive the dispatcher; 080+ layer interactions
on top.
