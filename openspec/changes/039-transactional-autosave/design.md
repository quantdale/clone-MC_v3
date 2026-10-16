# Design: 039-transactional-autosave

## Context / current state

038 provides `DirtySaveQueue` (bounded, ordered, de-duplicated) and `RepositorySaveSink` (routes
`SaveUnit`s to the 034-037 repositories). Nothing schedules drains. A game loop or save manager must
periodically persist dirty units, and a tab close must flush what it can.

## Target state

An `AutosaveCoordinator` owns a queue + sink and runs the save policy:
- a periodic interval drains one bounded batch per tick (`limitPerTick`), skipping work when idle;
- `pagehide` and `visibilitychange`→hidden trigger a best-effort full `flush()`;
- `start()`/`stop()` manage the interval and listeners; `markDirty(unit)` enqueues and wakes the
  interval if it had been stopped for idleness.

## Invariants

- A single interval is created by `start()`; repeated `start()` is a no-op; `stop()` clears it.
- Each `tick` performs at most `limitPerTick` `sink.write` calls (0 when the queue is empty).
- `flush()` drains until the queue is empty, but bails after a run of zero-progress drains
  (persistent failures) instead of looping forever; it returns the number of units written.
- `markDirty` delegates to `queue.markDirty`.
- Listeners are registered only on the provided `flushTarget`; when `flushTarget` is null (e.g. Node
  without a window) no listeners are attached and `flush()` remains callable manually.
- All timer/listener handles are injectable, so Node tests use fake timers and a fake target.

## API and data model

```ts
// src/storage/AutosaveCoordinator.ts
export interface TimerLike {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}
export interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}
export interface AutosaveCoordinatorOptions {
  queue: DirtySaveQueue;
  sink: SaveSink;
  limitPerTick?: number;      // default 64
  intervalMs?: number;        // default 5000
  timer?: TimerLike;          // default globalThis
  flushTarget?: EventTargetLike | null; // default window when present, else null
}
export class AutosaveCoordinator {
  constructor(opts: AutosaveCoordinatorOptions);
  markDirty(unit: SaveUnit): void;
  start(): void;
  stop(): void;
  tick(): Promise<number>;
  flush(): Promise<number>;
  get size(): number;
}
```

## Control / data flow

1. Producer calls `coordinator.markDirty(unit)` → `queue.markDirty(unit)`.
2. `start()` (called once after construction, idempotent) creates the interval via `timer.setInterval(
   () => void this.tick(), intervalMs)` and registers `onFlushEvent` for `pagehide` and
   `visibilitychange` on `flushTarget`.
3. Every interval fire → `tick()` → `queue.size === 0 ? 0 : queue.drain(sink, limitPerTick)`.
4. `pagehide`/hidden → `onFlushEvent` → `void this.flush()`.
5. `flush()` loops: `while (queue.size > 0 && zeroProgressRuns < 3) { const n = await queue.drain(sink,
   limitPerTick); total += n; zeroProgressRuns = n === 0 ? zeroProgressRuns + 1 : 0; }` and returns
   `total`.
6. `stop()` → `timer.clearInterval(id)` + remove listeners; `markDirty` after `stop()` restarts the
   interval (wake-on-dirty) so late dirty data still gets periodic saves.

## Detailed behavior

- `tick()` never throws out of the interval: `drain` already swallows per-unit failures (re-queue);
  the interval callback wraps `tick()` in a no-op catch so a rejected drain cannot kill the scheduler.
- `flush()` guard: three consecutive drains that write 0 units end the loop (persistent failure or
  malformed units); everything else continues until empty.
- `start()` idempotence: if already started, returns immediately.
- `markDirty` after `stop()`: calls `start()` again (wake-on-dirty), so the policy re-arms itself.

## Failure modes

- `sink.write` rejects → unit stays pending (038 re-queue); periodic ticks retry it.
- `flushTarget` null → no listeners; manual `flush()` still works.
- Interval callback rejection → caught and ignored (scheduling survives).
- `limitPerTick <= 0` → treated as 0 (ticks write nothing; `flush` bails after zero-progress guard).

## Compatibility / migration

No schema/`WORLD_DB_VERSION` change; `WORLD_DB_VERSION` stays `4`. 039 layers above 034-038 only.

## Performance / resource constraints

Per-interval work is at most `limitPerTick` async writes; idle ticks are a single `size` check.
`flush` is a bounded loop with a zero-progress guard, so pagehide cannot spin forever.

## Testing seams

- `tests/unit/AutosaveCoordinator.test.ts` with `vi.useFakeTimers()`:
  - periodic drain: mark 3 units, advance one interval → `limitPerTick` written, remainder pending;
    advance again → drained;
  - idle tick writes nothing;
  - failing unit is retried across ticks;
  - `flush()` drains everything and returns the count; zero-progress guard stops a stuck flush;
  - `start()`/`stop()` lifecycle: single interval, `stop()` clears it and removes listeners (fake
    target records listener add/remove), `markDirty` after `stop()` re-arms;
  - `flushTarget` `pagehide`/`visibilitychange` listener invocation triggers a flush.

## Observability / debugging

`size` exposes pending save work; `tick()`/`flush()` return written counts for metrics/logging.

## Affected files / symbols

- `src/storage/AutosaveCoordinator.ts` — NEW coordinator.
- `tests/unit/AutosaveCoordinator.test.ts` — NEW tests.

## Rejected alternatives

- *Expose raw `queue`/`sink` to the game and let it manage timers*: scatters the save policy across
  callers and makes pagehide handling everyone's job; a coordinator is the minimal single policy point.
- *Use `setTimeout` recursion for periodic saves*: drift-prone; `setInterval` + injectable timer is
  simpler and fake-timer friendly.
- *Make `flush` unbounded*: a persistently failing sink would hang `pagehide`; the zero-progress guard
  bounds it while preserving no-loss semantics (units stay queued).

## Downstream dependencies

040 (localStorage migration) imports legacy saves into these repositories (and can enqueue via
`markDirty`); 043 (quota recovery) observes `size`/drain results for failure policy.
