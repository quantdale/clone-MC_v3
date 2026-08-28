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

// ── Frame work-budget scheduler (audit 04: time-aware budgets) ───────────────

/** Task classes competing for the per-frame main-thread work budget. */
export type FrameTaskClass = 'generate' | 'mesh-upload' | 'light' | 'unload';

/** Fixed task-class order (normative for summaries). */
export const FRAME_TASK_CLASSES: readonly FrameTaskClass[] = ['generate', 'mesh-upload', 'light', 'unload'];

/** Per-class millisecond budgets for one frame. */
export interface FrameWorkBudgetConfig {
  generateMs: number;
  meshUploadMs: number;
  lightMs: number;
  unloadMs: number;
}

/** Per-class frame summary: budget vs used/remaining plus the duration EMA. */
export interface FrameTaskClassSummary {
  budgetMs: number;
  usedMs: number;
  remainingMs: number;
  /** Exponential moving average of recorded actual durations (ms), 0 before data. */
  emaMs: number;
}

/** Full-frame budget consumption snapshot. */
export interface FrameBudgetSummary {
  classes: Readonly<Record<FrameTaskClass, FrameTaskClassSummary>>;
  /** True when every class still has at least `epsilon` ms remaining. */
  exhausted: boolean;
}

const EMA_ALPHA = 0.25;
/** Remaining budget below which dispatch stops (ms). */
const EPSILON_MS = 0.01;

/**
 * Time-aware per-frame work scheduler. The frame loop calls `beginFrame`, then
 * gates each candidate chunk task through `tryAcquire(taskClass, estimate)` and
 * skips further dispatch once the class budget is spent; completed tasks report
 * their real duration via `recordActual` to refine a per-class EMA used as the
 * next frame's default cost estimate.
 */
export class FrameWorkBudgetScheduler {
  private readonly budgets: Record<FrameTaskClass, number>;
  private readonly used: Record<FrameTaskClass, number>;
  private readonly ema: Record<FrameTaskClass, number>;

  constructor(config: FrameWorkBudgetConfig) {
    this.budgets = {
      generate: config.generateMs,
      'mesh-upload': config.meshUploadMs,
      light: config.lightMs,
      unload: config.unloadMs,
    };
    this.used = { generate: 0, 'mesh-upload': 0, light: 0, unload: 0 };
    this.ema = { generate: 0, 'mesh-upload': 0, light: 0, unload: 0 };
  }

  /** Start a new frame: resets per-class consumption (EMAs persist). */
  beginFrame(): void {
    for (const taskClass of FRAME_TASK_CLASSES) {
      this.used[taskClass] = 0;
    }
  }

  /**
   * Attempt to reserve `estimatedCostMs` of this frame's budget for the class.
   * Returns false (and reserves nothing) when the remaining budget is too small.
   * With no EMA history the caller's estimate is trusted as-is.
   */
  tryAcquire(taskClass: FrameTaskClass, estimatedCostMs?: number): boolean {
    const cost = estimatedCostMs ?? (this.ema[taskClass] > 0 ? this.ema[taskClass] : 0);
    if (cost < 0 || !Number.isFinite(cost)) {
      throw new RangeError(`FrameWorkBudgetScheduler.tryAcquire(${taskClass}): invalid cost ${cost}`);
    }
    const remaining = this.budgets[taskClass] - this.used[taskClass];
    // Allow dispatch while the estimate fits within a small epsilon of the
    // remaining budget; stop dispatch once the class budget is spent.
    if (cost > remaining + EPSILON_MS) {
      return false;
    }
    this.used[taskClass] += cost;
    return true;
  }

  /** Record the measured duration of a dispatched task; updates the class EMA. */
  recordActual(taskClass: FrameTaskClass, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError(`FrameWorkBudgetScheduler.recordActual(${taskClass}): invalid duration ${durationMs}`);
    }
    this.ema[taskClass] = this.ema[taskClass] === 0 ? durationMs : this.ema[taskClass] * (1 - EMA_ALPHA) + durationMs * EMA_ALPHA;
  }

  /** Remaining budget for a class this frame (milliseconds). */
  remaining(taskClass: FrameTaskClass): number {
    return Math.max(0, this.budgets[taskClass] - this.used[taskClass]);
  }

  /** Current EMA of actual task durations for a class (0 before any data). */
  emaMs(taskClass: FrameTaskClass): number {
    return this.ema[taskClass];
  }

  /** Per-class used/remaining/budget snapshot for observability. */
  summary(): FrameBudgetSummary {
    const classes = {} as Record<FrameTaskClass, FrameTaskClassSummary>;
    let exhausted = true;
    for (const taskClass of FRAME_TASK_CLASSES) {
      const remainingMs = this.remaining(taskClass);
      if (remainingMs >= EPSILON_MS) {
        exhausted = false;
      }
      classes[taskClass] = {
        budgetMs: this.budgets[taskClass],
        usedMs: this.used[taskClass],
        remainingMs,
        emaMs: this.ema[taskClass],
      };
    }
    return { classes, exhausted };
  }
}
