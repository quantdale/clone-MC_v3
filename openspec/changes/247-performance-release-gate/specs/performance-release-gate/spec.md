# Spec: performance-release-gate

## Contract

`ReleasePerformanceGate` MUST define the closed release hardware tier set, a validated per-tier ×
per-domain budget matrix over the five domains (frame, tick, load, save, network), and a pure
fail-closed evaluation of a measurement bundle against a declared tier. `validateReleaseBudgetConfig`
MUST accept exactly the valid matrix shape and reject any malformed value naming the offending
field. `evaluateReleaseGate(config, tier, bundle)` MUST report per-dimension
`withinBudget = actual <= budget` (non-finite, negative, or missing actuals violate) plus an overall
verdict that is within only when every dimension of the selected tier is within budget; an unknown
tier MUST be rejected with a descriptive error. This capability is a measurement/gate contract
only: it introduces no production behavior and does not modify any existing module.

## Definitions

- **Release tier**: one of `Low | Medium | High | Ultra` (closed set, fixed order). Represents the
  hardware capability class a build is declared against; the tier is an explicit evaluation
  argument, never inferred from the host.
- **Domain**: one of `frame`, `tick`, `load`, `save`, `network`.
- **Budget**: a positive finite ceiling (or, for tick/network *sustained* rate, a positive finite
  minimum) that the measured actual MUST satisfy. Boundary equality counts as within budget
  (075/236 convention).
- **Frame dimension**: `maxDrawCalls`, `maxMeshBuildMillis`, `maxFrameTimeMillis`,
  `maxGeometryMemoryBytes`, `maxRenderDistanceChunks`.
- **Tick dimension**: `minSustainedTicksPerSecond`, `maxCanonicalTickRunMs`.
- **Load dimension**: `maxLoadMs`. **Save dimension**: `maxSaveFlushMs`.
- **Network dimension**: `networkSustainedTicksPerSecond`, `maxNetworkRunMs`,
  `maxChunkAddedPerClient`, `maxEntitySpawnedPerClient`, `maxInventoryAcceptedPerClient`.
- **Measurement bundle**: the typed actuals produced by the per-domain headless measurements
  (defined in the domain specs `frame-performance-budget`, `tick-performance-budget`,
  `load-save-performance-budget`, `network-performance-budget`).

## Invariants

- The tier set is exactly `{ Low, Medium, High, Ultra }`; no other value is a legal tier.
- Every numeric budget is a positive finite number.
- Per-dimension evaluation: `withinBudget = actual <= budget`; a non-finite, negative, or missing
  actual is a violation.
- Overall verdict is within only when every dimension of the selected tier is within budget.
- Evaluation is a pure function of `(config, tier, bundle)`; an unknown tier throws and produces no
  report.

## Requirements

### Requirement: REQ-G1 Closed tier set

`RELEASE_TIERS` MUST be a non-empty, fixed, closed set containing exactly
`Low | Medium | High | Ultra`, and every other string MUST be an invalid tier.

#### Scenario: the closed set is exactly the four tiers
- **GIVEN** the exported `RELEASE_TIERS`.
- **WHEN** it is read and enumerated.
- **THEN** it MUST contain exactly `Low`, `Medium`, `High`, `Ultra` in that order, with no
  duplicates or extra entries.

#### Scenario: an invalid tier string is rejected
- **GIVEN** the string `'Potato'` (or an empty string, or `'tier-1'`) as a tier argument.
- **WHEN** `evaluateReleaseGate` is called with it.
- **THEN** it MUST throw a descriptive `ReleasePerformanceGate: unknown tier '<value>'` error and
  MUST NOT produce any report.

### Requirement: REQ-G2 Validated budget matrix shape

`validateReleaseBudgetConfig(input)` MUST accept exactly the shape of a full per-tier × per-domain
matrix (every domain present, every tier present in every domain, every dimension present per
domain) and MUST throw a descriptive error naming the offending field for any missing, extra,
unknown, or wrongly-typed part. On success it MUST return the same value (narrowed).

#### Scenario: a full valid matrix is accepted
- **GIVEN** a complete matrix object with all five domains, all four tiers, and all documented
  dimensions as positive finite numbers.
- **WHEN** validation runs.
- **THEN** it MUST return the same value (narrowed) with no mutation of the input.

#### Scenario: a missing domain is rejected
- **GIVEN** a matrix object with the `network` domain removed.
- **WHEN** validation runs.
- **THEN** it MUST throw a `ReleasePerformanceGate:` error naming `network`, and MUST NOT return a
  partial config.

#### Scenario: a missing tier in one domain is rejected
- **GIVEN** a matrix where `frame.High` is absent.
- **WHEN** validation runs.
- **THEN** it MUST throw a `ReleasePerformanceGate:` error naming `frame` and `High`.

#### Scenario: an extra/unknown dimension is rejected
- **GIVEN** a matrix where `tick` contains an extra dimension `maxFpsLimit`.
- **WHEN** validation runs.
- **THEN** it MUST throw a `ReleasePerformanceGate:` error naming the unknown `tick` dimension.

### Requirement: REQ-G3 Positive-finite budget validation

Every numeric budget value MUST be a positive finite number; validation MUST reject zero, negative,
`NaN`, `Infinity`, and non-number values, naming the field.

#### Scenario: non-positive budget is rejected
- **GIVEN** a matrix with `frame.Medium.maxDrawCalls = 0` (or `-5`).
- **WHEN** validation runs.
- **THEN** it MUST throw a `ReleasePerformanceGate:` error naming `frame.Medium.maxDrawCalls`.

#### Scenario: non-finite budget is rejected
- **GIVEN** a matrix with `network.Low.maxNetworkRunMs = NaN` (or `Infinity`).
- **WHEN** validation runs.
- **THEN** it MUST throw a `ReleasePerformanceGate:` error naming
  `network.Low.maxNetworkRunMs`.

#### Scenario: non-numeric budget is rejected
- **GIVEN** a matrix with `save.High.maxSaveFlushMs = 'fast'`.
- **WHEN** validation runs.
- **THEN** it MUST throw a `ReleasePerformanceGate:` error naming `save.High.maxSaveFlushMs`.

### Requirement: REQ-G4 Fail-closed gate evaluation

`evaluateReleaseGate(config, tier, bundle)` MUST produce one entry per dimension of the selected
tier with `withinBudget = actual <= budget`, treating a non-finite, negative, or missing actual as a
violation, and MUST set the overall `withinBudget` to true only when every entry is within budget.

#### Scenario: all dimensions within budget pass
- **GIVEN** a `Medium` measurement bundle whose actuals are at or below every `Medium` ceiling
  (and sustained rates at or above the `Medium` minimums).
- **WHEN** evaluation runs.
- **THEN** every entry has `withinBudget: true` and the report's overall `withinBudget` is true.

#### Scenario: a single violation fails the gate
- **GIVEN** a `Low` bundle where `tick.canonicalTickRunMs` exceeds `Low.maxCanonicalTickRunMs` while
  all other `Low` dimensions are within budget.
- **WHEN** evaluation runs.
- **THEN** the `maxCanonicalTickRunMs` entry is `withinBudget: false`, the report names it with
  budget vs actual, and the overall `withinBudget` is false.

#### Scenario: boundary equality is within budget
- **GIVEN** an actual exactly equal to a ceiling (e.g. `tick.canonicalTickRunMs ===
  Low.maxCanonicalTickRunMs`) and all other actuals within budget.
- **WHEN** evaluation runs.
- **THEN** that dimension reports `withinBudget: true` and the overall verdict remains true.

#### Scenario: missing actual is a violation
- **GIVEN** a bundle whose `load` object is absent (or `load.loadMs` is `undefined`).
- **WHEN** evaluation runs.
- **THEN** the `maxLoadMs` dimension reports `withinBudget: false` and the overall verdict is false.

#### Scenario: malformed actual is a violation, not an exception
- **GIVEN** a bundle with `frame.frameTimeMillis = -1` (or `NaN`).
- **WHEN** evaluation runs.
- **THEN** the `maxFrameTimeMillis` dimension reports `withinBudget: false`, no exception is thrown,
  and the overall verdict is false.

### Requirement: REQ-G5 Tier selection is explicit and immutable per evaluation

The tier passed to evaluation MUST fully determine which budget row is used; the report MUST record
the tier and evaluate exactly that tier's ceilings, never another tier's.

#### Scenario: each tier evaluates only its own row
- **GIVEN** the same `High` measurement bundle (all within the `High` row).
- **WHEN** it is evaluated against the `High` tier and separately the `Ultra` tier.
- **THEN** the `High` evaluation reports all-within, while the `Ultra` evaluation reports
  `withinBudget: false` where the `High`-sized actuals violate the stricter `Ultra` ceilings
  (e.g. `maxGeometryMemoryBytes`), and each report records its own tier.

### Requirement: REQ-G6 Deterministic evaluation

Evaluation MUST be a pure function: identical `(config, tier, bundle)` inputs MUST produce an
identical report across repeated calls and independent instances.

#### Scenario: identical inputs produce identical reports
- **GIVEN** two independent gate evaluations invoked with the same config, tier, and bundle.
- **WHEN** both complete.
- **THEN** their reports are deeply equal (same dimensions, budgets, actuals, and verdicts).

## Error and failure behavior

- Malformed config or an unknown tier throws a descriptive `ReleasePerformanceGate: <field>` /
  `ReleasePerformanceGate: unknown tier '<value>'` error; no partial config or report is returned.
- Evaluation is total with respect to bad actuals: a non-finite, negative, or missing actual yields
  a `withinBudget: false` entry, never an exception, so a broken measurement cannot report a false
  pass.

## Performance and resource bounds

Validation and evaluation are O(domains × tiers × dimensions), each step O(1), with allocation
limited to the report object and its entries. No hot-path, render, or simulation loop code is
touched.

## Compatibility and migration

Additive. A new module plus tests; no existing module, public symbol, persistence format, or
protocol version change. No stored data changes, so no migration.

## Security and integrity

No I/O, no network, no persistence. All numeric inputs are validated as positive finite numbers;
all actuals are validated at evaluation so malformed measurements cannot produce a false pass.

## Observability

The report exposes per-dimension `{ dimension, tier, budget, actual, withinBudget }` entries and an
overall `withinBudget` verdict, so a failing build names every offending dimension with budget vs
actual. Actuals are recorded in `verification.md`.

## Verification mapping

- `tests/unit/release-performance-gate.test.ts` — REQ-G1..REQ-G6: tier-set enumeration, invalid-tier
  rejection, full-matrix acceptance, missing/extra/unknown-field rejection, non-positive/non-finite/
  non-numeric budget rejection, all-within pass, single-violation fail, boundary equality,
  missing/malformed actual, per-tier row isolation, determinism.
