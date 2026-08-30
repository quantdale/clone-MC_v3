# Tasks: 255-high-performance-voxel-engine

## Campaign A — baseline and worker correctness
- [x] 1. Record deterministic release-build baselines for cold spawn, straight-flight, spin, edit storm, lighting storm, forest, water coast, long traversal, and LOD horizon (when available), including environment and resource metrics.
- [x] 2. Add strict section snapshot/halo extraction with canonical-coordinate and dimension-boundary tests; prove no absent-neighbor accidental-air regression.
- [x] 3. Complete worker render-layer parity for opaque, cutout, translucent, and fluid streams with AO, lighting, tint, UV, ordering, and golden/reference comparisons.
- [x] 4. Add worker failure, timeout, duplicate, foreign identity, stale token, unload, and cancellation tests with exactly-once settlement/disposal.

## Campaign B — typed transfers and GPU-ready output
- [x] 5. Add worker initialization tables and version validation; remove per-request registry reconstruction.
- [x] 6. Replace hot-path nested JS arrays with validated typed buffers and transferable ownership; test detached/duplicate ownership behavior.
- [x] 7. Produce typed GPU-ready layer streams in workers and validate byte/count caps before accepting results.
- [x] 8. Add worker-vs-reference geometry/lighting/AO/fluid parity tests and update only intentionally equivalent visual evidence.

## Campaign C — live section rendering
- [x] 9. Make canonical 16³ sections the live mesh invalidation/ownership unit while retaining compatibility projections only as bounded scheduling bridges.
- [x] 10. Integrate validated worker section meshing into live `World` with safe synchronous fallback and a runtime diagnostic switch.
- [x] 11. Verify section edits, vertical/horizontal borders, lighting invalidation, rapid replacement/unload, and queue saturation without starvation or main-thread spin.

## Campaign D — workerized deterministic generation
- [x] 12. Wire deterministic column generation through a production worker client/entry with bounded priority and cancellation.
- [x] 13. Validate worker output identity, generation version, column status, edit durability, and atomic canonical commit; stale output must never overwrite edits.
- [x] 14. Prove bit-equivalent worldgen across seeds, negative coordinates, dimension bounds, structures, ores, caves, and reloads; retain synchronous fallback.

## Campaign E — mesh-ready and upload scheduling
- [x] 15. Implement bounded `MeshReadyQueue` with byte/count caps, age metrics, and intact deferral.
- [x] 16. Implement time/byte-bounded `GpuUploadScheduler`; separate geometry creation/upload accounting from worker completion.
- [ ] 17. Add atomic section swaps and exact-once disposal/accounting for success, stale, partial, optional-material, unload, and context-loss paths.
- [ ] 18. Prove upload p95 budget and no burst upload under worker completion storms.

## Campaign F — streaming intelligence
- [ ] 19. Implement deterministic visibility-/movement-/simulation-aware priority ordering with canonical tie breaks.
- [ ] 20. Add starvation prevention, load/unload hysteresis, LOD hysteresis, and bounded queue admission under high render distance/teleport churn.
- [ ] 21. Verify near interactive work outranks speculative far generation and that resource counts converge after traversal.

## Campaign G — hierarchical far-terrain LOD
- [ ] 22. Define validated LOD tile identity/data contracts and deterministic LOD1/LOD2/LOD3 sampling from seed/version.
- [ ] 23. Implement tile construction/render ownership with seam-safe transitions, frustum/distance selection, and bounded cache eviction.
- [ ] 24. Implement edit invalidation/conservative far visibility without allowing LOD to answer gameplay, collision, persistence, or network reads.
- [ ] 25. Add deterministic LOD seam, horizon, transition, negative-coordinate, and rapid-threshold tests plus targeted visual evidence.

## Campaign H — dynamic resolution and observability
- [ ] 26. Implement hysteretic, tier-bounded dynamic resolution with deterministic fake-clock tests and no simulation coupling.
- [ ] 27. Wire actual drawing-buffer dimensions, worker/ready/upload/LOD metrics, and debug diagnostics into renderer/performance monitoring.
- [ ] 28. Add resource-budget dimensions for worker buffers, ready bytes, uploads, and LOD tiles; prove bounded long-session behavior.

## Campaign I — certification
- [ ] 29. Run focused unit/integration/benchmark/visual suites for every campaign and reconcile all specs/tasks with actual behavior.
- [ ] 30. Run `npm run typecheck`.
- [ ] 31. Run `npm run lint`.
- [ ] 32. Run `npm test`.
- [ ] 33. Run `npm run build`.
- [ ] 34. Run `npm run test:e2e`.
- [ ] 35. Run adversarial stale/failure/resource/save/determinism checks and resolve all Critical/High findings.
- [ ] 36. Record before/after measurements, blockers, exact Git HEAD, and final advancement decision in `verification.md` and program state.
- [ ] 37. Commit intended changes, publish normally to `origin/main`, verify remote HEAD, and complete the review handoff.
