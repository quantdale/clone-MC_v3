# Tasks: 258-real-world-runtime-performance-fps-recovery

Status: PLANNED — implementation blocked until Change 257 is VERIFIED
Tasks complete: 0/100 (0%). Target: 100%
Advancement allowed: false

## A. Repository truth, activation and performance authority

- [ ] 1. Fetch current `origin/main`, record exact `session_start_head`, require clean history-preserving start, and verify Change 257 is VERIFIED before activating 258.
- [ ] 2. Run the OpenSpec pre-implementation quality gate and reconcile spec/source drift.
- [ ] 3. Record exact reference host/browser/GPU/renderer/viewport/DPR/display-refresh/quality configuration.
- [ ] 4. Reclassify prior 247/254/255 evidence as synthetic, headless, microbenchmark, or production-representative; no old result may override a failing headed baseline.
- [ ] 5. Activate 258 in PROGRAM_STATE at 0/100 with no pre-filled PASS evidence.

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

- [ ] 16. Add rAF-to-rAF whole-frame metric including update/world/simulation/render.
- [ ] 17. Add bounded timers for input/update, fixed ticks, world.update, generation, meshing, lighting, upload, unload, UI and render.
- [ ] 18. Add generation timing/count telemetry.
- [ ] 19. Add main-thread meshing and worker dispatch/completion timing.
- [ ] 20. Add lighting actual elapsed/work telemetry.
- [ ] 21. Add GPU-upload elapsed/bytes/queue/deferred telemetry.
- [ ] 22. Merge renderer.info/drawing-buffer into whole-frame samples.
- [ ] 23. Add worker utilization/failure/retry/fallback telemetry.
- [ ] 24. Add fixed-size sample ring with p50/p95/p99/long-frame analysis.
- [ ] 25. Add rolling-window FPS/frame analysis.
- [ ] 26. Add low-overhead diagnostics switch and measure disabled/enabled overhead.
- [ ] 27. Test sample validity, wraparound, percentiles, invalid metrics and bounded memory.

## D. Headed canonical performance harness

- [ ] 28. Add dedicated headed perf command separate from normal headless E2E.
- [ ] 29. Run actual production build/default desktop quality.
- [ ] 30. Record commit/browser/GPU/viewport/DPR/buffer/quality metadata.
- [ ] 31. Reject software rendering/headless overrides from canonical results.
- [ ] 32. Add deterministic seed/spawn/route/action scripting.
- [ ] 33. Add warm-up policy and separate startup vs steady-state evidence.
- [ ] 34. Run at least three samples/scenario and report median plus worst relevant percentile.
- [ ] 35. Emit versioned JSON and human summary artifacts.
- [ ] 36. Emit screenshots at scenario checkpoints.
- [ ] 37. Capture PerformanceObserver long tasks and CDP trace where supported.
- [ ] 38. Harness self-test: injected busy loop must fail the gate.

## E. Production worker meshing

- [ ] 39. Characterize sync mesh cost and worker parity on identical fixtures.
- [ ] 40. Define capability checks and conservative pool sizing.
- [ ] 41. Enable `workerMeshing` in shipped Game composition when supported.
- [ ] 42. Preserve deterministic sync fallback when Worker unavailable.
- [ ] 43. Prove worker/sync semantic equivalence across render streams.
- [ ] 44. Prove stale generation/section versions cannot attach.
- [ ] 45. Inject worker crash/protocol/bad-response failures.
- [ ] 46. Prove failure recovers chunks through bounded fallback.
- [ ] 47. Prevent duplicate work for same current mesh version.
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
- [ ] 58. Unit test overload, recovery, invalid metrics, starvation, aging and caps.
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

- [ ] 85. Preserve default render/simulation distance and visible quality through first optimization pass.
- [ ] 86. If default tuning remains required, prove why and prefer non-visual scheduling/simulation changes first.
- [ ] 87. Make tier/adaptive behavior explicit; never infer a hidden lower tier to pass.
- [ ] 88. Preserve deterministic fixed-tick state across render-quality settings.
- [ ] 89. Add user-facing performance/quality control only if materially useful, not as substitute for fixing default.
- [ ] 90. Capture/review every intentional default presentation change and re-pin only justified goldens.

## K. Final real-world certification and publication

- [ ] 91. Stationary 30 s: average >=55 FPS, p95 <=22 ms, p99 <=33 ms, >50 ms <=1%.
- [ ] 92. Fresh traversal 60 s: average >=45 FPS, p95 <=28 ms, p99 <=50 ms, no recurring >100 ms stalls.
- [ ] 93. Cached traversal: average >=55 FPS and no rolling 10 s window below 45 FPS.
- [ ] 94. Interaction/entity/day-night scenarios: no sustained rolling 10 s window below 45 FPS.
- [ ] 95. Sustained resource scenario: no monotonic post-settle leak in geometry/texture/worker/heap proxy.
- [ ] 96. Run typecheck, lint, complete unit, build, complete E2E, visual, state/file-audit/orphan/release gates.
- [ ] 97. Compare final default screenshots/behavior with baseline; investigate unintended changes.
- [ ] 98. Record exact before/after metrics, fixed/residual bottlenecks, environment and artifacts.
- [ ] 99. Reconcile OpenSpec/state, publish to `origin/main`, require successful CI on exact published SHA.
- [ ] 100. Mark VERIFIED only if all headed performance + correctness/visual/memory/full-regression gates pass.
