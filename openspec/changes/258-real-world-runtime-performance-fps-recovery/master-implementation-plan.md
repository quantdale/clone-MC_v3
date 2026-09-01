# Master Implementation Plan — Change 258 Real-World FPS Recovery

## Mission

Turn the reported very low framerate into a measured engineering problem and continue until default
desktop gameplay is demonstrably smooth on the recorded reference host. Optimize the shipped path,
not a headless/benchmark substitute.

## Entry interlock

Change 257 is reopened. Do not implement 258 production code until 257 is VERIFIED again.

## Why this exists despite prior performance changes

Three blind spots remain:

1. headless runs use much cheaper settings;
2. worker meshing exists but Game does not production-enable it;
3. current performance framing measures render-side time, not the complete rAF frame.

The owner report is therefore authoritative evidence that earlier certification is incomplete.

## Phase 0 — Establish truth

Record environment, production headed baseline, stationary/fresh/cached/interaction/entity scenarios,
screenshots, trace and top-three bottlenecks.

**Exit:** attribution explains at least 80% of p95 long-frame debt, or the missing attribution itself
becomes the next instrumentation task.

## Phase 1 — Fix measurement

Make rAF-to-rAF the frame authority; keep render-submit separate. Add phase timers and fixed rings.
Build a canonical headed runner that refuses software rendering.

**Exit:** injected busy work appears in the correct phase and fails the gate; instrumentation overhead
is bounded.

## Phase 2 — Remove synchronous meshing pressure

Activate worker meshing in production with capability checks, conservative pool sizing, stale guards,
failure fallback and parity tests.

**Exit:** fresh traversal main-thread/p95 improves, visuals/correctness stay green, worker crash
recovers via fallback.

## Phase 3 — Put background work inside the frame

Replace the 12+4+3 ms independent-spend model with a shared adaptive governor. Reserve input/render
time, throttle quickly, recover slowly, ensure bounded progress.

**Exit:** fresh traversal no longer shows repeated background monopolization; queues drain and age is
bounded.

## Phase 4 — Profile-driven hot paths

In measured order: streaming scans, terrain generation, mesh packing/expansion, lighting, upload,
unload/dispose, simulation/entity/collision, UI writes, allocations/GC.

For each:
1. capture before trace;
2. one conceptual optimization;
3. focused correctness tests;
4. exact perf rerun;
5. keep only meaningful wins without regression.

## Phase 5 — Renderer/GPU

After CPU stalls: draw calls/material/object counts, visibility, shadows, clouds/environment,
drawing-buffer/DPR/dynamic resolution. No silent default-quality downgrade.

## Phase 6 — Certification

Run stationary 30 s, fresh 60 s, cached 60 s, interaction, entity/day-night, sustained resources,
then full repository gates.

Thresholds:
- stationary >=55 avg FPS; p95 <=22 ms; p99 <=33 ms; >50 ms <=1%;
- fresh >=45 avg; p95 <=28 ms; p99 <=50 ms; no recurring >100 ms pattern;
- cached >=55 avg and no rolling 10 s <45 FPS;
- interaction/entity no sustained 10 s <45 FPS.

## Required discipline

Measure first; fix top bottleneck; remeasure. Prefer architecture/hot-path fixes over quality cuts.
Do not bundle speculative optimizations. Preserve deterministic hashes/save semantics. Capture visual
evidence for renderer changes. Keep worker/scheduler fallbacks. Publish truthful metric checkpoints.

## Final evidence packet

Include start/final SHA, environment, before/after scenario table, whole-frame/phase percentiles,
rolling minima/long frames, draw/triangle/buffer metrics, worker utilization, queue peaks/age,
resource trend, optimization deltas, residual bottlenecks, screenshot/trace paths, full regression
counts, exact published SHA and successful CI.

## Stop conditions

Remain ACTIVE/BLOCKED if only headless/software proof exists; thresholds fail; quality was silently
reduced; worker fallback can lose/stale chunks; resources leak; visual/gameplay/persistence regress;
or final CI is pending/cancelled/failed.
