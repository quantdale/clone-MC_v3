/**
 * Render performance contract (075). `RenderBudgetConfig` declares per-dimension budgets (draw
 * calls, mesh-build millis, frame-time millis, geometry-memory bytes, render-distance chunks);
 * `validateRenderBudgetConfig` enforces positive finite numbers; `evaluateRenderBudget` produces a
 * per-dimension + overall verdict (`actual <= budget`; non-finite or negative actuals violate).
 * Pure and deterministic; the measurement side lives in `RenderPerformanceMonitor.ts`.
 */

/** Budget thresholds for the five render performance dimensions. */
export interface RenderBudgetConfig {
  /** Maximum draw calls per frame. */
  maxDrawCalls: number;
  /** Maximum mesh-build time per frame, in milliseconds. */
  maxMeshBuildMillis: number;
  /** Maximum frame time, in milliseconds. */
  maxFrameTimeMillis: number;
  /** Maximum geometry memory, in bytes. */
  maxGeometryMemoryBytes: number;
  /** Maximum render distance, in chunks. */
  maxRenderDistanceChunks: number;
}

/** A measured snapshot across the five dimensions. */
export interface RenderMetrics {
  drawCalls: number;
  meshBuildMillis: number;
  frameTimeMillis: number;
  geometryMemoryBytes: number;
  renderDistanceChunks: number;
}

/** One dimension of a budget evaluation. */
export interface RenderBudgetEntry {
  dimension: keyof RenderBudgetConfig;
  budget: number;
  actual: number;
  withinBudget: boolean;
}

/** The full evaluation verdict: per dimension plus overall. */
export interface RenderBudgetReport {
  withinBudget: boolean;
  entries: RenderBudgetEntry[];
}

/**
 * Documented placeholder budgets, to be tuned by the scene wiring against real measurements
 * (draw calls, mesh build, frame time, memory, render distance).
 */
export const DEFAULT_RENDER_BUDGET: RenderBudgetConfig = {
  maxDrawCalls: 1500,
  maxMeshBuildMillis: 8,
  maxFrameTimeMillis: 16.7,
  maxGeometryMemoryBytes: 256 * 1024 * 1024,
  maxRenderDistanceChunks: 12,
};

const DIMENSIONS: readonly (keyof RenderBudgetConfig)[] = [
  'maxDrawCalls',
  'maxMeshBuildMillis',
  'maxFrameTimeMillis',
  'maxGeometryMemoryBytes',
  'maxRenderDistanceChunks',
];

/** Budget dimension → measured metrics key. */
const METRIC_KEYS: Record<keyof RenderBudgetConfig, keyof RenderMetrics> = {
  maxDrawCalls: 'drawCalls',
  maxMeshBuildMillis: 'meshBuildMillis',
  maxFrameTimeMillis: 'frameTimeMillis',
  maxGeometryMemoryBytes: 'geometryMemoryBytes',
  maxRenderDistanceChunks: 'renderDistanceChunks',
};

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Validate an unknown value as `RenderBudgetConfig`. Returns the same value (narrowed) on success;
 * throws a descriptive `Error` naming the offending field.
 */
export function validateRenderBudgetConfig(input: unknown): RenderBudgetConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error('RenderBudgetConfig: must be an object');
  }
  const r = input as Record<string, unknown>;
  for (const dimension of DIMENSIONS) {
    if (!isPositiveFinite(r[dimension])) {
      throw new Error(`RenderBudgetConfig: ${dimension} must be a positive finite number, got ${String(r[dimension])}`);
    }
  }
  return r as unknown as RenderBudgetConfig;
}

/** Whether an actual measurement is acceptable (finite, non-negative) and within budget. */
function withinBudget(budget: number, actual: number): boolean {
  if (typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0) return false;
  return actual <= budget;
}

/**
 * Evaluate measured metrics against the budget contract. Malformed actuals (non-finite or
 * negative) violate their dimension; the overall verdict is within only when every dimension is.
 */
export function evaluateRenderBudget(config: RenderBudgetConfig, metrics: RenderMetrics): RenderBudgetReport {
  const entries: RenderBudgetEntry[] = DIMENSIONS.map((dimension) => {
    const actual = metrics[METRIC_KEYS[dimension]];
    return { dimension, budget: config[dimension], actual, withinBudget: withinBudget(config[dimension], actual) };
  });
  return { withinBudget: entries.every((entry) => entry.withinBudget), entries };
}
