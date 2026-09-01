# Spec: real-world-runtime-performance

## Contract

Real headed desktop gameplay performance is a release contract. Synthetic, microbenchmark and
headless evidence MAY support diagnosis but MUST NOT override a failing canonical headed scenario.

## Definitions

- **Canonical headed run:** production build, headed Chromium/Chrome, hardware WebGL, default desktop
  quality, recorded host/browser/GPU/viewport/DPR, fixed seed and deterministic scripted workload.
- **Whole frame:** rAF-to-rAF interval covering update, world work, simulation, presentation/render.
- **Long frame:** >50 ms. **Severe stall:** >100 ms.
- **Fresh traversal:** deterministic route requiring new streaming/generation.
- **Cached traversal:** repeat after the route has been generated/warmed.

## Invariants

1. Fixed-tick gameplay MUST be independent of render FPS.
2. Performance work MUST NOT corrupt/alter persisted world truth.
3. Worker meshing MUST reject stale results and preserve sync equivalence.
4. Background work MUST be bounded and MUST NOT starve indefinitely.
5. Canonical evidence MUST use hardware WebGL; software rendering cannot primary-PASS.
6. Default-quality reductions MUST NOT be first-line repair.
7. Telemetry MUST be bounded and low-overhead.

## Requirements

### Requirement: Canonical headed authority

The project MUST provide a reproducible headed production/default-quality runner.

#### Scenario: hardware renderer
- **GIVEN** a canonical run starts
- **WHEN** WebGL identity is collected
- **THEN** vendor/renderer MUST be recorded where supported
- **AND** SwiftShader/software rendering MUST make the run non-canonical.

#### Scenario: headless disagreement
- **GIVEN** headless tests pass
- **WHEN** canonical headed thresholds fail
- **THEN** Change 258 MUST remain unverified.

### Requirement: Whole-frame measurement

The runtime MUST measure rAF-to-rAF whole frames and distinguish them from render-submit timing.

#### Scenario: expensive update
- **GIVEN** deterministic main-thread update work is injected
- **WHEN** sampled
- **THEN** whole-frame latency MUST increase
- **AND** render-only timing MUST NOT be reported as whole-frame.

### Requirement: Phase attribution

Samples MUST distinguish fixed ticks, world update, generation, meshing, lighting, upload and render.

#### Scenario: generation spike
- **GIVEN** fresh traversal causes generation
- **WHEN** a long frame occurs
- **THEN** generation/world contribution MUST be visible in the artifact.

### Requirement: Production worker meshing

Supported shipped desktop sessions MUST use worker meshing after capability/parity checks.

#### Scenario: normal worker
- **WHEN** a section needs meshing
- **THEN** work MUST execute through the worker path
- **AND** only current-version results may attach.

#### Scenario: worker failure
- **WHEN** worker output is failed/invalid/stale
- **THEN** bounded retry/sync fallback MUST recover the chunk
- **AND** stale geometry MUST NOT attach.

### Requirement: Shared whole-frame work budget

Generation, sync fallback mesh, lighting, upload and unload MUST share a whole-frame-aware budget.

#### Scenario: overload
- **GIVEN** recent p95 exceeds target
- **WHEN** the next budget is computed
- **THEN** background allowance MUST decrease while preserving input/render reserve.

#### Scenario: recovery
- **GIVEN** healthy frame times persist
- **WHEN** backlog exists
- **THEN** allowance MAY increase gradually to hard caps.

#### Scenario: starvation
- **GIVEN** one queue remains non-empty
- **THEN** bounded progress/deadline policy MUST eventually service it.

### Requirement: Stationary performance

Warmed default stationary gameplay MUST average >=55 FPS, p95 <=22 ms, p99 <=33 ms and >50 ms
frames <=1%.

#### Scenario: 30-second stationary
- **THEN** every threshold MUST pass and raw/summary artifacts MUST be retained.

### Requirement: Fresh traversal performance

60-second fresh traversal MUST average >=45 FPS, p95 <=28 ms and p99 <=50 ms without recurring
>100 ms stalls.

### Requirement: Cached traversal performance

Cached traversal MUST average >=55 FPS and no rolling 10-second window may remain below 45 FPS.

### Requirement: Interaction/entity floor

Block interaction and representative entity/day-night workloads MUST NOT create sustained rolling
10-second windows below 45 FPS after warm-up.

### Requirement: Bounded queues

Work queues MUST have bounded depth/age and no permanent starvation; after movement stops they MUST
drain toward steady state within documented bounds.

### Requirement: Resource stability

A sustained run MUST NOT show monotonic post-settle growth in geometry, textures, workers or JS heap
proxy metrics.

### Requirement: Quality integrity

Primary optimization MUST preserve default visible quality. Any later default quality cut requires
profiling proof, explicit behavior and visual review.

### Requirement: Regression safety

If deterministic simulation, persistence, visual, unit, build or full E2E gates fail, Change 258
MUST remain unverified even when FPS improves.

### Requirement: Exact-final-SHA publication

Pending/cancelled/failed CI on the exact published final SHA MUST block VERIFIED.

## Error and failure behavior

Invalid metrics, unavailable canonical GPU, worker failure without correct fallback, starvation,
missing artifacts or incomplete scenarios fail closed.

## Performance and resource bounds

Normative thresholds are above. Telemetry storage is fixed-size. Instrumentation-enabled overhead
target <=1 ms p95 on the reference host; disabled overhead must be negligible.

## Compatibility and migration

No save migration expected. Settings changes preserve existing defaults unless explicitly approved
and visually certified.

## Security and integrity

Use a dedicated test browser profile. Performance scripts MUST NOT clear unrelated user data or
bypass persistence/stale-job validation.

## Observability

Artifacts MUST include commit, browser/GPU/viewport/DPR/quality, scenario, frame percentiles,
rolling minima, long-frame counts, phase percentiles, renderer/resource/queue/worker/resolution
metrics, memory/resource trends and pass/fail reasons.

## Verification mapping

- headed authority: tasks 28-38, 91-95
- frame/phase metrics: 16-27
- worker: 39-49
- governor: 50-60
- hot paths: 61-84
- quality: 85-90
- final thresholds/regressions/publication: 91-100
