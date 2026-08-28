# Design: 224-dedicated-server-tick-loop

## Context/current state

- `src/engine/GameLoop.ts` — rAF-driven loop; calls `update(dt)` per frame with clamped
  elapsed seconds. Browser-only.
- `src/engine/SimulationClock.ts` (044) — pure fixed 20 TPS accumulator clock.
  `update(nowMs)` returns the number of whole 50 ms ticks to run, bounded by
  `maxTicksPerFrame` (default 10); backward/non-finite timestamps return 0; the first call
  anchors the clock and returns 0; after a capped frame the remainder is capped below one
  tick. Fully headless-testable with scripted time. Currently consumed only by
  `RenderInterpolator`.
- `src/simulation/SimulationHarness.ts` (055) — test-side harness: `step(times)` increments
  a 1-based tick counter and calls each `HarnessSystem.tick(tick)` in registration order.
  Non-integer/`<= 0` `times` is a no-op. Also provides snapshot/restore/replay.
- `src/engine/Game.ts` — owns `simTick` (a per-frame monotonic counter) and drives all world
  simulation inside the browser update path. Not modified by this change.
- `src/simulation/SimulationPackageBoundary.ts` (222) — declares shareable/headless-safe
  simulation modules; this change adds one more headless-safe module.

## Target state

A production headless authoritative tick process (`WorldTickProcess`) that:

- owns a fixed-timestep clock (default `new SimulationClock()`, injectable),
- owns a completed-tick counter,
- runs an ordered list of `TickSystem`s exactly once per tick with 1-based tick numbers,
- is driven either by wall time (`update(nowMs)`) or directly (`step(times)`),
- stops and surfaces the error when any system throws, without counting the failed tick,
- has no DOM/rAF dependency and is fully unit-testable headlessly.

## Invariants

- Tick numbers passed to systems are `completedTicks + 1` at call time, strictly increasing
  across the process lifetime except after `reset()`.
- Systems are called in registration order, exactly once per tick, for every completed tick.
- A completed tick is one where every system returned without throwing.
- A failed tick is never counted; its partial system calls are not observable as a completed
  tick (`tick` getter never advances past it).
- After a failure the process is stopped and every subsequent `update`/`step` rethrows the
  same error until `reset()`.
- The process never ticks a system outside `update`/`step`; it never calls `tick` with a
  stale or repeated number (except after `reset()`, which restarts at 1).
- `update` delegates all time handling (anchoring, batching, capping, backward time) to the
  clock; the process itself only runs the emitted tick count.

## API and data model

```ts
// src/simulation/WorldTickProcess.ts
export interface TickSystem {
  /** Called once per fixed tick, in registration order, with the 1-based tick number. */
  tick(tick: number): void;
}

export interface WorldTickProcessOptions {
  /** Systems ticked in registration order, exactly once per tick. Default [].
   *  Captured at construction; later mutations are ignored. */
  readonly systems?: readonly TickSystem[];
  /** Fixed-timestep clock; defaults to a fresh SimulationClock. Must satisfy
   *  update(nowMs) -> ticks to run and isRunning/reset semantics. */
  readonly clock?: SimulationClock;
}

export class WorldTickProcess {
  constructor(options?: WorldTickProcessOptions); // throws WorldTickProcess: <detail>

  /** Feed wall-clock ms; runs exactly the clock-emitted tick count. Returns ticks run. */
  update(nowMs: number): number;
  /** Run exactly `times` ticks directly (no clock). Non-integer or <= 0 is a no-op
   *  returning 0 (matches SimulationHarness). Returns ticks run. */
  step(times?: number): number;

  get tick(): number;       // completed ticks
  get isRunning(): boolean; // clock anchored (false before first update / after reset)
  get isStopped(): boolean; // true after a system failure until reset()
  get lastError(): unknown; // the error that stopped the process, or null
  reset(): void;            // clear error/stopped, zero counter, reset clock
}
```

Internal shape: `{ systems: readonly TickSystem[], clock: SimulationClock,
tickCounter: number, stopped: boolean, error: unknown }`.

## Control/data flow

```
update(nowMs) ──► clock.update(nowMs) ─► n ticks ─┐
step(times) ──────────────────────────► n ticks ─┤──► runTicks(n)
                                                 │
   runTicks(n): for i in 1..n:
       next = tickCounter + 1
       for system of systems: system.tick(next)
       tickCounter++                      (only if all systems returned)
   on throw: stopped = true; error = err; rethrow
```

## Detailed behavior

- **Construction**: `systems` must be an array of `TickSystem` (objects with a function
  `tick`) or absent; `clock` must satisfy the clock surface or be absent. Every rejection
  throws `WorldTickProcess: <detail>` with the offending index when applicable. The systems
  array is captured; the clock defaults to `new SimulationClock()`.
- **`update(nowMs)`**: if stopped, rethrow `lastError`. Otherwise `n = clock.update(nowMs)`
  (the clock itself ignores non-finite/backward timestamps and anchors on first call) and
  `runTicks(n)`; returns `n`.
- **`step(times = 1)`**: if stopped, rethrow `lastError`. Non-integer or `<= 0` `times` is a
  no-op returning 0 (mirrors 055). Otherwise `runTicks(times)`; returns `times`.
- **Tick numbers**: `next = tickCounter + 1` per tick; the counter advances only after every
  system in that tick returned. Interleaved `update`/`step` calls keep numbers monotonic.
- **Failure**: the first throwing system stops the loop for that tick; remaining systems in
  that tick are not called; the counter does not advance; `isStopped` is set and `lastError`
  records the thrown value; the error propagates out of the driving call. Later
  `update`/`step` rethrow the same value without touching the clock or systems.
- **`reset()`**: clears `stopped`/`error`, zeroes the counter, and calls `clock.reset()` so
  the next `update` re-anchors (returning 0) and the next `step` starts numbering at 1.
- **`isRunning`**: delegates to `clock.isRunning`.

## Failure modes

- Invalid options → construction throw (never a silent partial state).
- System throws mid-tick → process stops; failed tick uncounted; error rethrown; state
  preserved for inspection via `lastError`/`isStopped`.
- Clock throws → propagates like a system failure path (caller-visible; process does not
  swallow it).
- Caller continues after failure without `reset()` → every drive call rethrows the stored
  error (no silent drift).

## Compatibility/migration

Additive. New exported names (`WorldTickProcess`, `TickSystem`, `WorldTickProcessOptions`);
no existing symbol changes. SimulationClock's public surface is untouched (only consumed).

## Performance/resource constraints

- Per tick: O(systems) calls; no allocation (no per-tick arrays/objects).
- Per drive call: O(1) besides the clock's own accumulator work.
- Memory: O(systems) captured at construction, constant thereafter.

## Testing seams

- Scripted time through a real `SimulationClock` (pure, headless) — no fakes needed.
- Injected clock with a custom `maxTicksPerFrame` (e.g. 2) to pin bounded catch-up.
- Recording systems (arrays capturing `(tick)` calls) to assert order, counts, and numbers.
- Determinism: two processes with identical systems driven by identical scripted schedules
  record identical call sequences.

## Observability/debugging

- `tick` getter: deterministic progress.
- `isRunning`/`isStopped`/`lastError`: exact process state after any failure; error messages
  are the descriptive `WorldTickProcess: ...` strings.

## Affected files/symbols

- NEW `src/simulation/WorldTickProcess.ts` — `TickSystem`, `WorldTickProcessOptions`,
  `WorldTickProcess`.
- NEW `tests/unit/WorldTickProcess.test.ts`.
- Read-only: `src/engine/SimulationClock.ts` (imported), `src/simulation/SimulationHarness.ts`
  (conventions), `src/engine/Game.ts` (unchanged).
- Docs/state: `openspec/PROGRAM_STATE.json`, `openspec/PROGRAM_STATE.md`.

## Rejected alternatives

- **Place in `src/engine/`** beside `GameLoop`/`SimulationClock`: rejected — the process is
  pure simulation-driving logic that must be client/server-shareable per 222's boundary, and
  `engine/` is the browser-coupled layer; `simulation/` is the shareable package. The single
  cross-import (`../engine/SimulationClock`) is safe because that module is pure and
  headless-safe.
- **Required clock option (no default)**: rejected — the process should own its clock;
  callers (future server) construct it without assembling parts.
- **`stepUntil`/snapshot/restore on the process**: rejected — 055 already covers test-side
  condition stepping and replay; adding them here duplicates scope for a later change.
- **`maxTicksPerFrame` as a process option**: rejected — the clock already owns that knob;
  injecting a clock with the desired cap is the single configuration path.
- **Invalid `step(times)` arguments throw**: rejected — 055's no-op convention is the
  established precedent and keeps callers simple.

## Downstream dependencies

- 225 `connection-lifecycle` and later server changes will drive the tick process as the
  authoritative server simulation loop.
- 228+ client prediction/reconciliation will lean on its deterministic tick numbering.
- `SimulationHarness` (055) remains the test-side replay tool; the process is its production
  counterpart.
