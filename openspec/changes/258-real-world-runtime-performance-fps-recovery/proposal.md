# Proposal: 258-real-world-runtime-performance-fps-recovery

## Problem

The owner reports severe low framerate during normal gameplay. That user-visible failure overrides the
assumption that Changes 247/254/255 proved acceptable runtime performance.

Current source explains why earlier evidence can miss the problem:

- desktop defaults use render distance 6, simulation distance 6, shadows, antialiasing, clouds, and
  device pixel ratio up to 2;
- headless automation intentionally uses render/simulation distance 1, DPR 1, no clouds, and no
  shadows, so it is not representative of the reported desktop path;
- the configured main-thread background budgets are 12 ms chunk work + 4 ms light drain + 3 ms
  upload planning, which can consume more than a 16.67 ms 60-FPS frame before normal rendering,
  input, simulation, GC, and browser overhead;
- validated worker meshing exists, but `WorldComposition.workerMeshing` defaults false and
  `Game` does not enable it in the production composition;
- dynamic resolution can reduce GPU fill cost but cannot repair CPU stalls from generation,
  synchronous meshing, lighting, uploads, simulation, allocations, or excessive draw work;
- the current `RenderPerformanceMonitor` is bracketed inside `Game.render()`, so its frame timing
  does not include the entire update/world-work/render requestAnimationFrame interval.

## Goals

1. Reproduce and quantify the owner's low-FPS report in a headed, GPU-backed browser at the actual
   desktop defaults.
2. Add end-to-end frame timing and subsystem attribution so every lost millisecond has an owner.
3. Fix the dominant CPU/GPU bottlenecks rather than masking them by silently lowering quality.
4. Enable the already-validated worker meshing path in production when capability checks pass, with
   deterministic synchronous fallback.
5. Replace oversized fixed background work with adaptive frame-budget governance that preserves
   responsiveness while preventing starvation.
6. Optimize streaming/generation/meshing/lighting/upload/render/simulation/GC hot paths in measured
   priority order.
7. Preserve gameplay determinism, persistence, visual correctness, and existing feature behavior.
8. Add a reproducible headed performance certification that fails when default gameplay regresses.
9. Make the real default desktop path the primary release-performance authority; headless/synthetic
   tests remain supporting evidence only.

## Non-goals

- No engine rewrite.
- No gameplay/content expansion.
- No default render-distance, simulation-distance, shadow, cloud, FOV, texture, or visual-quality
  reduction before measured architectural/hot-path fixes are exhausted.
- No hiding failures by using headless Chromium, SwiftShader, DPR 1, render distance 1, or a tiny test
  world as the primary benchmark.
- No benchmark-only code path that the shipped game does not use.
- No change to persistence semantics unless required to eliminate measured save/autosave stalls, in
  which case compatibility and durability MUST be preserved.
- No false 60-FPS claim on hardware/browser conditions that cannot sustain it; evidence must include
  exact host/browser/GPU/viewport/DPR and observed metrics.

## Preconditions

- Change 257 MUST be VERIFIED again with its post-review integrity repairs complete.
- Work begins from current `origin/main` and records `session_start_head`.
- A GPU-backed headed browser must be available for the canonical measurement lane. If unavailable,
  Change 258 remains BLOCKED rather than substituting headless proof.

## Dependencies

- 075 RenderPerformanceMonitor / RenderBudget.
- 238 worker/main-thread stress machinery.
- 247 release-performance gate.
- 254 whole-codebase hot-path optimizations.
- 255 worker meshing, upload scheduling, LOD and dynamic-resolution infrastructure.
- Current World/ChunkPipeline/lighting/renderer observability surfaces.

## Proposed change

Create a production-representative performance harness and use it to drive a measured optimization
campaign:

1. measure whole frames — rAF interval, update, world streaming, simulation, render, long tasks,
   queue depth, memory/resource and worker metrics;
2. remove main-thread spikes — production worker meshing, bounded/incremental generation, adaptive
   background budgets, upload/light scheduling and backpressure;
3. reduce steady-state cost — streaming scans, draw calls, shadows/clouds, entity/tick scans,
   allocations, cache misses and redundant per-frame work;
4. tune without cheating — only after structural fixes, calibrate explicit quality-tier/adaptive
   behavior where necessary with visual evidence;
5. certify real play — headed default-quality stationary, fresh traversal, cached traversal,
   interaction, entity/day-night and sustained-resource scenarios.

## Compatibility and migration

No save-format migration is expected. Any worker/scheduler change MUST preserve deterministic world
truth and existing persisted data. Quality settings, if made user-configurable, require backward-
compatible defaults and MUST NOT silently reinterpret existing saves.

## Risks

- Worker activation can expose serialization/parity bugs or duplicate/stale mesh races.
- Aggressive background throttling can cause visible pop-in or starvation.
- Lower allocations can accidentally reuse mutable buffers across asynchronous jobs.
- Shadow/draw-call optimization can cause visual regressions.
- Browser/GPU timing is noisy; use warm-up, fixed scenarios, repeated samples and percentile gates.
- Optimizing one phase can shift the bottleneck elsewhere; every major change requires re-profiling.

## Rollback strategy

Optimization commits must remain separable by subsystem. A change that fails correctness, visual
parity, memory/resource, or frame-time gates is reverted/disabled without reverting the measurement
harness. Worker paths retain synchronous fallback. Adaptive budgets retain conservative hard caps.

## Definition of Done

All 100 tasks complete and, on the recorded reference host in a headed GPU-backed browser at default
desktop quality:

- 30-second warmed stationary gameplay averages >=55 FPS, p95 whole-frame <=22 ms, p99 <=33 ms,
  and frames >50 ms <=1%;
- 60-second fresh-chunk traversal averages >=45 FPS, p95 <=28 ms, p99 <=50 ms, with no recurring
  >100 ms stall pattern;
- cached/revisit traversal averages >=55 FPS after warm-up;
- no rolling 10-second normal-gameplay window remains below 45 FPS after warm-up;
- production uses worker meshing when supported and proves deterministic fallback;
- queue age/backlog remains bounded with no starvation;
- memory/GPU-resource counts settle with no monotonic leak;
- visual regression, gameplay determinism, persistence, full E2E and release gates remain green;
- headed evidence records exact browser/GPU/viewport/DPR/quality and before/after metrics;
- GitHub CI succeeds on the exact published final SHA.

## Advancement gate

100% target. No exception is allowed for canonical headed scenarios, whole-frame instrumentation,
worker/fallback correctness, memory/resource stability, visual regression, full E2E, or exact-final-
SHA CI.
