# Proposal: 075-render-performance-contract

## Problem

The rendering stack (062-074) has no performance contract: no budgets for draw calls, mesh build
time, frame time, geometry memory, or render distance, and no way to measure them. Regression risk
grows as the renderer is wired.

## Goals

- A typed budget contract over five dimensions: draw calls, mesh-build time, frame time, geometry
  memory, render distance (chunks).
- Strict budget-config validation and a pure evaluator (per-dimension + overall verdict).
- A deterministic instrumentation monitor (injectable clock) that aggregates per-frame metrics and
  evaluates them against the contract — automated measurement without scene wiring.

## Non-goals

- Wiring the monitor into a render loop (no renderer exists yet; the harness is the contract's
  measurement side and is ready for that wiring).
- Three.js/GPU-side measurements (draw call counts are recorded at the API surface).
- Tuning production budget numbers (defaults are documented placeholders to be tuned by wiring).

## Preconditions

- Change 074 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 074 baseline (837 unit / 19 e2e).

## Dependencies

- 044 tick/clock conventions; the 062-074 rendering modules' costs.

## Proposed change

- `src/rendering/RenderBudget.ts` (NEW): `RenderBudgetConfig`, `RenderMetrics`,
  `RenderBudgetReport`, `DEFAULT_RENDER_BUDGET`, `validateRenderBudgetConfig(input)`,
  `evaluateRenderBudget(config, metrics)`.
- `src/rendering/RenderPerformanceMonitor.ts` (NEW): `RenderPerformanceMonitor` (injectable
  `now()`; begin/end frame; begin/end mesh build; `recordDrawCalls`, `setGeometryMemory`,
  `setRenderDistanceChunks`; `sample()`; `evaluate(config)`; per-frame reset; explicit failure
  behavior on misuse).
- `tests/unit/RenderPerformance.test.ts` (NEW): validation, evaluation, monitor lifecycle with a
  fake clock, determinism.

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Budget numbers are placeholders; the contract is what matters, and the wiring will tune values.
- Monitor misuse (double-begin, end-without-begin) is an explicit failure, not silent corruption.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Budget config validates strictly (positive finite numbers); defaults are documented placeholders.
- Evaluation: each dimension `withinBudget = actual <= budget` (non-finite/negative actuals are
  violations); overall = all dimensions within.
- Monitor with a fake clock: frame time from begin/end, mesh build accumulation with
  begin/end guards, per-frame draw-call accumulation reset on frame begin, memory/distance setters,
  `sample()` snapshot, `evaluate()` integration.
- Deterministic: identical scripted clocks → identical samples.
- Full gate green; 075 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 075 suite; E2E stays 19/19.
