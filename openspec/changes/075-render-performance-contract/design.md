# Design: 075-render-performance-contract

## Context / current state

Rendering modules (062-074) exist as data/logic; no budgets or measurement exist. The future scene
wiring needs a contract to prevent regression.

## Target state

`RenderBudgetConfig` declares per-dimension budgets; `evaluateRenderBudget` produces a
per-dimension + overall verdict; `RenderPerformanceMonitor` aggregates per-frame metrics with an
injectable clock and evaluates them against the contract — all deterministic and unit-testable.

## Invariants

- `RenderBudgetConfig` fields are positive finite numbers (validation enforced).
- Evaluation: `withinBudget = actual <= budget`; non-finite or negative actuals violate.
- `RenderMetrics` is a plain snapshot: `{ drawCalls, meshBuildMillis, frameTimeMillis,
  geometryMemoryBytes, renderDistanceChunks }`.
- Monitor: per-frame accumulators (draw calls, mesh build millis) reset at `beginFrame`; frame
  time is measured between `beginFrame`/`endFrame`; misuse (double `beginMeshBuild`,
  `endMeshBuild` without begin) throws.

## API and data model

```ts
// src/rendering/RenderBudget.ts (NEW)
export interface RenderBudgetConfig {
  maxDrawCalls: number;
  maxMeshBuildMillis: number;
  maxFrameTimeMillis: number;
  maxGeometryMemoryBytes: number;
  maxRenderDistanceChunks: number;
}
export interface RenderMetrics {
  drawCalls: number;
  meshBuildMillis: number;
  frameTimeMillis: number;
  geometryMemoryBytes: number;
  renderDistanceChunks: number;
}
export type RenderBudgetDimension = keyof RenderBudgetConfig;
export interface RenderBudgetEntry {
  dimension: RenderBudgetDimension;
  budget: number;
  actual: number;
  withinBudget: boolean;
}
export interface RenderBudgetReport {
  withinBudget: boolean;
  entries: RenderBudgetEntry[];
}
export const DEFAULT_RENDER_BUDGET: RenderBudgetConfig;
export function validateRenderBudgetConfig(input: unknown): RenderBudgetConfig;
export function evaluateRenderBudget(config: RenderBudgetConfig, metrics: RenderMetrics): RenderBudgetReport;

// src/rendering/RenderPerformanceMonitor.ts (NEW)
export class RenderPerformanceMonitor {
  constructor(now: () => number);
  beginFrame(): void;
  endFrame(): void;
  beginMeshBuild(): void;
  endMeshBuild(): void;
  recordDrawCalls(count: number): void;
  setGeometryMemory(bytes: number): void;
  setRenderDistanceChunks(chunks: number): void;
  sample(): RenderMetrics;
  evaluate(config: RenderBudgetConfig): RenderBudgetReport;
}
```

## Control / data flow

1. The wiring calls `beginFrame()` at frame start (resets per-frame accumulators) and `endFrame()`
   at frame end (records frame time).
2. Mesh builds wrap in `beginMeshBuild()`/`endMeshBuild()`; build millis accumulate per frame.
3. Draw calls are recorded at the draw-API surface; memory/distance are set on change.
4. Any time, `evaluate(config)` produces the verdict from `sample()`.

## Detailed behavior

- `beginFrame`: sets frame start, resets drawCalls/meshBuildMillis.
- `endFrame`: frameTimeMillis = now() - frameStart; throws if no frame is open.
- `beginMeshBuild`: throws if a build is already open; `endMeshBuild`: adds elapsed, throws if none
  open.
- `recordDrawCalls`/`setGeometryMemory`/`setRenderDistanceChunks`: validate non-negative integers
  (throw on violation).
- `sample()`: plain object snapshot of current values; `frameTimeMillis` is the last completed
  frame's time (0 before the first `endFrame`).
- Evaluation treats non-finite/negative actuals as violations; equality (`actual === budget`) is
  within budget.

## Failure modes

- Monitor misuse throws `Error`s (double begin, unbalanced end, invalid recorded values).
- Evaluation is total (defensive against malformed metrics).

## Compatibility / migration

Additive. No changes to existing modules.

## Performance / resource constraints

Monitor adds O(1) per call; no allocation beyond the sample/report objects.

## Testing seams

- `tests/unit/RenderPerformance.test.ts` (NEW):
  - config validation matrix (0, negative, NaN, non-number);
  - evaluation: all-within, single over, boundary equality, non-finite actual;
  - monitor with fake clock: frame timing, mesh-build accumulation, guards, per-frame reset,
    setters, sample shape, evaluate integration;
  - determinism with scripted clocks.

## Observability / debugging

Reports name the failing dimension with budget vs actual; tests assert exact values.

## Affected files / symbols

- `src/rendering/RenderBudget.ts` — NEW.
- `src/rendering/RenderPerformanceMonitor.ts` — NEW.
- `tests/unit/RenderPerformance.test.ts` — NEW.

## Rejected alternatives

- *Real-clock-only monitoring*: untestable; the injectable clock makes measurement deterministic.
- *Budget validation at evaluate time*: configs are validated at construction/load; evaluation
  stays pure and cheap.
- *Per-dimension classes*: a flat typed config + report is simpler and matches the five fixed
  dimensions.

## Downstream dependencies

The scene renderer wiring calls the monitor; budget values get tuned against real measurements
there. The contract is the guardrail for the entire rendering stack.
