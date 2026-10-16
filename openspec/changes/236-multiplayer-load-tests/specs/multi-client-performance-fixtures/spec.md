# Spec: multi-client-performance-fixtures

## Contract

Headless performance and load fixtures for multi-client simulation. A metric collector aggregates
per-client, per-tick message volumes and tick progress from a `MultiClientHarness` run, and a
validated budget evaluator reports per-dimension + overall verdict against concrete ceilings.
Deterministic timing is produced with a scripted injectable clock (independent of machine speed);
wall-clock throughput is measured separately with real timestamps. This capability is a
measurement contract only: it defines the budgets the fixtures MUST satisfy and the headless
method used to measure them. It introduces no production behavior.

## Definitions

- **ClientTickMetrics**: per-client, per-tick counters — chunk `added`/`updated`/`removed`,
  entity `spawned`/`despawned`/`transforms`/`trackedData`, and inventory `accepted`/`rejected`/
  `mutations`.
- **ClientTickRecord**: one recorded `ClientTickMetrics` value plus the authoritative tick
  number it was consumed at; the collector exposes per-client record sequences so observation
  sequences are directly assertable.
- **Canonical scenario (`BASELINE_LOAD`)**: 4 clients, `viewDistance = 4` (81-column interest),
  1024 server entities, 40-slot inventory windows, 1200 ticks. Sustained throughput budget
  `minTicksPerSecond = 200`; elapsed ceiling `maxElapsedMsForTicks = 6000`.
- **Named fixture scenarios**: `BASELINE_LOAD` (above), `CHUNK_STRESS` (4 clients,
  `viewDistance = 6` (169 columns), 256 entities, `maxSnapshots = 512`, 2000 ticks; center
  drift churns columns), `ENTITY_CHURN` (4 clients, `viewDistance = 4`, 512 entities,
  `maxTracked = 512`, 2000 ticks; center sweeps make entities enter/leave range), and
  `INVENTORY_BURST` (4 clients, `viewDistance = 4`, 128 entities, 1000 ticks; dense queued
  transaction bursts). All are exported as `MultiClientScenarioPreset` constants.
- **MultiClientLoadMetrics**: the evaluated actuals — `sustainedTicksPerSecond`,
  `elapsedMs`, and the per-client-tick maxes `maxChunkAddedPerClientTick`,
  `maxEntitySpawnedPerClientTick`, `maxInventoryAcceptedPerClientTick` (the last is the max of
  `accepted + rejected` over client-ticks).
- **Default budgets (`DEFAULT_BASELINE_BUDGETS`)**: `minTicksPerSecond = 200`,
  `maxElapsedMsForTicks = 6000`, `maxChunkAddedPerClient = 81` (interest size at
  `viewDistance = 4`), `maxEntitySpawnedPerClient = 1024` (seeded entity count),
  `maxInventoryAcceptedPerClient = 64` (queued-transaction burst ceiling).
- **Scripted clock**: an injectable `SimulationClock` fed a deterministic `now()` schedule, so the
  reported elapsed time and tick cadence are pure functions of the script, not the machine.
- **Wall clock**: real headless time (`performance.now`) measured around `step`-driven ticks,
  used only for the throughput and elapsed ceiling measurements.
- **Measurement context**: the canonical throughput/elapsed measurement is the isolated run of
  the fixture file (`npx vitest run tests/unit/multi-client-performance.test.ts`), executed with
  `MC_CANONICAL=1`, in which no other test file competes for the machine's cores. Its verdict is
  recorded in `verification.md`. Under the full parallel unit suite the same fixture measures and
  logs the identical actuals but asserts only the load-independent structural ceilings, so a busy
  machine cannot produce a false gate failure. Wall-clock measurements under arbitrary parallel
  load are not a reproducible signal, so they never drive a normative verdict.
- **Budget**: a validated ceiling; boundary equality counts as within budget (075 convention).
  `evaluateMultiClientBudgets` maps `minTicksPerSecond` to `sustainedTicksPerSecond` with
  `actual >= budget` and every other dimension with `actual <= budget`.

## Invariants

- **Headless invariant**: all measurement runs in the node Vitest environment with no DOM/IO.
- **Reproducibility invariant**: identical scripted-clock schedules yield identical deterministic
  metrics across runs and machines.
- **Structural-load invariant**: per-client per-tick message counts never exceed the structural
  ceilings implied by interest/tracked/inventory sizes.
- **Budget-boundedness invariant**: the canonical scenario completes within the elapsed wall-time
  ceiling at the minimum sustained tick rate (canonical isolated measurement context, see
  Definitions).

## Requirements

### Requirement: REQ-P1 Headless metric collection

The collector SHALL aggregate per-client, per-tick counters and per-run totals with no DOM or IO,
and SHALL expose client and aggregate totals for assertion.

#### Scenario: Collector reports exact totals for a scripted run
- **GIVEN** a canonical run with a deterministic schedule.
- **WHEN** the run completes and `totals()`/`clientTotals(i)` are read.
- **THEN** the chunk `added` total MUST equal the sum of columns entered across clients, the entity
  `spawned` total MUST equal the in-range entity count per client, and the inventory `accepted` +
  `rejected` total MUST equal the number of queued transactions.

#### Scenario: Collector validation rejects misuse
- **GIVEN** the collector.
- **WHEN** a negative or non-integer counter (or a negative client index) is recorded.
- **THEN** the collector MUST throw a descriptive `MultiClientHarness:` error and MUST NOT corrupt
  prior counts.

---

### Requirement: REQ-P2 Budget config validation

`validateMultiClientBudgets` SHALL reject non-finite, non-positive, or out-of-range budget values,
naming the offending field, and SHALL accept a valid config unchanged.

#### Scenario: Invalid budget is rejected naming the field
- **GIVEN** a budget with `minTicksPerSecond = 0`, `-1`, `NaN`, `Infinity`, or a non-number.
- **WHEN** validation is attempted.
- **THEN** it MUST throw a `MultiClientBudgets:` error naming `minTicksPerSecond`, and MUST NOT
  return a partial budget.

#### Scenario: Boundary equality is within budget
- **GIVEN** a budget and an actual exactly equal to a ceiling (e.g. elapsed ms == `maxElapsedMsForTicks`).
- **WHEN** the budget is evaluated.
- **THEN** that dimension MUST report `withinBudget = true` and the overall verdict MUST remain
  `withinBudget = true` when all other dimensions are within budget.

---

### Requirement: REQ-P3 Wall-clock throughput budget

The canonical scenario SHALL sustain at least `minTicksPerSecond` ticks/sec in real headless time.

#### Scenario: Canonical scenario meets the sustained tick rate
- **GIVEN** the `BASELINE_LOAD` scenario (4 clients, view distance 4, 1024 entities, 40-slot
  windows) driven by the wall clock.
- **WHEN** 1200 ticks are stepped and real elapsed ms is measured.
- **THEN** `1200 / (elapsedMs / 1000)` MUST be `>= minTicksPerSecond` (default 200), the actual rate
  MUST be recorded in the report, and the canonical isolated measurement (Definitions: Measurement
  context) MUST fail the dimension otherwise.

---

### Requirement: REQ-P4 Per-tick message ceilings

The collector SHALL verify that per-client message counts respect the structural ceilings implied
by interest, tracked, and queue sizes.

#### Scenario: First-center chunk added count is bounded by the interest size
- **GIVEN** a client with `viewDistance = 4` (interest 81).
- **WHEN** the first consumption epoch runs.
- **THEN** the client's chunk `added` count for that tick MUST be `<= 81` (the `maxChunkAddedPerClient`
  ceiling), with no duplicate keys.

#### Scenario: Entity spawn count is bounded by the in-range tracked count
- **GIVEN** a server manager with 1024 entities.
- **WHEN** the first epoch runs.
- **THEN** each client's entity `spawned` count for that tick MUST be `<= maxEntitySpawnedPerClient`
  and MUST equal the number of entities inside the client's `trackingRange`.

#### Scenario: Inventory accepted count is bounded by the queued transactions
- **GIVEN** a client with a bounded queue of `Q` transactions in a tick.
- **WHEN** the epoch drains the queue.
- **THEN** the client's inventory `accepted + rejected` for that tick MUST be `<= Q` (the
  `maxInventoryAcceptedPerClient` ceiling), and `accepted` MUST reflect only non-rejected
  transactions.

---

### Requirement: REQ-P5 Deterministic timing

Under a scripted clock, the fixture MUST report deterministic tick cadence and elapsed time that
depend only on the script, independent of machine speed.

#### Scenario: Identical scripted runs produce identical deterministic metrics
- **GIVEN** a canonical scenario driven by the same scripted `now()` schedule on two separate
  harness instances.
- **WHEN** both run to completion.
- **THEN** their deterministic timing metrics (ticks processed, scripted elapsed, per-client
  message totals) MUST be identical.

#### Scenario: Wall-clock speed does not change deterministic metrics
- **GIVEN** the same scripted-clock scenario executed with artificially slowed or sped wall time
  around the drive calls.
- **WHEN** the deterministic metrics are read.
- **THEN** they MUST be unchanged from the unperturbed scripted run.

---

### Requirement: REQ-P6 Long-run resource boundedness

A long deterministic run MUST keep client stores bounded and reconciler prediction maps empty at
quiescence.

#### Scenario: A 10,000-tick run keeps stores bounded
- **GIVEN** a 4-client scenario with `maxSnapshots` and `maxTracked` set to fixed values and a
  center that moves so columns/entities churn.
- **WHEN** 10,000 ticks are stepped.
- **THEN** each client's chunk store size MUST be `<= maxSnapshots`, each entity store size MUST be
  `<= maxTracked`, and every reconciler prediction map MUST be empty at the end of the run.

---

### Requirement: REQ-P7 Elapsed wall-time regression ceiling

The canonical scenario SHALL complete within `maxElapsedMsForTicks` of real headless time.

#### Scenario: Canonical scenario completes within the elapsed ceiling
- **GIVEN** the `BASELINE_LOAD` scenario driven by the wall clock.
- **WHEN** 1200 ticks are stepped.
- **THEN** the measured elapsed ms MUST be `<= maxElapsedMsForTicks` (default 6000), the measured
  value MUST be recorded, and the canonical isolated measurement (Definitions: Measurement
  context) MUST fail the dimension otherwise.

## Error and failure behavior

Invalid budgets throw `MultiClientBudgets: <detail>`. Invalid recorded metrics throw
`MultiClientHarness: <detail>`. A world-system failure surfaces through `process.lastError` and
`process.isStopped` and stops the measurement run; the collector preserves all counts recorded
before the failure.

## Performance and resource bounds

The measurement method is O(1) per recorded counter beyond the underlying O(interest) + O(tracked)
+ O(queued) consumption cost. Budgets are conservative ceilings (≥ 200 ticks/sec, ≤ 6000 ms for
1200 ticks, per-tick message ceilings); actuals measured in the canonical isolated context
(Definitions: Measurement context) are recorded in `verification.md` and may be tightened by a
later performance change, never loosened silently.

## Compatibility and migration

Additive measurement contract; no production module, public symbol, persistent data, or protocol
version change.

## Security and integrity

Metric counters are validated as non-negative integers; invalid values cannot corrupt the
aggregate. The evaluator treats non-finite or negative actuals as violations, so a broken
measurement cannot report a false pass.

## Observability

`MultiClientMetricsCollector.clientTickRecords(i)`/`totals()`/`clientTotals(i)`/`perClientTickMaxes()`
expose counts and observation sequences; `evaluateMultiClientBudgets` exposes per-dimension +
overall verdict with budget and actual per dimension.

## Verification mapping

- `tests/unit/multi-client-performance.test.ts` verifies REQ-P1..REQ-P7 scenarios.
- REQ-P3/REQ-P7 normative verdicts come from the canonical isolated measurement:
  `MC_CANONICAL=1 npx vitest run tests/unit/multi-client-performance.test.ts`.
- Requirement coverage is recorded per scenario in `verification.md`.
