# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **075-render-performance-contract — VERIFIED 100%**
- Active implementation change: **075-render-performance-contract — VERIFIED**
- Next change: **076-fluid-state-levels — NOT YET ACTIVE (artifacts pending)**
- 075 task ledger: **5 total tasks, 5 completed**
- 075 completion: **100%**
- 075 mandatory render-performance-contract requirements: **PASS**
- 075 required-test gate: **PASS — unit 851/851, E2E 19/19**
- 075 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `c75cc9d01eb672d3868c30d3a4d92965f4fc99e2`
- Next exact action: **Advance to 076-fluid-state-levels. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (076 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement source/flowing fluid state with level/falling metadata (deterministic, data-model level on 015 fluid types), verify full gate, commit + push, advance program state.**

## What 075 implemented

Change 075 adds the render performance contract and automated measurement harness.

- `src/rendering/RenderBudget.ts` (NEW) — `RenderBudgetConfig` (max draw calls, mesh-build millis,
  frame-time millis, geometry-memory bytes, render-distance chunks), `RenderMetrics`,
  `RenderBudgetReport` (per-dimension entries + overall verdict), `DEFAULT_RENDER_BUDGET`
  (documented placeholder values), `validateRenderBudgetConfig` (positive finite numbers, named
  errors), `evaluateRenderBudget` (`actual <= budget`; non-finite/negative actuals violate).
- `src/rendering/RenderPerformanceMonitor.ts` (NEW) — injectable-clock `RenderPerformanceMonitor`:
  `beginFrame`/`endFrame` (frame time, per-frame reset), `beginMeshBuild`/`endMeshBuild`
  (accumulating, misuse guards), validated `recordDrawCalls`/`setGeometryMemory`/
  `setRenderDistanceChunks`, `sample()`, `evaluate(config)`.
- `tests/unit/RenderPerformance.test.ts` (NEW) — 14 tests: config validation matrix, evaluation
  scenarios (boundary, malformed actuals), monitor lifecycle with fake clocks, mesh-build
  accumulation, misuse throws, value validation, determinism.

## Validation evidence (075)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 851/851 (prior 837 + 14 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 075 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint, the new 075 suites,
the full unit suite (851/851, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 076 (pending artifacts)

`076-fluid-state-levels` is named in `CHANGE_SEQUENCE.md` with scope "Source/flowing fluid state
with level/falling metadata." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 075 verification.
Change 076 is the next change; its artifacts must be authored and validated before implementation
begins.
