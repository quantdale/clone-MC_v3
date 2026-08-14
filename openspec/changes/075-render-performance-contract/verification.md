# Verification: 075-render-performance-contract

Status: VERIFIED
Completion: 100%
Advancement allowed: true

075 started only after 074 was VERIFIED (4637251 / aa3448b).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Config validation | `RenderPerformance.test.ts`: `DEFAULT_RENDER_BUDGET` accepted; every field rejects 0/-1/NaN/Infinity/'5'/null/undefined with an error naming the field; non-object input rejected | PASS |
| Evaluation | all-at-or-below → 5/5 within + overall true (dimension order asserted); single draw-call violation flags only that entry (budget/actual reported) and fails overall; boundary equality (`actual === budget`) within; negative/NaN/Infinity actuals violate their dimension | PASS |
| Monitor frame lifecycle | frame time measured with fake clock (10ms then 4ms, `sample().frameTimeMillis` is the last completed frame, 0 before any frame); per-frame accumulators (drawCalls, meshBuildMillis) reset at `beginFrame` while frame time persists; unbalanced lifecycle throws (`endFrame` without begin, `endMeshBuild` without begin, double `beginMeshBuild`, build outside a frame) | PASS |
| Recorded values validated | `recordDrawCalls(-1)/2.5`, `setGeometryMemory(NaN)`, `setRenderDistanceChunks(-3)` all throw; state unchanged after rejection | PASS |
| Determinism | identical scripted clocks + call sequences → deeply equal samples | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/RenderPerformance.test.ts` | PASS | 14/14 |
| `npm test` | PASS | 87 files, 851/851 (837 baseline + 14 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.34s |
| `npm run test:e2e` | PASS | 19/19 (1.6m) |

## Edge / adversarial validation

- Config validation covers all five fields × seven invalid shapes (0, negative, NaN, Infinity, string, null, undefined).
- Evaluation distinguishes boundary equality (within) from malformed actuals (violation), and reports budget vs actual per failing dimension.
- Monitor lifecycle: frame-time semantics across multiple frames, per-frame reset with last-frame persistence, all four misuse paths throw, recorded-value validation leaves state intact.
- Mesh-build time accumulates across multiple builds within one frame (2ms + 5ms = 7ms).

## Migration / compatibility validation

Additive: `src/rendering/RenderBudget.ts`, `src/rendering/RenderPerformanceMonitor.ts`, and one test file. No existing module or payload changes; the monitor is not yet wired (documented — the harness is ready for the scene wiring).

## Performance / resource validation

Monitor calls O(1); evaluation allocates one small report. The budget contract itself is the performance guardrail; `DEFAULT_RENDER_BUDGET` values are documented placeholders to be tuned by wiring. Unit suite duration unchanged (~7.8s, 87 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 851/851 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 075 render-performance contract (typed budgets, strict validation, deterministic evaluation) and automated measurement harness (injectable-clock monitor) are in place. Advance to 076-per-block-model-rotation.
