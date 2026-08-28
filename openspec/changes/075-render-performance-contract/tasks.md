# Tasks: 075-render-performance-contract

> VERIFIED. Entry gate confirmed (074 VERIFIED; baseline 837 unit / 19 e2e green).

- [x] 1. Confirm entry gate (074 VERIFIED; baseline 837 unit / 19 e2e green).
- [x] 2. Add `src/rendering/RenderBudget.ts` (`RenderBudgetConfig`, `RenderMetrics`, `RenderBudgetReport`, `DEFAULT_RENDER_BUDGET`, `validateRenderBudgetConfig`, `evaluateRenderBudget`; strict validation, per-dimension + overall verdict, boundary and malformed-actual handling).
- [x] 3. Add `src/rendering/RenderPerformanceMonitor.ts` (`RenderPerformanceMonitor` with injectable `now()`; begin/end frame, begin/end mesh build with misuse guards, `recordDrawCalls`/`setGeometryMemory`/`setRenderDistanceChunks` with value validation, `sample()`, `evaluate(config)`).
- [x] 4. Add `tests/unit/RenderPerformance.test.ts` (config validation matrix, evaluation scenarios incl. boundary/malformed, monitor lifecycle with fake clock, mesh-build accumulation and guards, per-frame reset, setters, determinism).
- [x] 5. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
