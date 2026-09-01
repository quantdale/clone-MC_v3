# Design: 258-real-world-runtime-performance-fps-recovery

## Context/current state

### Production desktop cost

`CONFIG` defaults to renderDistance 6, simulationDistance 6, maxPixelRatio 2, antialiasing,
shadows (1024 map / 96-block distance), and clouds. Headless intentionally uses distance 1, DPR 1,
no clouds and no shadows, so green headless E2E is not evidence of desktop smoothness.

### Background budget exceeds a 60-FPS frame

Current nominal scheduling values include `mainThreadChunkMs = 12`, `lightDrainMs = 4`, and
`uploadMsPerFrame = 3`. Their 19 ms nominal total already exceeds 16.67 ms before simulation,
rendering, input, UI, browser overhead or GC.

### Worker meshing exists but is not shipped by default

`World` accepts `workerMeshing?: boolean` and owns `WorkerPool`/`MeshWorkerClient`.
`WorldComposition` documents worker meshing as opt-in and defaults to synchronous fallback.
`Game` constructs `createOverworldComposition` without enabling it.

### Current "frame" timing is incomplete

`Game.render()` brackets `perfMonitor.beginFrame()/endFrame()`. World update, generation,
meshing, lighting, simulation and input occur before that bracket. This metric cannot be treated as
whole-frame latency.

### Dynamic resolution is necessary but insufficient

Pixel scaling helps fill-rate/GPU pressure, not CPU stalls from synchronous world work.

## Target state

The shipped game owns four layers:

1. whole-frame rAF telemetry plus phase timers;
2. a shared adaptive main-thread work governor;
3. production worker meshing with deterministic fallback;
4. a real headed release gate with percentile, queue, resource and correctness criteria.

## Invariants

- Fixed-tick gameplay MUST remain deterministic independent of render FPS.
- Worker and sync meshing MUST be semantically equivalent.
- Stale worker results MUST NOT overwrite newer section versions.
- Background work MUST NOT consume the entire frame budget or starve indefinitely.
- Dynamic quality MUST NOT change simulation truth.
- Default-quality reductions MUST NOT be first-line repair.
- Telemetry MUST be bounded in memory and low-overhead.
- Canonical perf MUST be headed, hardware-WebGL, production-build and must record renderer identity.
- No optimization may reduce save durability, visual correctness, input responsiveness or world
  correctness to gain FPS.

## API and data model

Conceptual intent:

```ts
interface WholeFrameSample {
  rafIntervalMs: number;
  updateMs: number;
  simulationMs: number;
  worldUpdateMs: number;
  generationMs: number;
  meshingMainMs: number;
  workerDispatchMs: number;
  lightingMs: number;
  uploadMs: number;
  renderSubmitMs: number;
  uiMs: number;
  queueDepths: { generate:number; mesh:number; upload:number; unload:number };
  worker: { enabled:boolean; pending:number; inFlight:number; completed:number; fallbacks:number };
  renderer: { calls:number; triangles:number; geometries:number; textures:number };
  drawingBuffer: { width:number; height:number };
  dynamicResolutionScale: number;
}

interface FrameBudgetDecision {
  targetFrameMs: number;
  reservedRenderMs: number;
  availableBackgroundMs: number;
  perClassMs: { generation:number; meshMain:number; lighting:number; upload:number; unload:number };
  overloaded: boolean;
}
```

Use fixed-size recent-history storage (for example 600 samples). Expensive diagnostics are enabled by
the perf harness/debug mode; minimal counters may remain always-on.

## Control/data flow

```text
requestAnimationFrame(t)
  -> close previous whole-frame sample (t - previousRaf)
  -> input/pause
  -> fixed tick catch-up (bounded)
  -> World.update
       -> FrameBudgetGovernor computes remaining safe background budget
       -> generation / worker dispatch
       -> worker completions -> bounded ready/upload
       -> lighting under remaining budget
       -> unload under remaining budget
  -> presentation/entity/UI
  -> renderer.render
  -> renderer.info + buffer + dynamic-resolution metrics
  -> publish sample

headed perf scenario
  -> warm-up
  -> sample + trace/long tasks
  -> deterministic movement/actions
  -> JSON + screenshots + summary
  -> threshold evaluation
```

## Detailed behavior

### Whole-frame instrumentation

Add top-level rAF interval timing. Rename/treat existing monitor frame duration as render-submit
timing where appropriate. Attribute fixed ticks, world update, generation, sync mesh, worker
dispatch/completion, lighting, uploads, unload, UI and render. Measure instrumentation overhead.

### Canonical headed harness

Separate from normal headless E2E. It MUST use the production build, reject software/SwiftShader as
canonical, record browser/OS/logical cores/WebGL renderer/vendor/viewport/DPR/drawing buffer/quality
and commit SHA, use fixed deterministic scenarios, warm up, repeat samples, emit raw + percentile
JSON, capture screenshots, and collect long-task/CDP trace evidence where supported.

### Worker meshing activation

Enable production worker meshing after capability checks. Size the pool conservatively, leaving
main/browser capacity. Preserve stale-version guards and sync fallback. Runtime worker failures must
not drop chunks.

### Adaptive frame governor

Target 16.67 ms for default desktop. Reserve recent-percentile-derived render/input time, allocate
only the remainder to background work, reduce quickly on overload, recover gradually, guarantee
bounded progress per queue, and apply count/byte/age backpressure. Static CONFIG values remain hard
maxima, not guaranteed spending targets.

### Streaming/generation/meshing/lighting/upload

Profile first. Candidate repairs include incremental generation, reusable scratch buffers, reduced
resident-set rescans/key churn, coalesced dirty/remesh requests, early stale rejection, bounded light
coalescing, and actual-time/byte upload deferral. Workerize generation only if profiling proves the
serialization/transfer trade is favorable. Seeded output MUST remain exact.

### Renderer/GPU

Measure draw calls, triangles, geometry count, shadow passes, drawing-buffer pixels and dynamic
resolution. Optimize redundant objects/material state, visibility, shadow caster/update scope,
cloud/environment work and unnecessary state changes. Explicit quality tuning is allowed only after
structural fixes and requires visual evidence.

### Simulation/entities/allocations

Profile fixed-tick catch-up, active-region scans, collision/raycast, HUD writes and hot temporary
allocations. Remove only measured costs. Preserve 20 TPS authoritative results.

## Failure modes

- No headed hardware GPU lane -> BLOCKED, not headless substitute.
- Worker failure -> bounded sync fallback with reason telemetry.
- Invalid governor telemetry -> conservative low background budget.
- Queue starvation -> test failure.
- Target not met -> remain ACTIVE with top measured bottleneck.
- Visual/correctness regression -> reject optimization even if FPS improves.

## Compatibility/migration

No save migration expected. Worker/governor state is ephemeral. New quality settings, if any, use
backward-compatible local settings and never world truth.

## Performance/resource constraints

- fixed-size telemetry;
- worker pool leaves main/browser capacity;
- one shared background budget;
- bounded queue depth/age;
- instrumentation-enabled overhead target <=1 ms p95 on reference host;
- no monotonic post-settle growth in geometries/textures/workers/heap proxy.

## Testing seams

Unit tests for governor and telemetry; worker parity/stale/failure tests; deterministic generation
hashes; headed production perf runner; long-task/CDP evidence; visual matrix; full E2E.

## Observability/debugging

Each canonical artifact includes commit, host/browser/GPU/viewport/DPR/quality, scenario, whole-frame
p50/p95/p99, average FPS, rolling minima, long-frame counts, phase percentiles, draw/resource
metrics, queues, workers, resolution history, memory/resource trends, bottleneck attribution and
pass/fail reasons.

## Affected files/symbols

Expected: `Game.ts`, `GameLoop.ts`, `config/index.ts`, `World.ts`,
`WorldComposition.ts`, `RenderPerformanceMonitor.ts`, RenderBudget/new FrameBudgetGovernor,
worker meshing/pool modules, and only trace-proven renderer/environment/lighting/entity/UI modules.

## Rejected alternatives

- render distance 2 as primary fix;
- disabling shadows/clouds as default repair;
- trusting headless E2E;
- dynamic resolution alone;
- microbenchmarks alone;
- engine rewrite.

## Downstream dependencies

No Change 259 is authorized. Any unresolved architecture blocker must block 258 or receive explicit
owner authorization; it cannot be silently deferred while marking 258 VERIFIED.
