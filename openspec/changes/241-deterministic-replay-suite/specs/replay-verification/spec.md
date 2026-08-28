# Spec: replay-verification

## Contract

`runRecording` MUST replay a validated recording against a fresh headless world and reproduce an
authoritative state hash for every tick `1..maxTick`, seeding named streams from the recorded tick
seeds and applying recorded inputs at the correct ticks. Replaying the same recording twice MUST yield
identical traces (cross-run stability). `compareHashes` MUST report the first divergence (hash, seed,
version, system-failure, or missing-seed) without throwing on a mismatch, and MUST refuse cross-version
comparisons. Determinism breaks and missing/partial recordings MUST be diagnosed, never silently
passed.

## Definitions

- **Trace**: `{ version, ticks }` where `ticks` is `{ tick, hash }` for each tick `1..maxTick`; `hash`
  is `hashState` of the authoritative snapshot after that tick.
- **Authoritative snapshot**: the 055 `HarnessSnapshot` `{ tick, systems }` (see state-hash-scheme spec).
- **Divergence**: the first element of a comparison that is not identical, classified as `hash`,
  `seed_mismatch`, `version_mismatch`, `system_failure`, or `missing_seed`.

## Invariants

- `runRecording` produces exactly one `{ tick, hash }` per tick in `[1, maxTick]`.
- A recording is validated (full tick-seed coverage) before any tick runs; a partial recording is
  rejected before execution.
- The verifier MUST NOT compare traces or fixtures under different `REPLAY_HASH_VERSION`.
- A mismatch is reported, never thrown; system failures are surfaced as `system_failure` with the tick.
- Identical recording + identical world configuration → identical trace.

## Requirements

### Requirement: reproduce authoritative hashes
`runRecording` MUST produce, for every tick `T` in `[1, maxTick]`, a `{ tick: T, hash }` where `hash`
equals `hashState` of the authoritative snapshot after applying the tick-0 setup inputs, the recorded
inputs for ticks `1..T` in ascending `seq` order, and the recorded seeds for ticks `1..T`.

#### Scenario: recorded run reproduces expected hashes
- **GIVEN** a validated recording whose recorded run was captured from a real scenario with known hashes
- **WHEN** `runRecording` executes it against a fresh world
- **THEN** the returned trace contains one entry per tick `1..maxTick` and each entry's hash equals the
  recorded authoritative hash for that tick.

### Requirement: cross-run reproducibility
Replaying the same recording twice from a fresh world MUST yield identical traces.

#### Scenario: two fresh runs
- **GIVEN** a recording
- **WHEN** `runRecording` runs it twice, each time constructing a fresh world
- **THEN** the two traces are equal, tick-for-tick and hash-for-hash.

### Requirement: deterministic seeding
Before each tick `T`, the verifier MUST seed every named stream listed in `tickSeeds[T]` to its recorded
uint32 `state` so the streams used during tick `T` equal the recorded states. If a recorded stream state
no longer matches the state the authoritative run derives at that point, the verifier MUST report a
`seed_mismatch` divergence (determinism break) at that tick with the stream name, expected, and actual —
never a silent pass.

### Requirement: shared stream ownership and injection
The recorded tick seeds are **pre-tick states** (the named-stream `SeedRng.state` captured at the start
of each tick, before that tick runs). The verifier MUST expose a single, explicit ownership API — the
injectable `seedStreams(stream, state) => SeedRng` factory in `ReplayRunnerOptions` — through which
**both** the verifier and the simulation systems obtain every named stream. Systems MUST NOT construct
or consume named streams through an unrelated closure or a verifier-local map invisible to production
code. The `seedStreams` factory is the governed source of truth: the verifier calls it once per
`(stream, state)` at the start of each tick, and the same returned `SeedRng` instance is the one the
systems consume during that tick. This makes the integration path identical to the one production
systems would use, so a test passing on the verifier cannot mask a system that reads a different stream
instance.

#### Scenario: correct seeding
- **GIVEN** a recording whose tick seeds record `{ stream: 'mob-spawn', state: 12345 }` at tick 2
- **WHEN** `runRecording` replays it and the harness exposes the `mob-spawn` stream used during tick 2
- **THEN** that stream's state equals `12345`.

#### Scenario: systems consume the governed stream
- **GIVEN** a `ReplayRunnerOptions.seedStreams` factory that records every `(stream, state)` it is asked
  to create
- **WHEN** a system reads its named stream during a tick
- **THEN** the system receives the exact `SeedRng` instance the verifier created from that factory for
  that tick's recorded state, not a separately constructed stream.

#### Scenario: recorded seed no longer reproduces
- **GIVEN** a recording whose recorded seed for a stream at tick `T` does not match what the authoritative
  run derives (a determinism break)
- **WHEN** `runRecording` (or a comparison) executes
- **THEN** the first divergence is a `seed_mismatch` naming tick `T`, the stream, and expected vs actual
  states; it does not report a plain hash divergence for a later tick.

### Requirement: divergence diagnosis
`compareHashes` MUST report the first mismatching tick with the expected vs actual hash, and MUST NOT
throw on a mismatch. For identical traces it MUST report `identical: true` and no divergence. Empty
traces (zero ticks) MUST be handled without error.

#### Scenario: single divergence
- **GIVEN** expected and actual traces equal for ticks 1-2 and differing at tick 3
- **WHEN** `compareHashes` runs
- **THEN** it reports `identical: false`, `firstDivergence = { kind: 'hash', tick: 3, expected, actual }`.

#### Scenario: identical and empty traces
- **GIVEN** two identical traces, and separately two traces with empty `ticks` arrays
- **WHEN** `compareHashes` runs on each pair
- **THEN** the identical pair reports `identical: true` with no divergence, and the empty pair reports
  `identical: true` without error.

### Requirement: expected-failure versus unexpected-success comparison
A recording/fixture whose expected outcome is a failure (for example an expected `system_failure`,
`seed_mismatch`, or `version_mismatch` divergence) MUST NOT compare as `identical` to an actual run that
completes successfully with matching per-tick hashes. The comparison MUST inspect the outcome class
(failure vs success), not only the hash sequence: if the expected trace is a failure but the actual
trace is a success (or vice versa), `compareHashes` MUST report a divergence whose `kind` reflects the
mismatch in outcome class, even when every produced hash is equal. Hash alignment alone is never
sufficient to call a failure-expecting recording "identical".

#### Scenario: expected failure cannot equal unexpected success
- **GIVEN** an expected trace that ends in a `system_failure` at tick `T`, and an actual trace that runs
  to completion with per-tick hashes identical to the expected trace's pre-failure hashes
- **WHEN** `compareHashes` runs
- **THEN** it reports `identical: false` with a divergence whose `kind` distinguishes the failure outcome
  from the successful outcome (for example `system_failure` vs a `success_mismatch`), never `identical:
  true`.

#### Scenario: success cannot satisfy a failure-expecting recording
- **GIVEN** a fixture whose `expectedHashes` assume a full successful run but whose recording is marked
  as expecting a `seed_mismatch` at tick `T`
- **WHEN** `runRecording`/`compareHashes` execute against a world that actually completes successfully
- **THEN** the comparison reports a divergence in outcome class rather than declaring the recording
  verified.

### Requirement: failure and version handling
A system throwing during replay MUST be surfaced as a `system_failure` divergence naming the tick where
the throw occurred, and the remaining ticks MUST NOT be hashed. `runRecording` MUST refuse to execute a
recording with an unsupported `version`. A recording missing a required tick seed MUST be rejected before
any tick runs (a `missing_seed` diagnosis), never silently passed.

#### Scenario: mid-replay system failure
- **GIVEN** a recording whose world's system throws during tick 4
- **WHEN** `runRecording` executes
- **THEN** the result is a `system_failure` at tick 4 carrying the original error, and no ticks after 4
  are hashed.

#### Scenario: unsupported recording version
- **GIVEN** a recording whose `version` is not supported by the current verifier
- **WHEN** `runRecording` executes
- **THEN** it refuses to run and reports the unsupported version.

#### Scenario: missing tick seed pre-run rejection
- **GIVEN** a recording that omits the tick seed for some tick in `[1, maxTick]`
- **WHEN** it is passed to `runRecording`
- **THEN** it is rejected before any tick runs with a `missing_seed` diagnosis.

## Error and failure behavior

- Validation failures reject before execution; `runRecording` never runs a partial recording.
- System failures surface as `system_failure` divergences; the process error is not thrown out of the
  comparison.
- Cross-version traces produce `version_mismatch`, not a hash divergence.
- `compareHashes` never throws on a mismatch; it always returns a structured `ReplayComparison`.

## Performance and resource bounds

`runRecording` is O(maxTick × state size) plus O(inputs + tickSeeds) for seed application. Comparison is
O(min expected/actual ticks). The suite is test-only and not on hot paths.

## Compatibility and migration

Additive. The verifier consumes validated recordings and existing primitives (`SeedRng`,
`SimulationHarness`/`WorldTickProcess`) unchanged. Versioning follows `REPLAY_HASH_VERSION`; a future
hash-scheme or recording-format change bumps the corresponding version and re-pins fixtures. No stored
game data changes.

## Security and integrity

Rejecting partial recordings and seeding deterministically before each tick prevents silent divergence;
structured diagnosis turns any instability into a named, testable failure. Comparison results are plain
data safe for assertion.

## Observability

`ReplayTrace` exposes per-tick hashes; `ReplayComparison` exposes the exact first divergence with
expected vs actual and its cause class (hash/seed/version/system_failure/missing_seed), telling the
implementer which tick, stream, or system diverged.

## Verification mapping

| Requirement | Test |
|---|---|
| Reproduce authoritative hashes | `tests/unit/ReplayVerifier.test.ts` — recorded run reproduces expected hashes |
| Cross-run reproducibility | two fresh runs equal |
| Deterministic seeding | correct seeding; recorded-seed break → `seed_mismatch` at the tick |
| Divergence diagnosis | single divergence report; identical/empty traces |
| Failure and version handling | mid-replay `system_failure`; unsupported version; missing-seed pre-run rejection |
