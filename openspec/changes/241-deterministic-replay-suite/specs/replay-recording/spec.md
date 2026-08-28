# Spec: replay-recording

## Contract

A replay recording is plain, serializable data that fully determines a headless simulation run: the
world seed, the `maxTick` to run, the input events applied before each tick, and the named RNG-stream
states at the start of every tick. `validateReplayRecording` MUST accept exactly the documented shape
and MUST reject malformed or partial recordings with descriptive errors, never returning a partial
recording. A `ReplayRecorder` MUST capture inputs and per-tick seed states from a driven scenario and
MUST be deterministic (the same scenario captured twice yields structurally equal recordings).

## Definitions

- **Input event**: `{ tick, seq, type, payload }` — `tick` 0 means pre-simulation setup applied before
  tick 1, otherwise a 1-based tick; `seq` orders events within a tick; `type` is a non-empty string;
  `payload` is JSON-serializable plain data.
- **Tick seed**: `{ tick, seeds }` — the `SeedRng` named-stream states (each `{ stream, state }`) at the
  start of a tick, where `state` is a uint32.
- **Recording**: `{ version, schema, initialSeed, maxTick, inputs, tickSeeds }`.

## Invariants

- `version` is a positive integer; `schema` is non-empty; `initialSeed` is a uint32; `maxTick` is a
  positive integer.
- `inputs` are sorted ascending by `(tick, seq)` and contain no duplicate `(tick, seq, type, payload)`.
- `tickSeeds` contain exactly one entry per tick in `[1, maxTick]`, sorted ascending by tick, with
  unique stream names per tick and uint32 states.
- Validation rejects atomically: on failure the recording is neither returned nor partially mutated.
- Recorder capture of the same scenario is deterministic.

## Requirements

### Requirement: recording shape validation
`validateReplayRecording` MUST accept a recording whose fields all satisfy the documented shape, and
MUST reject, with a descriptive `ReplayRecording: <detail>` error and no partial result, any recording
with an invalid `version`, `schema`, `initialSeed`, or `maxTick`.

#### Scenario: valid recording
- **GIVEN** a recording with `version: 1`, a non-empty `schema`, `initialSeed: 42`, `maxTick: 3`,
  empty `inputs`, and `tickSeeds` carrying exactly one `{ stream, state }` entry for each tick in
  `[1, maxTick]` — for example
  `[{ tick: 1, seeds: [{ stream: 'mob-spawn', state: 100 }] }, { tick: 2, seeds: [{ stream: 'mob-spawn', state: 200 }] }, { tick: 3, seeds: [{ stream: 'mob-spawn', state: 300 }] }]`
- **WHEN** `validateReplayRecording` runs
- **THEN** it returns the recording unchanged (narrowed to `ReplayRecording`).

#### Scenario: invalid top-level fields
- **GIVEN** recordings with `version: 0`, an empty `schema`, `initialSeed: -1`, `initialSeed: 1.5`,
  and `maxTick: 0` respectively
- **WHEN** validation runs on each
- **THEN** each throws a `ReplayRecording: ...` error naming the offending field, and no recording is
  produced.

### Requirement: input event validation
Each input event MUST have an integer `tick` in `[0, maxTick]`, a non-negative integer `seq`, a
non-empty string `type`, and a JSON-serializable `payload`. `inputs` MUST be sorted ascending by
`(tick, seq)`. A duplicate `(tick, seq, type, payload)` MUST be rejected. Rejection MUST be atomic and
name the offending event index and field.

#### Scenario: invalid inputs
- **GIVEN** a recording whose inputs include a negative `seq`, a `tick` of `maxTick + 1`, a fractional
  `tick`, an empty `type`, and a `payload` that is a function
- **WHEN** validation runs
- **THEN** each case throws a descriptive error and no partial recording is returned.

#### Scenario: unordered or duplicate inputs
- **GIVEN** a recording whose `inputs` are out of `(tick, seq)` order, and separately one with two
  identical input events
- **WHEN** validation runs on each
- **THEN** each throws and nothing is returned.

### Requirement: full tick-seed coverage and validation
`tickSeeds` MUST contain exactly one entry per tick in `[1, maxTick]`, each with an integer `tick`, a
`seeds` array whose stream names are non-empty and unique within the tick, and uint32 `state` values.
`tickSeeds` MUST be sorted ascending by `tick`. A missing tick, a duplicate tick, an extra tick, a
duplicate stream name, or a `state` outside `[0, 0xffffffff]` MUST be rejected atomically.

#### Scenario: missing tick seed
- **GIVEN** a recording with `maxTick: 3` whose `tickSeeds` contain only ticks 1 and 2
- **WHEN** validation runs
- **THEN** it throws a `missing_seed`-class error for tick 3 and returns nothing.

#### Scenario: duplicate stream in a tick
- **GIVEN** a tick seed whose `seeds` lists `{ stream: 'a', state: 1 }` twice
- **WHEN** validation runs
- **THEN** it throws and nothing is returned.

#### Scenario: out-of-range or unordered seeds
- **GIVEN** a tick seed with `state: 0x100000000`, and separately a `tickSeeds` array in descending
  tick order
- **WHEN** validation runs on each
- **THEN** each throws and nothing is returned.

### Requirement: input application timing
An input event with `tick: T` MUST be applied before tick `T` runs and MUST NOT affect any tick earlier
than `T`. Inputs with `tick: 0` MUST be applied once before tick 1. Within a tick, inputs MUST be
applied in ascending `seq` order.

#### Scenario: tick-2 input does not affect tick 1
- **GIVEN** a recording with an input at `tick: 2`
- **WHEN** the authoritative state after tick 1 is captured
- **THEN** it equals the state of a recording with no inputs at all.

#### Scenario: tick-0 setup input
- **GIVEN** a recording with an input at `tick: 0`
- **WHEN** the authoritative state after tick 1 is captured
- **THEN** it reflects the setup input (differs from a run without that input).

### Requirement: deterministic recorder capture
A `ReplayRecorder` MUST capture inputs equal to the events recorded and tick seeds equal to the actual
named-stream `state` values at the start of each tick. Capturing the same scenario twice MUST yield
structurally equal recordings.

#### Scenario: repeated capture
- **GIVEN** the same scenario driven twice through a fresh recorder each time
- **WHEN** `capture()` is called on both
- **THEN** the two recordings are structurally equal, and the recorded seed states equal the actual
  `SeedRng.state` values at the corresponding tick starts.

## Error and failure behavior

- All validation failures throw `ReplayRecording: <detail>` and never mutate or return partial state.
- Missing/partial tick-seed coverage is a validation rejection (`missing_seed`), never a silent pass.
- `capture()` on a recorder with an invalid accumulated state throws rather than emitting a malformed
  recording.

## Performance and resource bounds

Validation is O(inputs + tickSeeds + maxTick). Recordings are plain data; no allocations beyond the
validated arrays. The suite is test-only and not on hot paths.

## Compatibility and migration

Additive. `version` is a recording-format integer; future format changes MUST increment it and the
verifier MUST refuse to run an unsupported `version` (see replay-verification spec). No existing
module, save format, or public API changes.

## Security and integrity

Payloads are JSON-serializable plain data only; validation rejects functions, symbols, `bigint`, class
instances, and cyclic values so recordings are deterministic and safely serializable. Validate-before-
return prevents a corrupt recording from reaching the verifier.

## Observability

Validation errors name the offending field and event/tick index; recorder state is plain data
inspectable for debugging.

## Verification mapping

| Requirement | Test |
|---|---|
| Recording shape validation | `tests/unit/ReplayRecording.test.ts` — valid recording; invalid top-level fields |
| Input event validation | invalid inputs matrix; unordered/duplicate inputs |
| Full tick-seed coverage and validation | missing seed; duplicate stream; out-of-range/unordered seeds |
| Input application timing | tick-2 input vs tick-1 state; tick-0 setup input |
| Deterministic recorder capture | repeated capture equal; captured seeds match actual states |
