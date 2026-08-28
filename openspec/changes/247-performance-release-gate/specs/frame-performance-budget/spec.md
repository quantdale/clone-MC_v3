# Spec: frame-performance-budget

## Contract

The frame domain of the release gate. A measured frame workload for a declared tier MUST stay
within that tier's five frame ceilings (`maxDrawCalls`, `maxMeshBuildMillis`, `maxFrameTimeMillis`,
`maxGeometryMemoryBytes`, `maxRenderDistanceChunks`). The headless measurement MUST use the 075
`RenderPerformanceMonitor` surface (injectable clock for deterministic correctness, wall clock for
the real frame-time ceiling) on the canonical render scenario and MUST produce the frame actuals of
the `ReleaseMeasurementBundle`. Boundary equality counts as within budget; a malformed actual is a
violation. This spec defines the measurement and its per-tier budgets; it introduces no production
behavior and does not modify the 075 monitor.

## Definitions

- **Canonical render scenario (`CANONICAL_RENDER`)**: a deterministic, headless workload run at the
  selected tier's `maxRenderDistanceChunks`, composed of a representative, fixed set of section
  meshes, draw submissions, and mesh builds driven through `RenderPerformanceMonitor`. The scenario
  is fixed per tier so a later run measures the same work.
- **Frame dimensions**: `maxDrawCalls`, `maxMeshBuildMillis`, `maxFrameTimeMillis`,
  `maxGeometryMemoryBytes`, `maxRenderDistanceChunks`.
- **Measurement**: `beginFrame` → per-mesh `beginMeshBuild`/`endMeshBuild` → record draw calls →
  `setGeometryMemory`/`setRenderDistanceChunks` → `endFrame` → `sample()`; the `sample()` values
  are the `bundle.frame` actuals. `frameTimeMillis` uses a wall-clock pass for the real ceiling and
  the injectable clock for determinism.

## Invariants

- The five frame ceilings are positive finite numbers (gate config validation).
- Per-dimension `withinBudget = actual <= budget`; boundary equality within; non-finite/negative
  actuals violate.
- The monitor lifecycle is balanced: `beginFrame`/`endFrame` and `beginMeshBuild`/`endMeshBuild`
  pair; misuse throws and MUST NOT produce a measurement.
- The scenario runs at the tier's `maxRenderDistanceChunks`, never above it.

## Requirements

### Requirement: REQ-F1 Per-tier frame budgets

A declared tier MUST have exactly these frame ceilings (authoritative source:
`DEFAULT_RELEASE_BUDGETS`):

| dimension | Low | Medium | High | Ultra |
|---|---|---|---|---|
| maxDrawCalls | 500 | 1000 | 1500 | 2500 |
| maxMeshBuildMillis | 4 | 6 | 8 | 12 |
| maxFrameTimeMillis | 33.3 | 16.7 | 16.7 | 16.7 |
| maxGeometryMemoryBytes | 134217728 | 268435456 | 402653184 | 536870912 |
| maxRenderDistanceChunks | 8 | 12 | 16 | 24 |

#### Scenario: the tier's ceilings are the evaluation budget row
- **GIVEN** a `Low` frame measurement with `drawCalls = 500`, `meshBuildMillis = 4`,
  `frameTimeMillis = 33.3`, `geometryMemoryBytes = 134217728`, `renderDistanceChunks = 8`.
- **WHEN** the frame dimension is evaluated for the `Low` tier.
- **THEN** every frame dimension reports `withinBudget: true` and the frame contribution to the
  overall verdict is within budget.

#### Scenario: a tier-boundary frame actual exceeds the ceiling
- **GIVEN** a `Low` frame measurement with `renderDistanceChunks = 12` (above `Low`'s 8) and all
  other `Low` frame dimensions within budget.
- **WHEN** the frame dimension is evaluated.
- **THEN** `maxRenderDistanceChunks` reports `withinBudget: false` and the overall verdict is false.

### Requirement: REQ-F2 Headless frame measurement method

The frame actuals MUST be produced by driving `RenderPerformanceMonitor` over `CANONICAL_RENDER`:
one `beginFrame`/`endFrame` per measured frame, each mesh build wrapped in
`beginMeshBuild`/`endMeshBuild`, draw calls recorded at the draw-API surface, memory/distance set on
change, and `sample()` read once per frame for the actuals. The measured render distance MUST be the
tier's `maxRenderDistanceChunks`.

#### Scenario: canonical scenario produces a complete bundle
- **GIVEN** a fresh monitor and a `Medium` `CANONICAL_RENDER` scenario at render distance 12.
- **WHEN** one frame is measured end-to-end.
- **THEN** `bundle.frame` contains five non-negative finite numbers, `renderDistanceChunks === 12`,
  and the monitor's `evaluate` against the `Medium` frame row reports a verdict with all five
  entries present.

#### Scenario: unbalanced monitor lifecycle throws and yields no measurement
- **GIVEN** a monitor where `endFrame` is called without `beginFrame` (or `endMeshBuild` without
  `beginMeshBuild`).
- **WHEN** the measurement runs.
- **THEN** it MUST throw a descriptive `RenderPerformanceMonitor:` error and MUST NOT yield frame
  actuals, so no false pass is possible.

### Requirement: REQ-F3 Frame budget violation

A frame measurement whose actual exceeds a tier ceiling MUST fail the frame domain and the gate.

#### Scenario: frame-time overrun fails the gate
- **GIVEN** a `Medium` measurement with `frameTimeMillis = 20` (above `Medium`'s 16.7).
- **WHEN** the frame domain is evaluated.
- **THEN** `maxFrameTimeMillis` reports `withinBudget: false`, the report names it with budget vs
  actual, and the overall verdict is false.

#### Scenario: mesh-build time overrun fails the gate
- **GIVEN** a `High` measurement with `meshBuildMillis = 10` (above `High`'s 8).
- **WHEN** the frame domain is evaluated.
- **THEN** `maxMeshBuildMillis` reports `withinBudget: false` and the overall verdict is false.

### Requirement: REQ-F4 Deterministic frame measurement

Under the monitor's injectable clock, identical scripted clock sequences over `CANONICAL_RENDER`
MUST produce identical frame actuals, independent of wall-clock speed.

#### Scenario: scripted clocks agree
- **GIVEN** two monitors with identical scripted clocks and identical `CANONICAL_RENDER` call
  sequences.
- **WHEN** both measure a frame.
- **THEN** their `bundle.frame` deterministic values (draw calls, mesh-build millis, geometry
  memory, render distance, and scripted frame time) are deeply equal.

## Error and failure behavior

Monitor misuse (unbalanced frame/build lifecycle, negative/fractional recorded values) throws a
descriptive `RenderPerformanceMonitor:` error and yields no measurement, so a broken measurement
cannot produce a false pass. A malformed actual in the bundle is treated as a violation by the gate.

## Performance and resource bounds

Monitor calls are O(1) per recorded value beyond the underlying scenario cost; the scenario is fixed
per tier and bounded. The frame ceilings are ceilings, not targets; actuals are recorded in
`verification.md` and may be tightened later, never loosened silently.

## Compatibility and migration

Additive. Measurement consumes the 075 monitor unchanged; no existing module or public symbol
changes, no persistence, no migration.

## Security and integrity

No I/O; all recorded values validated as non-negative finite numbers; gate evaluation rejects
malformed actuals, so a broken measurement cannot report a false pass.

## Observability

The gate report names any failing frame dimension with budget vs actual; actuals are recorded in
`verification.md`.

## Verification mapping

- `tests/unit/release-frame-budget.test.ts` — REQ-F1..REQ-F4: per-tier ceiling row, boundary within,
  tier-boundary overrun, canonical-scenario bundle completeness, unbalanced-lifecycle throw with no
  measurement, frame-time and mesh-build overrun failures, scripted-clock determinism.
