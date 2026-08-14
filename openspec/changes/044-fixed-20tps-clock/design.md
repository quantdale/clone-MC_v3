# Design: 044-fixed-20tps-clock

## Context / current state

`GameLoop` drives rendering; simulation steps run per render frame, so sim speed varies with FPS.
There is no fixed-timestep clock.

## Target state

A `SimulationClock` accumulates frame deltas and emits exactly whole 50 ms ticks (20 TPS). The render
loop calls `update(nowMs)` each frame; the returned count is how many fixed simulation ticks to run.
Catch-up is bounded (`maxTicksPerFrame`, default 10) and the accumulator is capped after a stall, so
the sim stays deterministic and cannot spiral.

## Invariants

- `TICK_RATE = 20`; `TICK_MS = 50`.
- `update(nowMs)` returns `floor((accumulator + delta) / TICK_MS)` bounded by `maxTicksPerFrame`; the
  remainder stays in the accumulator.
- Delta is clamped to `>= 0` (backward time yields 0 ticks and does not corrupt state).
- After emitting `maxTicksPerFrame` ticks in one `update`, any remaining accumulated time is capped to
  `TICK_MS - 1` so the next frame starts fresh.
- `totalTicks`/`totalMs` increase by exactly `ticks` and `ticks * TICK_MS` per `update`.
- The first `update` after construction or `reset()` anchors the clock (0 ticks).
- All state transitions are pure functions of the supplied timestamps.

## API and data model

```ts
// src/engine/SimulationClock.ts
export const TICK_RATE = 20;
export const TICK_MS = 50;
export interface SimulationClockOptions {
  /** Maximum ticks emitted per update (default 10). */
  maxTicksPerFrame?: number;
}
export class SimulationClock {
  constructor(opts?: SimulationClockOptions);
  update(nowMs: number): number; // returns ticks to run this frame
  get totalTicks(): number;
  get totalMs(): number;
  get accumulatorMs(): number;
  get isRunning(): boolean;      // true after the first update
  reset(): void;
}
```

## Control / data flow

1. Render loop calls `update(nowMs)` every frame with a monotonic timestamp.
2. `delta = max(0, nowMs - lastTime)`; on the first call `lastTime = nowMs`, returns `0`.
3. `accumulator += delta`; emit `ticks = min(floor(accumulator / TICK_MS), maxTicksPerFrame)`;
   `accumulator -= ticks * TICK_MS`; if `accumulator >= TICK_MS` after the cap, set it to
   `TICK_MS - 1`.
4. The game runs its simulation tick `ticks` times; `totalTicks`/`totalMs` already reflect them.

## Detailed behavior

- `update` with `nowMs < lastTime` (clock jump) returns 0 and keeps `lastTime` unchanged.
- A very long stall (e.g. 5000 ms) emits at most 10 ticks and caps the accumulator, so the sim never
  tries to run 100 ticks in one frame.
- `reset()` clears accumulator/lastTime/totalTicks/totalMs (isRunning false).

## Failure modes

- Non-finite `nowMs` (NaN/Infinity): treated as a no-op (returns 0, state unchanged).
- Backward time: clamped, no negative ticks.

## Compatibility / migration

Additive; no consumers yet. `GameLoop`/`Game` wiring is a later consumer change.

## Performance / resource constraints

`update` is O(1) (the tick loop is bounded by `maxTicksPerFrame`).

## Testing seams

- `tests/unit/SimulationClock.test.ts`: scripted timestamps.
  - 50 ms → 1 tick; 100 ms → 2; 25 ms → 0 then 25 ms → 1 (remainder accumulates);
  - frame-rate independence: 10×50 ms and 5×100 ms and 4×125 ms all yield 10 ticks / 500 ms;
  - bounded catch-up: 5000 ms frame → exactly `maxTicksPerFrame` ticks and `accumulatorMs < TICK_MS`;
  - backward time → 0 ticks, state intact;
  - first update → 0 ticks; reset → same;
  - totalMs === totalTicks * TICK_MS always.

## Observability / debugging

`totalTicks`, `totalMs`, `accumulatorMs`, `isRunning` expose the clock state for debug overlays.

## Affected files / symbols

- `src/engine/SimulationClock.ts` — NEW.
- `tests/unit/SimulationClock.test.ts` — NEW.

## Rejected alternatives

- *Variable timestep simulation*: non-deterministic across frame rates; the fixed accumulator is the
  canonical Minecraft-like approach.
- *`requestAnimationFrame`-driven timers inside the clock*: couples the clock to the browser; injected
  timestamps keep it pure and headless-testable.

## Downstream dependencies

045 (render interpolation) consumes `totalMs`/`accumulatorMs`; 046 (pause) gates `update`; 047+
scheduled-tick systems run inside the fixed tick emitted here.
