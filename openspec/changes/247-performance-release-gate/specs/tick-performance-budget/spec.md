# Spec: tick-performance-budget

## Contract

The tick domain of the release gate. A declared tier MUST sustain at least
`minSustainedTicksPerSecond` wall-clock ticks/sec and complete the canonical simulation run within
`maxCanonicalTickRunMs` when driven by the headless authoritative `WorldTickProcess` (224) on the
canonical simulation scenario. The measurement MUST record `sustainedTicksPerSecond` and
`canonicalTickRunMs` as the `bundle.tick` actuals. Boundary equality counts as within budget; a
malformed actual is a violation. This spec defines the measurement and its per-tier budgets; it
introduces no production behavior and does not modify the 224 process or 044 clock.

## Definitions

- **Canonical simulation scenario (`CANONICAL_SIM`)**: a single authoritative `WorldTickProcess`
  over a fixed system set processing a 17×17 (289-column) world with 64 entities, stepped exactly
  1200 ticks via `step(1200)`.
- **Tick dimensions**: `minSustainedTicksPerSecond` (a minimum), `maxCanonicalTickRunMs` (a
  ceiling).
- **Measurement**: wall-clock elapsed ms around `step(1200)`; `sustainedTicksPerSecond =
  1200 / (elapsedMs / 1000)`; `canonicalTickRunMs = elapsedMs`. Determinism is cross-checked with a
  scripted `SimulationClock`.

## Invariants

- `step(1200)` advances the process exactly 1200 ticks (a throwing system stops it; the failed tick
  is uncounted and the measurement is invalid).
- Per-dimension evaluation: `sustainedTicksPerSecond >= min` and `canonicalTickRunMs <= max`; both
  must hold for the tick domain to be within budget.
- The measurement records a non-negative finite `canonicalTickRunMs` and a finite
  `sustainedTicksPerSecond`.

## Requirements

### Requirement: REQ-T1 Per-tier tick budgets

A declared tier MUST have exactly these tick budgets (authoritative source:
`DEFAULT_RELEASE_BUDGETS`):

| dimension | Low | Medium | High | Ultra |
|---|---|---|---|---|
| minSustainedTicksPerSecond | 60 | 120 | 240 | 480 |
| maxCanonicalTickRunMs | 20000 | 10000 | 5000 | 2500 |

#### Scenario: the tier's tick budgets are the evaluation row
- **GIVEN** a `Medium` tick measurement with `sustainedTicksPerSecond = 120` and
  `canonicalTickRunMs = 10000`.
- **WHEN** the tick dimension is evaluated for `Medium`.
- **THEN** both tick entries report `withinBudget: true` (boundary equality) and the tick
  contribution to the overall verdict is within budget.

#### Scenario: a slower-than-minimum sustained rate fails
- **GIVEN** a `High` tick measurement with `sustainedTicksPerSecond = 200` (below `High`'s 240).
- **WHEN** the tick dimension is evaluated.
- **THEN** `minSustainedTicksPerSecond` reports `withinBudget: false` and the overall verdict is
  false.

### Requirement: REQ-T2 Headless tick measurement method

The tick actuals MUST be produced by constructing a `WorldTickProcess` over `CANONICAL_SIM` and
calling `step(1200)`, measuring real elapsed ms; `sustainedTicksPerSecond` MUST be derived as
`1200 / (elapsedMs / 1000)` and `canonicalTickRunMs` as `elapsedMs`. A completed `step(1200)` that
ends with `isStopped === true` MUST NOT yield a valid measurement.

#### Scenario: canonical simulation produces a complete tick bundle
- **GIVEN** a `Low` `CANONICAL_SIM` process.
- **WHEN** `step(1200)` completes without stopping.
- **THEN** `bundle.tick` contains a finite non-negative `canonicalTickRunMs`, a finite
  `sustainedTicksPerSecond = 1200 / (canonicalTickRunMs / 1000)`, and the process `tick === 1200`.

#### Scenario: a stopped process yields no valid measurement
- **GIVEN** a system that throws during `step`, stopping the process.
- **WHEN** the measurement runs.
- **THEN** the process reports `isStopped === true`, `tick < 1200`, and the measurement MUST be
  recorded as invalid (the tick domain MUST NOT report within budget).

### Requirement: REQ-T3 Tick budget violation

A tick measurement that misses the sustained rate or the run ceiling MUST fail the tick domain and
the gate.

#### Scenario: run-ceiling overrun fails the gate
- **GIVEN** a `Low` tick measurement with `canonicalTickRunMs = 21000` (above `Low`'s 20000).
- **WHEN** the tick dimension is evaluated.
- **THEN** `maxCanonicalTickRunMs` reports `withinBudget: false`, the report names it with budget
  vs actual, and the overall verdict is false.

#### Scenario: sustained-rate miss fails the gate
- **GIVEN** a `Ultra` tick measurement with `sustainedTicksPerSecond = 400` (below `Ultra`'s 480).
- **WHEN** the tick dimension is evaluated.
- **THEN** `minSustainedTicksPerSecond` reports `withinBudget: false` and the overall verdict is
  false.

### Requirement: REQ-T4 Deterministic tick count

Under a scripted `SimulationClock`, identical scripted schedules MUST produce identical tick counts
and ordering independent of machine speed; the wall-clock sustained rate is a separate, real-time
measurement.

#### Scenario: scripted ticks agree
- **GIVEN** two `WorldTickProcess` instances over identical `CANONICAL_SIM` system sets with
  identical scripted clocks.
- **WHEN** both are stepped to completion.
- **THEN** their tick counts and per-tick ordering are identical.

## Error and failure behavior

A throwing system stops the process (224 semantics: failed tick uncounted, `isStopped`, `lastError`,
later drives rethrow until `reset()`); a stopped measurement is invalid and the tick domain MUST NOT
report within budget. A malformed actual in the bundle is a violation.

## Performance and resource bounds

The canonical scenario is bounded (289 columns, 64 entities, 1200 ticks). The sustained-rate minimum
and run ceiling are ceilings, not targets; actuals are recorded in `verification.md` and may be
tightened later, never loosened silently.

## Compatibility and migration

Additive. Measurement consumes the 224 process and 044 clock unchanged; no existing module or
public symbol changes, no persistence, no migration.

## Security and integrity

No I/O; the process is headless. A stopped or malformed measurement cannot report a false pass.

## Observability

The gate report names any failing tick dimension with budget vs actual; actuals are recorded in
`verification.md`.

## Verification mapping

- `tests/unit/release-tick-budget.test.ts` — REQ-T1..REQ-T4: per-tier tick row, boundary within,
  slower-than-minimum and run-ceiling failures, canonical-scenario bundle completeness, stopped
  process invalidity, scripted-clock determinism.
