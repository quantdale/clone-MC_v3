# Spec: render-performance-contract

## Contract

`RenderBudgetConfig` MUST declare positive-finite budgets for draw calls, mesh-build millis,
frame-time millis, geometry-memory bytes, and render-distance chunks; `validateRenderBudgetConfig`
MUST reject anything else. `evaluateRenderBudget(config, metrics)` MUST report per-dimension
`withinBudget = actual <= budget` (non-finite or negative actuals violate) plus an overall verdict
(within only when every dimension is). `RenderPerformanceMonitor` MUST aggregate per-frame metrics
deterministically with an injectable clock, MUST reset per-frame accumulators at `beginFrame`, MUST
measure frame time between begin/end, MUST accumulate mesh-build time between begin/end with
explicit misuse failures, and MUST validate recorded values.

## Definitions

- **Dimension**: one of `maxDrawCalls`, `maxMeshBuildMillis`, `maxFrameTimeMillis`,
  `maxGeometryMemoryBytes`, `maxRenderDistanceChunks`.
- **Metrics**: `{ drawCalls, meshBuildMillis, frameTimeMillis, geometryMemoryBytes,
  renderDistanceChunks }` — a plain snapshot.
- **RenderBudgetReport**: `{ withinBudget, entries[] }` with one entry per dimension.

## Invariants

- All config fields are positive finite numbers.
- `withinBudget` per dimension = `actual <= budget`; non-finite or negative actuals are violations.
- Overall `withinBudget` = every dimension within budget.
- The monitor's per-frame accumulators (draw calls, mesh-build millis) reset at `beginFrame`.
- `frameTimeMillis` is the last completed frame's duration (0 before the first `endFrame`).

## Requirements

### Requirement: config validation
`validateRenderBudgetConfig(input)` MUST accept exactly the valid shape and MUST throw descriptive
errors otherwise.

#### Scenario: valid config accepted
- **GIVEN** five positive finite numbers
- **WHEN** validation runs
- **THEN** it returns the same value (narrowed).

#### Scenario: invalid values rejected
- **GIVEN** any field of 0, a negative number, NaN, or a non-number
- **WHEN** validation runs
- **THEN** it throws an error naming the field.

### Requirement: evaluation
`evaluateRenderBudget` MUST produce one entry per dimension and the overall verdict.

#### Scenario: all within budget
- **GIVEN** metrics at or below every budget
- **WHEN** evaluation runs
- **THEN** every entry has `withinBudget: true` and the report's `withinBudget` is true.

#### Scenario: single violation
- **GIVEN** metrics where exactly `drawCalls` exceeds `maxDrawCalls`
- **WHEN** evaluation runs
- **THEN** the drawCalls entry is false, all others true, and the overall verdict is false.

#### Scenario: boundary equality
- **GIVEN** `actual === budget` for a dimension
- **WHEN** evaluation runs
- **THEN** that dimension is within budget.

#### Scenario: malformed metrics
- **GIVEN** a negative or NaN actual for any dimension
- **WHEN** evaluation runs
- **THEN** that dimension violates.

### Requirement: monitor frame lifecycle
The monitor MUST measure frame time between `beginFrame`/`endFrame` and reset per-frame
accumulators at `beginFrame`.

#### Scenario: frame time measured
- **GIVEN** a fake clock advancing 10ms between begin and end
- **WHEN** a frame completes
- **THEN** `sample().frameTimeMillis` is 10.

#### Scenario: per-frame reset
- **GIVEN** recorded draw calls and mesh-build time in frame 1
- **WHEN** frame 2 begins
- **THEN** `sample()` shows zeroed draw calls and mesh-build time (frame time still from frame 1).

#### Scenario: unbalanced lifecycle throws
- **GIVEN** `endFrame` without `beginFrame`, or `beginMeshBuild` twice, or `endMeshBuild` without
  begin
- **WHEN** the call runs
- **THEN** it throws.

### Requirement: recorded values validated
`recordDrawCalls`, `setGeometryMemory`, and `setRenderDistanceChunks` MUST reject non-integer or
negative values.

#### Scenario: invalid counts rejected
- **GIVEN** a negative, fractional, or NaN count
- **WHEN** the setter runs
- **THEN** it throws and the monitor state is unchanged.

### Requirement: determinism
Identical scripted clock sequences MUST produce identical samples.

#### Scenario: scripted clocks agree
- **GIVEN** two monitors with identical fake clocks and identical call sequences
- **WHEN** both sample
- **THEN** the samples are deeply equal.

## Error and failure behavior

- Validation and monitor misuse throw descriptive `Error`s.
- Evaluation is total: malformed actuals yield violations, never exceptions.

## Performance and resource bounds

Monitor calls are O(1); sample/report allocate one small object each.

## Compatibility and migration

Additive: two new modules + one test file; no existing behavior changes.

## Security and integrity

Not applicable: no I/O; all inputs validated.

## Observability

Reports name the failing dimension with budget vs actual; tests assert exact values.

## Verification mapping

- `tests/unit/RenderPerformance.test.ts` — config validation matrix; evaluation scenarios;
  monitor frame lifecycle, mesh-build accumulation and guards, setters, per-frame reset,
  sample/evaluate integration; scripted-clock determinism.
