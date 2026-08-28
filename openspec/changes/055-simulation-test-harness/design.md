# Design: 055-simulation-test-harness

## Context / current state

Individual primitives (044-054) are unit-tested; no headless harness steps multiple systems together
deterministically.

## Target state

A `SimulationHarness` owns an integer tick counter and a list of `HarnessSystem`s. `step(n)` ticks
systems in registration order for `n` ticks. `snapshot`/`restore` provide deterministic replay;
`stepUntil` bounds condition-driven stepping; `reset`/`run` manage sessions.

## Invariants

- `step(n)` advances `tick` by exactly `n` (n ≥ 1) and calls each system's `tick(t)` with the exact
  tick number, in registration order.
- `snapshot()` returns `{ tick, systems: unknown[] }` where each system's `snapshot()` result is
  stored; `restore(snapshot)` validates the shape and restores the counter + each system (validate
  before mutate).
- Restoring a snapshot and stepping produces results identical to a fresh run that reached the same
  snapshot (deterministic replay).
- `stepUntil(predicate, maxSteps)` returns the number of steps taken, stops as soon as the predicate
  is true, and never exceeds `maxSteps`.
- `reset()` restores `initialTick` and calls each system's `restore` with its initial snapshot.

## API and data model

```ts
// src/simulation/SimulationHarness.ts
export interface TickableSystem { tick(tick: number): void; }
export interface HarnessSystem extends TickableSystem {
  snapshot(): unknown;
  restore(state: unknown): void;
}
export interface HarnessSnapshot { tick: number; systems: unknown[]; }
export interface SimulationHarnessOptions {
  systems: HarnessSystem[];
  initialTick?: number;   // default 0
}
export class SimulationHarness {
  constructor(opts: SimulationHarnessOptions);
  step(times?: number): void; // default 1
  stepUntil(predicate: (tick: number) => boolean, maxSteps: number): number;
  get tick(): number;
  snapshot(): HarnessSnapshot;
  restore(snapshot: HarnessSnapshot): void;
  reset(): void;
  run(fn: (harness: SimulationHarness) => void): void; // reset → fn → restore pre-run snapshot
}
```

## Control / data flow

1. Test constructs the harness with fixture systems.
2. `step(n)`: for each of the next `n` ticks, increment `tick` and call every system's `tick(tick)` in
   registration order.
3. `snapshot()`: capture `tick` and per-system `snapshot()` results (fresh objects required by the
   system contract).
4. `restore(s)`: validate shape/counts first, then set `tick` and call each system's `restore`.
5. `stepUntil`: loop `step(1)` until `predicate(tick)` or `maxSteps` reached.
6. `run(fn)`: snapshot, `reset()`, `fn(this)`, then `restore(snapshot)` — scoped, side-effect-free
   sessions.

## Detailed behavior

- `restore` throws on malformed snapshots (wrong shape or system count) without mutating state.
- `step` with `times <= 0` is a no-op.

## Failure modes

- Malformed snapshot → `Error`; harness unchanged.
- A system's `tick`/`snapshot`/`restore` throwing propagates (test failure surfaces directly).

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

O(systems × ticks) per step; snapshots are O(systems).

## Testing seams

- `tests/unit/SimulationHarness.test.ts` with a `RecordingSystem` (records tick numbers; snapshot =
  `{ count }`):
  - step advances tick exactly and ticks systems in order with exact tick numbers;
  - `step(3)` counts match; `step(0)` no-op;
  - replay determinism: `snapshot` → `step(5)` → `snapshot'`; `restore(snapshot)` → `step(5)` →
    `snapshot'` equal;
  - `stepUntil` stops at the predicate tick with exact count and at `maxSteps` otherwise;
  - `reset` restores initial tick/system state; `run` leaves the harness unchanged afterward;
  - malformed `restore` rejected without mutation.

## Observability / debugging

`tick` and snapshots expose the exact simulation position.

## Affected files / symbols

- `src/simulation/SimulationHarness.ts` — NEW.
- `tests/unit/SimulationHarness.test.ts` — NEW.

## Rejected alternatives

- *Reusing the 044 clock*: the harness needs integer tick stepping independent of wall time; a
  counter is the minimal deterministic model.
- *Deep-cloning snapshots*: system-owned `snapshot()`/`restore()` keep the contract with the systems
  themselves.

## Downstream dependencies

Fluid (076-084), redstone (154-173), and mob (129+) tests step through this harness; 241 (replay)
uses `snapshot` as the determinism hook.
