# Spec: fixed-20tps-clock

## Contract

The simulation MUST advance on a canonical fixed 20 TPS (50 ms) timestep decoupled from render FPS. A
`SimulationClock` MUST accumulate frame deltas from supplied timestamps, emit exactly whole ticks,
bound catch-up per frame, and expose deterministic counters. The clock MUST be pure (a function of the
supplied timestamps only) and must not depend on timers or a browser clock.

## Definitions

- **Tick**: one 50 ms simulation step (`TICK_MS`).
- **update(nowMs)**: feed one render frame timestamp; returns the number of ticks to run.
- **maxTicksPerFrame**: the maximum ticks a single `update` may emit (default 10).

## Invariants

- `TICK_RATE = 20`, `TICK_MS = 50`.
- `update` emits `floor(accumulated / TICK_MS)` ticks, at most `maxTicksPerFrame`; remainder stays
  accumulated; after a capped frame the accumulator is < `TICK_MS`.
- Delta is clamped to `>= 0`; the first `update` after construction/reset anchors the clock with 0 ticks.
- `totalTicks`/`totalMs` advance by exactly the emitted ticks and `ticks * TICK_MS`.
- Non-finite timestamps are ignored (0 ticks, state unchanged).

## Requirements

### Requirement: exact whole-tick emission
`update(nowMs)` MUST return exactly the number of whole 50 ms ticks due for the elapsed time.

#### Scenario: regular frames
- **GIVEN** a fresh clock
- **WHEN** `update(50)`, `update(100)`, `update(125)` are called
- **THEN** the returned counts are `1`, `1`, `0`, and the accumulator holds 25 ms.

### Requirement: frame-rate independence
Equal elapsed wall time MUST produce equal total ticks regardless of frame partitioning.

#### Scenario: irregular frames
- **GIVEN** a fresh clock
- **WHEN** fed `10 × 50 ms` frames, then reset, then `5 × 100 ms` frames, then reset, then
  `4 × 125 ms` frames
- **THEN** each run yields `10` total ticks and `500` total simulated ms.

### Requirement: bounded catch-up
A single `update` with a very large delta MUST emit at most `maxTicksPerFrame` ticks and MUST cap the
accumulator so the next frame starts below one tick.

#### Scenario: long stall
- **GIVEN** a clock with `maxTicksPerFrame = 10`
- **WHEN** `update(0)` then `update(5000)`
- **THEN** the second call returns `10`, `totalTicks` is `10`, and `accumulatorMs < 50`.

### Requirement: backward time is safe
`update(nowMs)` with `nowMs` less than the previous timestamp MUST return `0` and MUST NOT corrupt
state.

#### Scenario: clock jump back
- **GIVEN** a clock after `update(1000)`
- **WHEN** `update(500)` then `update(1050)` run
- **THEN** the first returns `0` and the second returns `1` (as if only 50 ms elapsed since 1000).

### Requirement: first update and reset anchor the clock
The first `update` after construction or `reset()` MUST return `0` (no catch-up burst).

#### Scenario: anchoring
- **GIVEN** a fresh clock
- **WHEN** `update(12345)` runs, then `reset()` and `update(9999)` run
- **THEN** both first updates return `0`; `totalTicks` is `0` after each.

## Error and failure behavior

- Non-finite `nowMs` → returns `0`, state unchanged.
- Backward delta → clamped to `0`.

## Performance and resource bounds

`update` is O(1); the emission loop is bounded by `maxTicksPerFrame`.

## Compatibility and migration

Additive; no existing behavior changes, no consumers yet.

## Security and integrity

Deterministic fixed timestep prevents frame-rate-dependent simulation drift; bounded catch-up prevents
spiral-of-death stalls.

## Observability

`totalTicks`, `totalMs`, `accumulatorMs`, `isRunning` expose clock state.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Exact whole-tick emission | 50/100/125 ms sequence counts |
| Frame-rate independence | 10×50 vs 5×100 vs 4×125 → 10 ticks / 500 ms |
| Bounded catch-up | 5000 ms frame → ≤ maxTicksPerFrame ticks, accumulator < TICK_MS |
| Backward time safe | jump-back returns 0, later frames correct |
| First update / reset anchor | first updates return 0, totalTicks 0 |
