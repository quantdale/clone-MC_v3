# Spec: world-tick-process

## Contract

A production headless authoritative world tick process: an object that owns a fixed-timestep
clock and a completed-tick counter, ticks an ordered set of systems exactly once per tick with
monotonic 1-based tick numbers, is drivable by wall time or directly, stops and surfaces the
error when a system throws, and has no DOM/browser dependency. Sections on Security and
observability below are small because the module performs no IO and holds no credentials;
they are included for completeness.

## Definitions

- **Tick**: one fixed 50 ms simulation step (SimulationClock's `TICK_MS`).
- **Completed tick**: a tick in which every system returned without throwing.
- **Tick number**: the 1-based number passed to systems, `completedTicks + 1` at call time.
- **Driving call**: `update(nowMs)` or `step(times)`.
- **Clock surface**: `update(nowMs) -> number of ticks to run`, `isRunning`, `reset()`
  (satisfied by `SimulationClock`).

## Invariants

- Systems are ticked in registration order, exactly once per completed tick.
- Tick numbers are strictly increasing until `reset()`, and restart at 1 after `reset()`.
- A failed tick is never counted as completed.
- After a failure the process is stopped and every driving call rethrows the recorded error
  until `reset()`.
- The process never ticks systems outside a driving call.

## Requirements

### Requirement: construction and option validation

`new WorldTickProcess(options?)` MUST construct a working process with no options (empty
systems, fresh default clock). It MUST accept `systems` as an array of tickable objects
(each with a callable `tick`) and `clock` as an object satisfying the clock surface. It MUST
reject, with a descriptive `WorldTickProcess: <detail>` throw: a non-array `systems`; an
array entry that is not a tickable object (missing or non-callable `tick`); a `clock` that
does not satisfy the clock surface. A rejected construction MUST NOT yield a partially
usable process.

#### Scenario: default construction
- **GIVEN** no arguments
- **WHEN** `new WorldTickProcess()` is evaluated
- **THEN** the process constructs with zero systems, a fresh clock, `tick === 0`,
  `isStopped === false`, `lastError === null`

#### Scenario: invalid systems value
- **GIVEN** `options.systems = "nope"` (a string)
- **WHEN** the process is constructed
- **THEN** a `WorldTickProcess: ...` error is thrown

#### Scenario: non-tickable entry
- **GIVEN** `options.systems = [{ tick: "nope" }, { tick: (t) => {} }]`
- **WHEN** the process is constructed
- **THEN** a `WorldTickProcess: ...` error is thrown and no process exists

#### Scenario: invalid clock
- **GIVEN** `options.clock = { update: 42 }`
- **WHEN** the process is constructed
- **THEN** a `WorldTickProcess: ...` error is thrown

### Requirement: wall-time ticking

`update(nowMs)` MUST feed the timestamp to the clock, run exactly the number of ticks the
clock emits, call each system once per tick in registration order with 1-based tick numbers,
and return the number of ticks run. The first `update` anchors the clock and MUST return 0
without ticking. Non-finite or backward timestamps MUST return 0 without ticking.

#### Scenario: scripted batching
- **GIVEN** a process with two recording systems
- **WHEN** `update(1000)` then `update(1050)` are called
- **THEN** the first call returns 0, the second returns 1, and both systems record exactly
  one call each with tick number 1

#### Scenario: one call, many ticks
- **GIVEN** a process with one recording system and a clock fresh-anchored at 1000
- **WHEN** `update(1000 + 5 * 50)` is called
- **THEN** it returns 5 and the system records tick numbers 1, 2, 3, 4, 5 in order

#### Scenario: registration order
- **GIVEN** a process with systems A then B
- **WHEN** one tick runs
- **THEN** A records the tick before B does

### Requirement: bounded catch-up

The number of ticks run per `update` MUST be bounded by the clock's `maxTicksPerFrame`
(default 10). After a capped call the clock remainder MUST be below one tick, so a
subsequent small advance produces at most one tick and no catch-up spiral.

#### Scenario: huge lapse is capped
- **GIVEN** a process whose clock has `maxTicksPerFrame: 2`, anchored at 1000
- **WHEN** `update(1000 + 10 * 50)` is called, then `update(previous + 50)`
- **THEN** the first call returns 2 and the second returns 1 (the remainder was capped)

### Requirement: direct stepping

`step(times = 1)` MUST run exactly `times` ticks without consulting the clock, return the
number of ticks run, and keep tick numbers continuous with any `update`-driven ticks.
Non-integer or `<= 0` `times` MUST be a no-op returning 0.

#### Scenario: step three
- **GIVEN** a process with one recording system
- **WHEN** `step(3)` is called
- **THEN** it returns 3 and the system records tick numbers 1, 2, 3

#### Scenario: invalid step arguments
- **GIVEN** a process with one recording system
- **WHEN** `step(0)`, `step(-2)`, and `step(2.5)` are each called
- **THEN** each returns 0 and the system records no calls

#### Scenario: default step argument
- **GIVEN** a process with one recording system
- **WHEN** `step()` is called
- **THEN** it returns 1 and the system records tick number 1

#### Scenario: interleaved stepping
- **GIVEN** a process with one recording system
- **WHEN** `step(2)` then `update` (clock-fed, one tick) then `step(1)` are called
- **THEN** the system records tick numbers 1, 2, 3, 4 in order

### Requirement: counter, clock state, and reset

`tick` MUST equal the number of completed ticks. `isRunning` MUST follow the clock's
anchored state (false before the first `update` and after `reset()`). `reset()` MUST clear
`isStopped`/`lastError`, zero the counter, and reset the clock so the next `update`
re-anchors returning 0 and the next `step` restarts numbering at 1.

#### Scenario: counter and reset
- **GIVEN** a process with one recording system after `step(3)`
- **WHEN** `reset()` then `step(2)` are called
- **THEN** before reset `tick === 3`; after reset `tick === 0` and `isRunning === false`;
  the second step records tick numbers 1, 2 again

### Requirement: failure behavior

If a system throws during a tick, the process MUST stop (`isStopped === true`), record the
thrown value in `lastError`, NOT count the failed tick, and rethrow the value from the
driving call. Systems later in the failed tick's registration order MUST NOT be called.
Every subsequent driving call MUST rethrow the same recorded value without running any
systems until `reset()`, after which ticking resumes normally.

#### Scenario: mid-tick failure
- **GIVEN** a process with systems A (records), B (throws `boom` on tick 2), C (records)
- **WHEN** `step(2)` is called
- **THEN** `step` rethrows `boom`; A recorded tick numbers 1 and 2; C recorded only tick 1;
  `tick === 1`; `isStopped === true`; `lastError === boom`

#### Scenario: failure persists until reset
- **GIVEN** the process from the previous scenario (stopped with `boom`)
- **WHEN** `step(1)` then `update(1234)` are called
- **THEN** both rethrow `boom` and the counter stays at 1; after `reset()` a fresh `step(1)`
  returns 1 and A records tick number 1 again

## Error and failure behavior

- Construction rejections: `WorldTickProcess: <detail>` describing the invalid option and
  index when applicable. No partial process escapes.
- Runtime failure: the first throwing system aborts the tick; the error propagates
  unchanged out of the driving call; the process records it and refuses further ticks until
  `reset()`.
- Clock-driven no-ops (non-finite timestamps, backward time, first-call anchoring) never
  count as ticks and never call systems.

## Performance and resource bounds

- One tick is O(systems) calls with zero allocation; drive calls are O(1) beyond the clock's
  accumulator work; memory is O(systems) captured at construction.
- No timers, no IO, no DOM, no network — the process is inert unless driven.

## Compatibility and migration

Additive: new exported names only; no existing module, registry, save format, or public API
changes. `SimulationClock` is consumed unchanged. No migration needed.

## Security and integrity

- No external inputs besides numeric timestamps and the caller-supplied systems; no
  credential, storage, or network access, so there is no attack surface.
- Integrity: failed ticks are never counted, so a stopped process cannot drift its counter.

## Observability

- `tick` (progress), `isRunning` (clock anchored), `isStopped` + `lastError` (exact failure
  state). No logging; callers observe through these getters and thrown errors.

## Verification mapping

| Requirement | Evidence |
|---|---|
| REQ construction and option validation | `tests/unit/WorldTickProcess.test.ts` › construction/validation |
| REQ wall-time ticking | › update-driven ticking |
| REQ bounded catch-up | › bounded catch-up |
| REQ direct stepping | › stepping |
| REQ counter, clock state, and reset | › counter/reset |
| REQ failure behavior | › failure behavior |
