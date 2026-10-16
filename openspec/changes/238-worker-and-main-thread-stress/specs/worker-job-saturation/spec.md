# Spec: worker-job-saturation

## Contract

Saturation drives the worker job path (generation 086 and section meshing 065/070) at worst-case
volume and MUST hold measurable latency budgets, MUST enforce a bounded pending-job cap
(`maxPendingJobs`) with deterministic rejection beyond it, and MUST preserve the 064 exactly-once /
stale-rejection semantics for cancelled, duplicate, unknown, and identity-mismatched results even
under full load. Budgets are concrete and measured headlessly: functional suites use an injectable
clock; wall-clock throughput uses a documented median-with-warmup protocol over `performance.now()`.

## Definitions

- **Saturation run**: one burst of `burstCount` jobs submitted through the injected dispatch and
  resolved to completion (or rejected by the pending cap).
- **Pending job**: a submitted job whose result has not yet been resolved or cancelled.
- **Stale result**: a result for an unknown, already-resolved, or cancelled `jobId`; it MUST be
  dropped (`null`) and MUST NOT invoke the callback.
- **Throughput budget**: `maxMeanJobMillis`, `maxP95JobMillis`, `maxTotalMillis` for the burst.

## Invariants

- `burstCount`, `maxPendingJobs`, and every budget field are positive finite integers/numbers
  (validated).
- At no point does the dispatch hold more than `maxPendingJobs` pending jobs; a submission that would
  exceed the cap is rejected and enqueues nothing.
- Each accepted job resolves exactly once; stale results resolve to `null` and invoke no callback.
- Worldgen results additionally require identity match (`columnX/columnZ/seed/stage`) per 086; a
  mismatch is treated as stale and consumed exactly like a stale id.
- Deterministic suites use an injectable `now()`; only wall-clock suites use `performance.now()` with
  the documented warmup + median protocol.

## Requirements

### Requirement: meshing saturation budget
`runMeshSaturation` MUST submit `burstCount` `MeshSectionRequestPayload` jobs through the injected
dispatch, resolve every accepted job exactly once, and evaluate the burst against the meshing budget.
A `DEFAULT_WORKER_SATURATION_BUDGET` MUST be provided (positive finite) and `validateWorkerSaturationConfig`
MUST reject anything else.

#### Scenario: full burst within budget
- **GIVEN** a dispatch that resolves every job and a config with `burstCount=256` and budget fields
  above the measured latencies
- **WHEN** `runMeshSaturation` runs with an injectable clock
- **THEN** the report's `withinBudget` is true, every entry has `withinBudget: true`, and every one of
  the 256 jobs appears in `results` with `ok: true`.

#### Scenario: budget violation flagged
- **GIVEN** a dispatch whose per-job latency exceeds `maxMeanJobMillis` for the measured burst
- **WHEN** `runMeshSaturation` runs
- **THEN** the mean entry has `withinBudget: false`, the report's `withinBudget` is false, and the
  entry names the budget vs actual mean latency.

### Requirement: worldgen saturation budget
`runWorldgenSaturation` MUST submit `burstCount` `WorldgenRequestPayload` jobs and evaluate the burst
against the worldgen budget with the same verdict semantics as meshing.

#### Scenario: full worldgen burst
- **GIVEN** a dispatch that resolves every job with an identity-matching result
- **WHEN** `runWorldgenSaturation` runs
- **THEN** every job resolves `ok: true` exactly once and the report verdict reflects the budget.

#### Scenario: identity-mismatch under load
- **GIVEN** one job whose result echoes a different `columnX` than its request
- **WHEN** the burst runs
- **THEN** that job resolves to a rejected/stale outcome (`ok: false` or absent) and the mismatch does
  not resolve a callback; the remaining jobs are unaffected.

### Requirement: backpressure cap
Worker dispatch MUST NOT enqueue a job when doing so would push pending jobs above `maxPendingJobs`;
the excess submission MUST be rejected deterministically and MUST NOT be enqueued or resolved.

#### Scenario: burst exceeds the cap
- **GIVEN** `maxPendingJobs=8` and a burst that would submit 12 jobs at once
- **WHEN** the burst is submitted
- **THEN** exactly 8 jobs are pending, the 9th through 12th submissions are rejected with a
  descriptive error, and `pendingCount()` never exceeds 8.

#### Scenario: rejection after a resolve frees a slot
- **GIVEN** `maxPendingJobs=8`, 8 pending jobs, and one result already resolved
- **WHEN** the 9th job is submitted
- **THEN** the submission is accepted (pending back at 8), and the rejected job count is exactly the
  number submitted while at the cap.

### Requirement: exactly-once and stale rejection under saturation
Even under full load, every accepted job MUST resolve exactly once, and stale results (unknown,
already-resolved, or cancelled id; or identity-mismatched worldgen result) MUST resolve to `null` and
MUST NOT invoke any callback.

#### Scenario: duplicate late result
- **GIVEN** a resolved job whose result is delivered a second time while other jobs are still pending
- **WHEN** the duplicate is handled
- **THEN** it returns `null` and the callback runs once total.

#### Scenario: cancelled job's late result
- **GIVEN** a job cancelled while pending, whose result arrives after the burst otherwise completes
- **WHEN** the late result is handled
- **THEN** it returns `null`, invokes no callback, and `pendingCount()` is unaffected.

#### Scenario: unknown jobId under load
- **GIVEN** a message carrying a `jobId` that was never submitted, delivered between valid results
- **WHEN** it is handled
- **THEN** it returns `null`, no callback runs, and the valid results still resolve exactly once.

### Requirement: determinism
Identical burst payloads, identical scripted `now()` sequences, and identical result-delivery order
MUST produce identical reports (same job outcomes and verdicts).

#### Scenario: scripted clocks agree
- **GIVEN** two dispatches with identical payloads and identical scripted clocks/resolution order
- **WHEN** each runs `runMeshSaturation`
- **THEN** the two reports are deeply equal.

## Error and failure behavior

- Submission beyond `maxPendingJobs` throws a descriptive error and enqueues nothing.
- `validateWorkerSaturationConfig` throws a descriptive error naming the invalid field for non-finite,
  non-positive, or non-numeric values, and for non-object input.
- A worker job that reports `ok: false` is surfaced in `results` as a failed outcome and does not
  corrupt subsequent resolutions.

## Performance and resource bounds

The harness is O(burst) in submissions/resolutions with no unbounded allocation. Wall-clock throughput
suites run under this protocol: warm up one full burst (discarded), then measure the median of at
least 3 further bursts via `performance.now()`, reporting mean/p95/total. Budgets are validated
starting values; actual medians and any justified tuning are recorded in `verification.md`.

## Compatibility and migration

Additive and read-only over the 064/065/070/086 clients; no envelope, version, or payload changes.
No migration.

## Security and integrity

All numeric inputs validated; job ids are opaque correlation tokens with no privilege semantics.
Stale/cancelled results cannot mutate main-thread state by construction (exactly-once + identity
match).

## Observability

The report lists every job's `jobId`, `ok`, and `latencyMillis`, so a lost or duplicated resolution
is directly visible; budget entries name dimension, budget, and actual.

## Verification mapping

- `tests/unit/WorkerSaturationHarness.test.ts` — meshing/worldgen burst budgets and verdicts,
  backpressure cap (rejection + slot-release), exactly-once and stale/cancel/unknown/identity-mismatch
  under load, scripted-clock determinism, config validation.
