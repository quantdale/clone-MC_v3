/**
 * Shared whole-frame adaptive work governor (258 Phase 3, pure core).
 *
 * The shipped `CONFIG.budgets` values (`mainThreadChunkMs = 12`,
 * `lightDrainMs = 4`, `uploadMsPerFrame = 3`) are independent maxima whose
 * 19 ms nominal total already exceeds a 16.67 ms 60-FPS frame before
 * simulation, rendering, input, UI, browser overhead, or GC. This module
 * replaces independent fixed-spend assumptions with one shared background
 * budget: it observes recent whole-frame times, reserves an input/render
 * margin, and allocates only the remainder across background classes with
 * quick overload cutback, slow recovery hysteresis, starvation floors, and
 * fail-closed invalid-metric handling.
 *
 * Pure and headless-safe: no DOM, no clock, deterministic. The frame loop
 * feeds whole-frame observations via `observe` and asks per frame via
 * `decide`; CONFIG values remain hard maxima (allocations never exceed caps).
 */

/** Background work classes sharing the frame budget. */
export const GOVERNED_CLASSES = ['generation', 'meshMain', 'lighting', 'upload', 'unload'] as const;

/** One background work class governed by the shared budget. */
export type GovernedClass = (typeof GOVERNED_CLASSES)[number];

/** Governor configuration. */
export interface FrameBudgetGovernorConfig {
  /** Whole-frame target (default desktop 60 FPS). */
  targetFrameMs: number;
  /** Baseline input/render reserve kept out of background allowance. */
  renderReserveMs: number;
  /** Hard per-class maxima; allocations never exceed these. */
  hardCapsMs: Record<GovernedClass, number>;
  /** Multiplicative cut applied to the allowance scale on overload. */
  overloadCutback: number;
  /** Additive recovery of the allowance scale per healthy decision. */
  recoveryStep: number;
  /** Guaranteed minimum per non-empty queue (clamped to its cap). */
  starvationFloorMs: number;
  /** Recent whole-frame observations retained for p95 analysis. */
  historySize: number;
}

/** Default desktop governor configuration. */
export const DEFAULT_GOVERNOR_CONFIG: FrameBudgetGovernorConfig = {
  targetFrameMs: 16.67,
  renderReserveMs: 6,
  hardCapsMs: { generation: 12, meshMain: 8, lighting: 4, upload: 3, unload: 6 },
  overloadCutback: 0.75,
  recoveryStep: 0.05,
  starvationFloorMs: 0.5,
  historySize: 120,
};

/** One shared-budget decision for the coming frame. */
export interface FrameBudgetDecision {
  targetFrameMs: number;
  reservedRenderMs: number;
  availableBackgroundMs: number;
  perClassMs: Record<GovernedClass, number>;
  overloaded: boolean;
  /** Current allowance scale in (0, 1]: 1 = full caps, lower = throttled. */
  allowanceScale: number;
}

function isGovernedClass(value: unknown): value is GovernedClass {
  return typeof value === 'string' && (GOVERNED_CLASSES as readonly string[]).includes(value);
}

function positiveFinite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`FrameBudgetGovernor: ${name} must be a positive finite number, got ${String(value)}`);
  }
  return value;
}

function fraction(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new Error(`FrameBudgetGovernor: ${name} must be in (0, 1), got ${String(value)}`);
  }
  return value;
}

/**
 * Validate an unknown value as a `FrameBudgetGovernorConfig`. Throws
 * `FrameBudgetGovernor: <detail>` naming the first defect.
 */
export function validateFrameBudgetGovernorConfig(input: unknown): FrameBudgetGovernorConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error('FrameBudgetGovernor: config must be an object');
  }
  const r = input as Record<string, unknown>;
  const targetFrameMs = positiveFinite(r.targetFrameMs, 'targetFrameMs');
  const renderReserveMs = positiveFinite(r.renderReserveMs, 'renderReserveMs');
  if (renderReserveMs >= targetFrameMs) {
    throw new Error(
      `FrameBudgetGovernor: renderReserveMs (${String(r.renderReserveMs)}) must be below targetFrameMs (${String(r.targetFrameMs)})`,
    );
  }
  if (typeof r.hardCapsMs !== 'object' || r.hardCapsMs === null) {
    throw new Error('FrameBudgetGovernor: hardCapsMs must be an object');
  }
  const caps = r.hardCapsMs as Record<string, unknown>;
  const hardCapsMs = {} as Record<GovernedClass, number>;
  for (const cls of GOVERNED_CLASSES) {
    hardCapsMs[cls] = positiveFinite(caps[cls], `hardCapsMs.${cls}`);
  }
  const overloadCutback = fraction(r.overloadCutback, 'overloadCutback');
  const recoveryStep = positiveFinite(r.recoveryStep, 'recoveryStep');
  if (recoveryStep >= 1) {
    throw new Error(`FrameBudgetGovernor: recoveryStep must be below 1, got ${String(r.recoveryStep)}`);
  }
  const starvationFloorMs = positiveFinite(r.starvationFloorMs, 'starvationFloorMs');
  const smallestCap = Math.min(...GOVERNED_CLASSES.map((c) => hardCapsMs[c]));
  if (starvationFloorMs > smallestCap) {
    throw new Error(
      `FrameBudgetGovernor: starvationFloorMs (${String(r.starvationFloorMs)}) must not exceed the smallest hard cap (${smallestCap})`,
    );
  }
  const historySize = r.historySize;
  if (!Number.isInteger(historySize) || (historySize as number) <= 0) {
    throw new Error(`FrameBudgetGovernor: historySize must be a positive integer, got ${String(historySize)}`);
  }
  return {
    targetFrameMs,
    renderReserveMs,
    hardCapsMs,
    overloadCutback,
    recoveryStep,
    starvationFloorMs,
    historySize: historySize as number,
  };
}

/**
 * Shared whole-frame background-work governor. Feeds whole-frame times via
 * `observe`, then allocates per frame via `decide`.
 */
export class FrameBudgetGovernor {
  private readonly config: FrameBudgetGovernorConfig;
  private readonly history: number[] = [];
  private allowanceScale = 1;
  private invalidObserved = false;

  constructor(config: FrameBudgetGovernorConfig = DEFAULT_GOVERNOR_CONFIG) {
    this.config = validateFrameBudgetGovernorConfig({ ...config, hardCapsMs: { ...config.hardCapsMs } });
  }

  /** Current allowance scale in (0, 1]. */
  get scale(): number {
    return this.allowanceScale;
  }

  /** Retained whole-frame observations. */
  get observations(): number {
    return this.history.length;
  }

  /**
   * Record one whole-frame time. Invalid observations (non-finite or
   * negative) are not stored; they latch fail-closed handling so the next
   * decision throttles conservatively instead of trusting bad telemetry.
   */
  observe(frameMs: number): void {
    if (typeof frameMs !== 'number' || !Number.isFinite(frameMs) || frameMs < 0) {
      this.invalidObserved = true;
      return;
    }
    this.history.push(frameMs);
    if (this.history.length > this.config.historySize) {
      this.history.shift();
    }
  }

  private recentP95(): number {
    if (this.history.length === 0) return 0;
    const sorted = [...this.history].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)] ?? 0;
  }

  /**
   * Compute the coming frame's shared background budget.
   *
   * @param nonEmpty per-class backlog presence; empty queues receive zero so
   *   idle work cannot consume the shared budget. Every non-empty queue is
   *   guaranteed at least the starvation floor (clamped to its hard cap).
   */
  decide(nonEmpty: Record<GovernedClass, boolean>): FrameBudgetDecision {
    for (const cls of GOVERNED_CLASSES) {
      if (typeof nonEmpty[cls] !== 'boolean') {
        throw new Error(`FrameBudgetGovernor: nonEmpty.${cls} must be a boolean`);
      }
      if (!isGovernedClass(cls)) {
        throw new Error(`FrameBudgetGovernor: unknown class ${String(cls)}`);
      }
    }
    const { targetFrameMs, renderReserveMs, hardCapsMs, overloadCutback, recoveryStep, starvationFloorMs } = this.config;
    const p95 = this.recentP95();
    const overloaded = this.invalidObserved || (this.history.length > 0 && p95 > targetFrameMs);

    if (overloaded) {
      this.allowanceScale = Math.max(0.05, this.allowanceScale * overloadCutback);
    } else {
      this.allowanceScale = Math.min(1, this.allowanceScale + recoveryStep);
    }
    this.invalidObserved = false;

    // Reserve the baseline input/render margin plus half of any measured
    // p95 excess, so sustained overload protects responsiveness while a
    // healthy p95 keeps the reserve at its baseline. A render-split-aware
    // reserve (whole-frame p50 vs render-submit p50) lands with the Phase 1
    // per-phase timer wiring; until then the fixed baseline is documented.
    const excess = Math.max(0, p95 - targetFrameMs);
    const reservedRenderMs = Math.min(targetFrameMs, renderReserveMs + excess * 0.5);
    const availableBackgroundMs = Math.max(0, targetFrameMs - reservedRenderMs);

    const active = GOVERNED_CLASSES.filter((c) => nonEmpty[c]);
    const perClassMs = {} as Record<GovernedClass, number>;
    for (const cls of GOVERNED_CLASSES) {
      perClassMs[cls] = 0;
    }
    if (active.length > 0) {
      const raw = new Map<GovernedClass, number>();
      let total = 0;
      for (const cls of active) {
        const value = hardCapsMs[cls] * this.allowanceScale;
        raw.set(cls, value);
        total += value;
      }
      if (total <= availableBackgroundMs) {
        for (const cls of active) {
          perClassMs[cls] = Math.min(hardCapsMs[cls], Math.max(Math.min(starvationFloorMs, hardCapsMs[cls]), raw.get(cls)!));
        }
      } else {
        // Over-subscribed: split the available budget proportionally to raw
        // shares, never below the starvation floor (the floor wins over the
        // budget rather than starving a queue; overload cutback shrinks raw
        // shares on subsequent decisions until the budget fits).
        for (const cls of active) {
          const share = availableBackgroundMs * (raw.get(cls)! / total);
          perClassMs[cls] = Math.min(hardCapsMs[cls], Math.max(Math.min(starvationFloorMs, hardCapsMs[cls]), share));
        }
      }
    }
    return {
      targetFrameMs,
      reservedRenderMs,
      availableBackgroundMs,
      perClassMs,
      overloaded,
      allowanceScale: this.allowanceScale,
    };
  }

  /** Clear history, allowance scale, and the invalid-observation latch. */
  reset(): void {
    this.history.length = 0;
    this.allowanceScale = 1;
    this.invalidObserved = false;
  }
}
