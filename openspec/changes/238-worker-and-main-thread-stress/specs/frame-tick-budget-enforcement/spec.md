# Spec: frame-tick-budget-enforcement

## Contract

Under saturation, the engine MUST hold its frame budget (075) and MUST detect a per-tick budget
overrun. Frame enforcement reuses `RenderPerformanceMonitor`/`evaluateRenderBudget` (075): a saturated
frame loop drives the monitor and a violation is reported when any dimension exceeds its budget. A new
`TickBudgetMonitor` wraps any `TickSystem` and MUST record a per-tick wall-time overrun and expose a
violation verdict without silently consuming unbounded time. Budget configs MUST validate strictly
(positive finite numbers). Determinism comes from injectable clocks.

## Definitions

- **Frame budget (075)**: `RenderBudgetConfig` over draw calls, mesh-build millis, frame-time millis,
  geometry-memory bytes, and render-distance chunks; a dimension is within budget iff
  `actual <= budget`, and non-finite or negative actuals violate.
- **Tick budget**: `maxTickMillis`, the wall-time budget for a single `TickSystem.tick` call
  (intentionally well below the 50 ms `TICK_MS`).
- **Overrun**: a `TickSystem.tick` whose elapsed wall time exceeds `maxTickMillis`.
- **Saturated frame loop**: a scripted loop that issues a worst-case draw-call/build workload each
  frame while driving the monitor through `beginFrame`/`endFrame`.

## Invariants

- Every budget field is a positive finite number (validated before use).
- Frame evaluation: `withinBudget = actual <= budget`; malformed actuals violate; overall = all within.
- `TickBudgetMonitor.tick` MUST NOT throw on an overrun; it records the overrun and exposes it.
- The tick budget is separate from the frame budget: a frame may be within budget while a tick
  overruns, and vice versa; both MUST be evaluated independently.
- Identical scripted clocks and call sequences produce identical reports.

## Requirements

### Requirement: frame budget enforced under saturation
A saturated frame loop driven through `RenderPerformanceMonitor` MUST report a violation when any
dimension exceeds its budget, and `withinBudget: true` when every dimension is at or below budget.

#### Scenario: saturated frame violates
- **GIVEN** a fake clock and a frame that records draw calls and frame time above
  `maxDrawCalls`/`maxFrameTimeMillis`
- **WHEN** the frame completes and `evaluate(config)` runs
- **THEN** those dimensions have `withinBudget: false` and the overall verdict is false.

#### Scenario: frame within budget
- **GIVEN** a frame whose recorded values are all at or below the budget
- **WHEN** `evaluate(config)` runs
- **THEN** every entry and the overall verdict are `withinBudget: true`.

#### Scenario: malformed actual violates
- **GIVEN** a recorded draw-call or frame-time value that is negative or non-finite
- **WHEN** `evaluate(config)` runs
- **THEN** the affected dimension violates and the overall verdict is false.

### Requirement: tick budget overrun detection
`TickBudgetMonitor.tick` MUST time the wrapped `TickSystem.tick` with the injectable clock and MUST
expose the last tick's elapsed time, the number of overruns, the last overrun time, and a
`withinBudget` verdict. An overrun MUST NOT throw and MUST NOT stop the process on its own.

#### Scenario: overrun recorded
- **GIVEN** a slow `TickSystem` whose `tick` takes longer than `maxTickMillis` under a scripted clock
- **WHEN** `TickBudgetMonitor.tick` runs
- **THEN** `overruns` increments, `lastOverrunMillis` exceeds `maxTickMillis`, `sample().withinBudget`
  is false, and no exception is thrown.

#### Scenario: within-budget tick
- **GIVEN** a fast `TickSystem` whose `tick` completes within `maxTickMillis`
- **WHEN** `TickBudgetMonitor.tick` runs
- **THEN** `overruns` stays at 0 and `sample().withinBudget` is true.

#### Scenario: integrated into WorldTickProcess
- **GIVEN** `TickBudgetMonitor` wrapping a slow `TickSystem`, registered inside a `WorldTickProcess`
- **WHEN** `step(1)` runs
- **THEN** the process ticks (does not stop from the overrun alone), and the monitor reports the
  overrun.

### Requirement: strict budget-config validation
`validateWorkerSaturationConfig`, `validateLightSaturationConfig`, `validateSaveSaturationConfig`,
`validatePathfindSaturationConfig`, the frame config validator (075), and `validateTickBudgetConfig`
MUST accept exactly valid shapes and MUST throw descriptive errors otherwise.

#### Scenario: invalid config rejected
- **GIVEN** a budget config with a 0, negative, NaN, Infinity, string, null, or missing field
- **WHEN** validation runs
- **THEN** it throws an error naming the field, and no budget is applied.

#### Scenario: valid config accepted
- **GIVEN** all fields positive finite numbers
- **WHEN** validation runs
- **THEN** it returns the narrowed config unchanged.

### Requirement: independent frame and tick verdicts
Frame-budget evaluation and tick-budget evaluation MUST be independently reportable: a frame can be
within budget while a tick overruns, and the two verdicts MUST NOT mask each other.

#### Scenario: frame within, tick over
- **GIVEN** a frame within its budget and a `TickSystem` that overruns `maxTickMillis`
- **WHEN** both are evaluated
- **THEN** the frame report is within budget and the tick report is not, and each names its own
  dimension with budget vs actual.

### Requirement: determinism
Identical scripted clocks and identical call sequences MUST produce identical frame and tick reports.

#### Scenario: scripted clocks agree
- **GIVEN** two monitors with identical fake clocks and call sequences
- **WHEN** both evaluate
- **THEN** the reports are deeply equal.

## Error and failure behavior

- Invalid budget configs throw descriptive errors before any budget is applied.
- `RenderPerformanceMonitor` misuse (unbalanced frame/build lifecycle, invalid recorded values)
  throws per 075; `TickBudgetMonitor` is non-throwing on overrun by design.
- A `TickSystem` that throws still stops `WorldTickProcess` per 224 semantics (unchanged); the monitor
  observes this through the process rather than masking it.

## Performance and resource bounds

The monitor adds O(1) per tick/frame; reports allocate one small object. The tick budget default is
intentionally below `TICK_MS=50` so an overrun is caught early. Wall-clock suites use the documented
median-with-warmup protocol; functional suites use scripted clocks.

## Compatibility and migration

Frame-budget enforcement reuses 075 unchanged (additive wiring only). `TickBudgetMonitor` is a new,
additive module. No existing module, payload, or stored-data changes; no migration.

## Security and integrity

Budgets prevent unbounded frame/tick time under saturation, protecting the whole simulation loop.
All inputs validated; deterministic verdicts prevent order-dependent masking.

## Observability

Frame reports name the failing dimension with budget vs actual (075); `TickBudgetMonitor.sample()`
exposes `lastTickMillis`, `overruns`, `lastOverrunMillis`, and `withinBudget` for diagnosing a hot
`TickSystem`.

## Verification mapping

- `tests/unit/TickBudgetMonitor.test.ts` — overrun detection, within-budget ticks, integration inside
  `WorldTickProcess`, verdict shape, scripted-clock determinism, `validateTickBudgetConfig`.
- `tests/unit/WorkerSaturationHarness.test.ts`, `LightSaturation.test.ts`,
  `SaveQueueSaturation.test.ts`, `PathfindSaturation.test.ts` — per-area config validation
  (strict rejection + acceptance).
- A frame-budget-under-saturation suite (reusing 075's `RenderPerformanceMonitor` with a fake clock)
  asserts violation/within/malformed verdicts.
