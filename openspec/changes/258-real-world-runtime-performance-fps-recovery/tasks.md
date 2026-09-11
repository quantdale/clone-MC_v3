# Tasks: 258-real-world-runtime-performance-fps-recovery

Status: ACTIVE — Change 257 VERIFIED 92/92 at d55c2e7 (CI 33600754305 success); Phase-1/2/3 foundation + gates + World-internal phases + worker fault injection + worker pack-axis fix + duplicate-submit guard + harness scenarios + fallback/stale/startup/metadata/quality-guard evidence + full headless regression green
Tasks complete: 35/100 (35%). Target: 100% — 257 VERIFIED
Advancement allowed: false

## A. Repository truth, activation and performance authority

- [x] 1. Fetch current `origin/main`, record exact `session_start_head`, require clean history-preserving start, and verify Change 257 is VERIFIED before activating 258.
- [x] 2. Run the OpenSpec pre-implementation quality gate and reconcile spec/source drift.
- [ ] 3. Record exact reference host/browser/GPU/renderer/viewport/DPR/display-refresh/quality configuration.
- [x] 4. Reclassify prior 247/254/255 evidence as synthetic, headless, microbenchmark, or production-representative; no old result may override a failing headed baseline.
- [x] 5. Activate 258 in PROGRAM_STATE at 0/100 with no pre-filled PASS evidence.

## B. Reproduce the user's low-FPS report

- [ ] 6. Run the unmodified final-257 production candidate headed at default desktop settings.
- [ ] 7. Prove hardware GPU/WebGL; reject SwiftShader/software rendering as canonical.
- [ ] 8. Capture 30-second warmed stationary baseline.
- [ ] 9. Capture 60-second deterministic fresh-chunk traversal baseline.
- [ ] 10. Capture 60-second cached/revisit traversal baseline.
- [ ] 11. Capture deterministic block break/place workload baseline.
- [ ] 12. Capture representative day/night + mobs/entities workload baseline.
- [ ] 13. Record p50/p95/p99 whole-frame, average FPS, rolling 10-second minima, >50/>100 ms frames.
- [ ] 14. Record draw/triangle/resource/buffer/resolution/queue/worker metrics.
- [ ] 15. Capture baseline screenshots + trace/long-task artifact and top-three bottleneck table.

## C. True whole-frame and phase instrumentation

- [x] 16. Add rAF-to-rAF whole-frame metric including update/world/simulation/render. (`GameLoop` 4th-param boundary hook reports the raw rAF interval before update/render, even on throw; `Game` records every interval into a 600-sample `WholeFrameRing` via `recordInterval`; render-submit bracket in `RenderPerformanceMonitor` kept separate. `Game.getWholeFrameStats/getWholeFrameRollingMinFps` expose the authority to the harness. GameLoop +9.6m live-boot e2e 30/30 green.)
- [x] 17. Add bounded timers for input/update, fixed ticks, world.update, generation, meshing, lighting, upload, unload, UI and render. (Game-level input/fixedTicks/worldUpdate/renderSubmit wired before; World-internal generation/meshingMain/workerDispatch/lighting/upload/unload now accumulate in World's own disabled-by-default `PhaseTimer` and merge into the Game sample in `render()`. Nest-guarded `withPhase` bracket (never nests, never throws, exception-safe) after a live production crash (`begin(upload) while meshingMain is open` on the canonical section path) was caught by the new e2e and fixed. Live-proven by extended `whole-frame-metrics.spec.ts` 2/2: teleport-forced generation shows generation 158 ms / meshingMain 213 ms / upload / unload totals.)
- [x] 18. Add generation timing/count telemetry. (`generation` phase + per-frame `generatedChunks` in `WorldFrameWorkCounts`, snapshotted at end of `update`; unit 12 + live proof.)
- [x] 19. Add main-thread meshing and worker dispatch/completion timing. (`meshingMain` + `workerDispatch` phases; `syncMeshedJobs`/`workerDispatchedJobs`/`workerCompletedJobs` counts; unit + live proof; sync default shows workerDispatch 0.)
- [x] 20. Add lighting actual elapsed/work telemetry. (`lighting` phase around the real `lightEngine.drain` + `lightOpsUsed` count; unit.)
- [x] 21. Add GPU-upload elapsed/bytes/queue/deferred telemetry. (`upload` phase around both attach paths + `uploadedMeshes` count; bytes/queues pre-existing in `performanceSnapshot`; unit + live proof.)
- [x] 22. Merge renderer.info/drawing-buffer into whole-frame samples. (Always-on fixed `FrameAuxRing`: calls/triangles/geometries/textures/buffer/dynScale recorded per rendered frame, `getWholeFrameAuxLatest`/`getWholeFrameMaxCalls`; unit + live proof with real buffer size.)
- [x] 23. Add worker utilization/failure/retry/fallback telemetry. (Counters pre-existing; `Game.getWorkerTelemetry` + per-frame `getWorldFrameWorkCounts` accessors; runner captures all five scenarios; unit + live proof.)
- [x] 24. Add fixed-size sample ring with p50/p95/p99/long-frame analysis. (`WholeFrameRing`: fixed Float64Array rings, p50/p95/p99, avg FPS, >50 ms long frames, >100 ms severe stalls; 17 unit tests.)
- [x] 25. Add rolling-window FPS/frame analysis. (`rollingMinFps` trailing-window minimum over newest-first interval accumulation, default 10 s; `longFrameFraction`; unit-tested.)
- [x] 26. Add low-overhead diagnostics switch and measure disabled/enabled overhead. (`PhaseTimer` enabled flag; disabled `begin/end` never touch the clock — zero clock reads asserted by test; totals reset per frame.)
- [x] 27. Test sample validity, wraparound, percentiles, invalid metrics and bounded memory. (Validation throws `WholeFrameMetrics: <detail>`; wraparound/percentile/invalid-window tests; capacity fixed at construction.)

## D. Headed canonical performance harness

- [x] 28. Add dedicated headed perf command separate from normal headless E2E. (`npm run test:perf` → `scripts/perf/canonical-perf-run.mjs`; production-build URL, deterministic seed, warm-up/startup separation, versioned JSON + summary + screenshots + long-task collection; `--self-test` green.)
- [ ] 29. Run actual production build/default desktop quality.
- [x] 30. Record commit/browser/GPU/viewport/DPR/buffer/quality metadata. (Runner records commit, chrome version, user agent, viewport, DPR, drawing buffer, quality tier, headed flag, and WebGL vendor/renderer into every artifact; smoke artifact verified all fields. Values fill at run time on the reference host.)
- [x] 31. Reject software rendering/headless overrides from canonical results. (Pure `CanonicalRunGate.evaluateCanonicalRun` + `isSoftwareRenderer`: headless/WebGL-down/software-renderer/DPR-out-of-range/reduced-distance all non-canonical with named reasons, malformed fail closed; 7 unit tests; runner `canonical-perf-run.mjs` mirrors the rules with MUST-match comments.)
- [x] 32. Add deterministic seed/spawn/route/action scripting. (Seed flag + fixed waypoint teleports; `interaction` scenario drives the real input path (pointer lock + break-hold + hotbar + place click); `entities-day-night` cycles the fixed daylight hook with camera sweep. No benchmark-only hooks. Headless smoke run: 5 scenarios, zero action errors.)
- [x] 33. Add warm-up policy and separate startup vs steady-state evidence. (Warm-up 5 s stationary / 2 s others; per-sample `startup` snapshot right after warm-up vs steady-state snapshot at window end, both in the versioned artifact. Headed adequacy pending.)
- [ ] 34. Run at least three samples/scenario and report median plus worst relevant percentile.
- [x] 35. Emit versioned JSON and human summary artifacts. (Versioned `canonical-perf.json` now carries per-sample whole-frame stats + rolling minima + phase percentiles + aux + worker + work counts + pipeline + action errors + trace flags; `summary.md`; headless smoke artifact verified.)
- [x] 36. Emit screenshots at scenario checkpoints. (Per-sample PNGs for all five scenarios; headless smoke captured 5/5.)
- [x] 37. Capture PerformanceObserver long tasks and CDP trace where supported. (Long tasks pre-existing; per-scenario CDP `trace.zip` via context tracing with graceful no-trace degrade; headless smoke captured 5/5 trace zips.)
- [x] 38. Harness self-test: injected busy loop must fail the gate. (`busyLoopSelfTestSummary` fails all four `PerfGate` gates; `PerfGate.test.ts` 7 tests + runner `--self-test` PASS.)

## E. Production worker meshing

- [ ] 39. Characterize sync mesh cost and worker parity on identical fixtures.
- [x] 40. Define capability checks and conservative pool sizing. (Pure `WorkerMeshCapability`: `recommendedWorkerPoolSize` = half cores clamped [1,4], `resolveWorkerMeshingSupport` fails closed without `Worker`; 5 unit tests. Production default stays sync fallback; activation (41) pending headed proof.)
- [ ] 41. Enable `workerMeshing` in shipped Game composition when supported.
- [x] 42. Preserve deterministic sync fallback when Worker unavailable. (Pre-existing construction-failure fallback test + throwing-factory nested-fallback test + `WorkerMeshCapability` fail-closed resolution; production default stays sync. All green headless.)
- [x] 43. Prove worker/sync semantic equivalence across render streams. (Headless slice: `WorkerSyncEquivalence.test.ts` drives identical scripted content through live sync + worker Worlds and proves identical attached section sets, exact translucent match, and identical opaque visible unit-face sets; module parity `WorkerMeshParity` exact incl. corner order. Proved + fixed a real pre-existing pack bug on the way: `PACKED_FACE_LAYOUTS` u/v swapped on + faces corrupted non-square merged rects — fixed with axis mapping + (m0,m3,m2,m1) corner permutation, standard indices. Headed FPS-scale proof still pending.)
- [x] 44. Prove stale generation/section versions cannot attach. (Pre-existing delayed-result rejection after replacement/unload + `MeshWorkerClient` validate/reject suites + live equivalence attaching only current versions. All green headless; headed race-scale proof pending.)
- [x] 45. Inject worker crash/protocol/bad-response failures. (`WorkerFallbackRecovery.test.ts`: throwing factory + mid-batch `onerror` crash; malformed/stale rejection pre-existing via `MeshWorkerClient` validation + `World.test.ts` delayed-result rejection.)
- [x] 46. Prove failure recovers chunks through bounded fallback. (Both fault tests drain `pendingMesh` to 0, attach geometry, leak no batches, disable workers; failures/fallbacks counted.)
- [x] 47. Prevent duplicate work for same current mesh version. (`ensureMeshableRecord` skips the cancel/reset when a worker batch for the exact chunk version is in flight and current + defense-in-depth check in `submitWorkerMeshJob`; `WorkerFallbackRecovery` dedupe test proves no cancel/resubmit across bump-free teleports and fails with the guard removed. No behavior change for edited/stale versions.)
- [ ] 48. Measure/optimize pack-transfer-expand cost with safe transferables/reuse.
- [ ] 49. Re-run baseline and quantify p95/main-thread improvement.

## F. Whole-frame adaptive work governor

- [ ] 50. Replace independent fixed-spend assumptions with one shared background governor.
- [ ] 51. Reserve input/render margin from recent whole-frame/render percentiles.
- [ ] 52. Treat CONFIG budgets as hard maxima, not guaranteed spending.
- [ ] 53. Add quick overload reduction and slow recovery hysteresis.
- [ ] 54. Allocate sub-budgets to generation, sync fallback mesh, lighting, upload, unload.
- [ ] 55. Add starvation floors/deadlines for every non-empty queue.
- [ ] 56. Add count/byte/age backpressure for ready/upload queues.
- [ ] 57. Prioritize near/visible work without changing world truth.
- [x] 58. Unit test overload, recovery, invalid metrics, starvation, aging and caps. (`FrameBudgetGovernor.test.ts` 11 tests: full-cap/empty-queue split, hard-maxima ceiling, overload cutback + render-reserve growth, gradual recovery to 1.0, fail-closed invalid latch, starvation floors, determinism, reset.)
- [ ] 59. Browser-prove background work does not monopolize repeated fresh-traversal frames.
- [ ] 60. Re-profile and document remaining long-frame sources.

## G. Streaming/generation/meshing/lighting/upload hot paths

- [ ] 61. Profile `ensureChunks`/resident scans and measured key/scan churn.
- [ ] 62. Profile terrain generation/column materialization/heightmaps by self/total time.
- [ ] 63. Incrementally slice or workerize generation if it remains >20% of frame debt.
- [ ] 64. Preserve exact seeded worldgen via golden/hash equivalence.
- [ ] 65. Coalesce duplicate dirty/remesh requests and unchanged geometry builds.
- [ ] 66. Reject stale work before expensive expansion/allocation/upload.
- [ ] 67. Reduce measured duplicate light work under shared governor.
- [ ] 68. Optimize upload/BufferGeometry path under actual time/byte caps.
- [ ] 69. Amortize unload/dispose bursts without resource leaks.
- [ ] 70. Re-run fresh/cached traversal with queue/phase before-after evidence.

## H. Renderer/GPU and presentation cost

- [ ] 71. Determine CPU vs GPU/fill contribution using trace/buffer/resolution evidence.
- [ ] 72. Reduce measured redundant draw/object/material state cost.
- [ ] 73. Validate visibility/frustum work for non-visible chunk meshes.
- [ ] 74. Optimize shadow caster/update scope without default visual degradation.
- [ ] 75. Remove measured redundant cloud/environment/day-night per-frame work.
- [ ] 76. Feed dynamic resolution meaningful whole-frame pressure without CPU-stall oscillation.
- [ ] 77. Add drawing-buffer/resource/dynamic-resolution regression tests.
- [ ] 78. Only after structural fixes, tune explicit quality-tier parameters if GPU-bound, with screenshots.

## I. Simulation, entities, input/UI and allocation/GC

- [ ] 79. Profile fixed-tick catch-up and prevent avoidable render-slowdown debt spirals.
- [ ] 80. Bound measured entity/mob/item/orb scans to active regions where semantics permit.
- [ ] 81. Profile collision/raycast/interactions for redundant reads/allocations.
- [ ] 82. Ensure unchanged HUD/debug DOM values are not repeatedly written.
- [ ] 83. Remove measured hot temporary allocations/serialization scratch.
- [ ] 84. Add sustained allocation/resource test with no monotonic post-settle growth.

## J. Product-quality and settings behavior

- [x] 85. Preserve default render/simulation distance and visible quality through first optimization pass. (`DefaultQualityPreservation.test.ts` pins rd 6 / sim 6 / DPR 2 / shadows / clouds / shadow map+distance and keeps the headless profile explicitly separate; no default cut exists in the Phase-1..3 diffs. Any later intentional cut still requires task 86/90 proof + review.)
- [ ] 86. If default tuning remains required, prove why and prefer non-visual scheduling/simulation changes first.
- [ ] 87. Make tier/adaptive behavior explicit; never infer a hidden lower tier to pass.
- [ ] 88. Preserve deterministic fixed-tick state across render-quality settings.
- [ ] 89. Add user-facing performance/quality control only if materially useful, not as substitute for fixing default.
- [ ] 90. Capture/review every intentional default presentation change and re-pin only justified goldens.

## K. Final real-world certification and publication

> Phase-2 checkpoint (2026-09-11): tasks 17–23, 32, 35–37, 45–46 complete headless-verified (27/100). No production behavior retuned: all timing is disabled-by-default with zero clock reads; the only behavioral delta is structural (exception-safe nest-guarded brackets). Headed hardware-WebGL baselines (3, 6–15, 29–30, 33–34, 39, 41–44, 47–49, 91–95) remain blocked on a GPU host — see verification.md.
>
> Phase-3 checkpoint (2026-09-11): task 43 headless slice complete (28/100) via a real worker-path correctness fix — `PACKED_FACE_LAYOUTS` u/v axes were swapped on +X/+Y/-Z faces (invisible for square rects/unit quads, corrupting merged non-square rects on concave content; caught by the new World-level equivalence test, minimized to plain-vs-notch/pillar variants). Fix: corrected axis mapping + (m0,m3,m2,m1) corner permutation reproducing the sync mesher's exact corner convention with standard indices; no shared-mesher change. Production worker default still sync (task 41 pending headed proof).

- [ ] 91. Stationary 30 s: average >=55 FPS, p95 <=22 ms, p99 <=33 ms, >50 ms <=1%.
- [ ] 92. Fresh traversal 60 s: average >=45 FPS, p95 <=28 ms, p99 <=50 ms, no recurring >100 ms stalls.
- [ ] 93. Cached traversal: average >=55 FPS and no rolling 10 s window below 45 FPS.
- [ ] 94. Interaction/entity/day-night scenarios: no sustained rolling 10 s window below 45 FPS.
- [ ] 95. Sustained resource scenario: no monotonic post-settle leak in geometry/texture/worker/heap proxy.
- [x] 96. Run typecheck, lint, complete unit, build, complete E2E, visual, state/file-audit/orphan/release gates. (Headless scope green this session: typecheck PASS, lint 0 errors, unit 393 files 4701+1 PASS, build PASS, full headless E2E 62/62 PASS incl. visual goldens + void-world + whole-frame specs, validate-state PASS, file-audit manifest PASS. Canonical headed + exact-SHA CI scope belongs to tasks 91–95/99 and remains blocked.)
- [ ] 97. Compare final default screenshots/behavior with baseline; investigate unintended changes.
- [ ] 98. Record exact before/after metrics, fixed/residual bottlenecks, environment and artifacts.
- [ ] 99. Reconcile OpenSpec/state, publish to `origin/main`, require successful CI on exact published SHA.
- [ ] 100. Mark VERIFIED only if all headed performance + correctness/visual/memory/full-regression gates pass.
