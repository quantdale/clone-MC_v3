# Spec: network-performance-budget

## Contract

The network domain of the release gate. A declared tier MUST sustain at least
`networkSustainedTicksPerSecond` and complete the canonical multi-client run within
`maxNetworkRunMs`, and the per-tick message ceilings (`maxChunkAddedPerClient`,
`maxEntitySpawnedPerClient`, `maxInventoryAcceptedPerClient`) MUST be respected, when the canonical
multi-client scenario is driven headlessly. The budgets are a per-tier refinement of the 236
`MultiClientBudgets` contract, which this change references **by name**; the 236 harness
(`MultiClientHarness`, `MultiClientMetricsCollector`) supplies the measurement, reconciled to the
236 implementation at verification time per `SPEC_AUTHORING_PROTOCOL.md`. The measurement MUST record
`bundle.network.sustainedTicksPerSecond`, `networkRunMs`, and the three observed per-tick ceilings.
Boundary equality counts as within budget; a malformed actual is a violation. This spec introduces
no production behavior and does not build the 236 harness.

## Definitions

- **Canonical multi-client scenario**: 236 `BASELINE_LOAD` — 4 clients, `viewDistance = 4`
  (81-column interest), 1024 server entities, 40-slot inventory windows, 1200 ticks, driven by the
  236 `MultiClientHarness` (by name).
- **Network dimensions**: `networkSustainedTicksPerSecond` (a minimum), `maxNetworkRunMs` (a
  ceiling), `maxChunkAddedPerClient`, `maxEntitySpawnedPerClient`, `maxInventoryAcceptedPerClient`
  (structural ceilings).
- **Structural message ceilings**: non-tiered invariants derived from 236 interest/tracked/queue
  bounds — `maxChunkAddedPerClient` 81 (= `viewDistance`-4 interest), `maxEntitySpawnedPerClient`
  = the number of in-range tracked entities, `maxInventoryAcceptedPerClient` = the number of queued
  transactions drained in a tick. The same values apply to every tier.
- **Measurement**: wall-clock elapsed ms for the 1200-tick run;
  `sustainedTicksPerSecond = 1200 / (elapsedMs / 1000)`; `networkRunMs = elapsedMs`; per-tick
  message ceilings observed via the 236 collector's `totals()`/`clientTotals(i)`.

## Invariants

- The network throughput/elapsed budgets are per-tier ceilings/minimums; the three structural
  message ceilings are tier-independent.
- Per-dimension evaluation: `sustainedTicksPerSecond >= min`, `networkRunMs <= max`, and each
  observed per-tick ceiling `<=` its structural ceiling; all must hold for the network domain to be
  within budget.
- A stopped or failed run (a throwing world system, a collector that rejects an invalid metric)
  yields an invalid network measurement.

## Requirements

### Requirement: REQ-N1 Per-tier network budgets

A declared tier MUST have exactly these network budgets (authoritative source:
`DEFAULT_RELEASE_BUDGETS`; structural ceilings are the same for every tier):

| dimension | Low | Medium | High | Ultra |
|---|---|---|---|---|
| networkSustainedTicksPerSecond | 120 | 200 | 400 | 800 |
| maxNetworkRunMs | 10000 | 6000 | 3000 | 1500 |

Structural ceilings (all tiers): `maxChunkAddedPerClient` = 81, `maxEntitySpawnedPerClient` =
in-range tracked count, `maxInventoryAcceptedPerClient` = queued count per tick.

#### Scenario: the tier's network budgets are the evaluation rows
- **GIVEN** a `Medium` network measurement with `sustainedTicksPerSecond = 200`,
  `networkRunMs = 6000`, `maxChunkAddedPerClient = 81`, and entity/inventory ceilings within their
  structural bounds.
- **WHEN** the network dimension is evaluated for `Medium`.
- **THEN** every network entry reports `withinBudget: true` (boundary equality) and the network
  contribution to the overall verdict is within budget.

#### Scenario: a structural message ceiling is tier-independent
- **GIVEN** an `Ultra` run where a single client's first-epoch `maxChunkAddedPerClient` is 85.
- **WHEN** the network dimension is evaluated.
- **THEN** `maxChunkAddedPerClient` reports `withinBudget: false` regardless of the tier, because
  the ceiling is the same structural value (81) for every tier.

### Requirement: REQ-N2 Headless network measurement method

`bundle.network` MUST be produced by running 236 `BASELINE_LOAD` through the 236 `MultiClientHarness`
(by name) for 1200 ticks under the wall clock, reading sustained ticks/sec and elapsed ms, and
reading per-client per-tick message totals from the 236 `MultiClientMetricsCollector`. The measured
`networkRunMs` MUST be real elapsed time.

#### Scenario: canonical multi-client run produces a complete network bundle
- **GIVEN** a 236 harness over `BASELINE_LOAD` that completes 1200 ticks without stopping.
- **WHEN** the run finishes and the collector totals are read.
- **THEN** `bundle.network` contains finite non-negative `sustainedTicksPerSecond`, `networkRunMs`,
  and the three observed per-tick ceilings, with each client's totals within the 236 structural
  bounds.

#### Scenario: a stopped multi-client run yields no valid measurement
- **GIVEN** a 236 harness whose world system throws mid-run, stopping the process.
- **WHEN** the run completes.
- **THEN** the process reports `isStopped === true`, `tick < 1200`, and the network measurement MUST
  be recorded as invalid (the network domain MUST NOT report within budget).

### Requirement: REQ-N3 Network budget violation

A network measurement that misses the sustained rate, the run ceiling, or a structural message
ceiling MUST fail the network domain and the gate.

#### Scenario: throughput overrun fails the gate
- **GIVEN** a `High` network measurement with `networkRunMs = 3200` (above `High`'s 3000).
- **WHEN** the network dimension is evaluated.
- **THEN** `maxNetworkRunMs` reports `withinBudget: false`, the report names it with budget vs
  actual, and the overall verdict is false.

#### Scenario: sustained-rate miss fails the gate
- **GIVEN** a `Ultra` network measurement with `sustainedTicksPerSecond = 700` (below `Ultra`'s
  800).
- **WHEN** the network dimension is evaluated.
- **THEN** `networkSustainedTicksPerSecond` reports `withinBudget: false` and the overall verdict is
  false.

### Requirement: REQ-N4 Deterministic multi-client message counts

Under a scripted clock, the 236 harness MUST report deterministic per-client message totals
independent of machine speed; the wall-clock sustained rate is a separate, real-time measurement.

#### Scenario: scripted multi-client runs agree
- **GIVEN** two 236 harness instances over identical `BASELINE_LOAD` configs with identical
  scripted clocks.
- **WHEN** both run to completion.
- **THEN** their deterministic per-client message totals are identical.

## Error and failure behavior

A stopped world system invalidates the run (236 semantics). Invalid metric counters throw a
descriptive 236 `MultiClientHarness:`/collector error and are recorded as invalid, so a failed or
malformed network measurement cannot produce a false pass. A malformed actual in the bundle is a
violation.

## Performance and resource bounds

The canonical multi-client scenario is bounded (4 clients, 1024 entities, 1200 ticks). The
throughput/elapsed ceilings are ceilings, not targets; actuals are recorded in `verification.md` and
may be tightened later, never loosened silently. The structural message ceilings are fixed by 236
interest/tracked/queue sizes.

## Compatibility and migration

Additive. Measurement consumes the 236 harness and budgets by name; the exact symbol/type names are
reconciled against the 236 implementation at 247 verification time. No existing module or public
symbol changes, no persistence, no migration.

## Security and integrity

No real transport or I/O in the headless measurement; all recorded values validated. A failed or
malformed measurement cannot report a false pass.

## Observability

The gate report names any failing network dimension with budget vs actual; the 236 collector
`totals()`/`clientTotals(i)` expose per-client counts; actuals are recorded in `verification.md`.

## Verification mapping

- `tests/unit/release-network-budget.test.ts` — REQ-N1..REQ-N4: per-tier network rows, boundary
  within, structural-ceiling tier-independence, throughput/rate overrun failures, canonical-run
  bundle completeness, stopped-run invalidity, scripted determinism. Network measurement integrates
  with the 236 harness once implemented; until then the gate's budget validation/evaluation for the
  network domain is unit-tested with fixture bundles.
