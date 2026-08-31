import type { QualityTier } from '../config';

/** Per-quality-tier dynamic-resolution bounds and control thresholds. */
export interface DynamicResolutionTierConfig {
  /** Lowest internal render scale permitted for this tier. */
  minScale: number;
  /** Highest internal render scale permitted for this tier. */
  maxScale: number;
  /** Initial scale used when the controller is created for this tier. */
  initialScale: number;
  /** Maximum scale change accepted by one dwell decision. */
  step: number;
  /** Effective frame-time threshold that starts/downholds overload. */
  downThresholdMillis: number;
  /** Effective frame-time threshold that starts recovery. Must be below downThresholdMillis. */
  upThresholdMillis: number;
  /** Continuous overload required before one downward step. */
  downDwellMillis: number;
  /** Continuous recovery required before one upward step. */
  upDwellMillis: number;
}

/** Dynamic-resolution configuration for the three supported quality tiers. */
export type DynamicResolutionConfig = Readonly<Record<QualityTier, DynamicResolutionTierConfig>>;

/** CPU/GPU timing sample consumed by the controller. */
export interface DynamicResolutionMetrics {
  /** Rolling CPU frame-time p95, in milliseconds. */
  p95FrameTimeMillis: number;
  /** Optional GPU frame time, in milliseconds. The slower signal wins. */
  gpuFrameTimeMillis?: number;
}

export interface DynamicResolutionBufferSize {
  width: number;
  height: number;
  renderScale: number;
}

export type DynamicResolutionUpdateReason =
  | 'changed'
  | 'dwell'
  | 'deadband'
  | 'at-bound'
  | 'invalid-metric';

/** Result of one deterministic controller sample. */
export interface DynamicResolutionUpdate {
  scale: number;
  changed: boolean;
  valid: boolean;
  effectiveFrameTimeMillis: number | null;
  reason: DynamicResolutionUpdateReason;
}

export interface DynamicResolutionState {
  tier: QualityTier;
  scale: number;
  minScale: number;
  maxScale: number;
  invalidMetricCount: number;
  effectiveFrameTimeMillis: number | null;
  direction: 'down' | 'up' | null;
}

const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high'];

/** Conservative defaults: dynamic resolution is opt-in through a controller instance. */
export const DEFAULT_DYNAMIC_RESOLUTION_CONFIG: DynamicResolutionConfig = {
  low: {
    minScale: 0.75,
    maxScale: 1,
    initialScale: 1,
    step: 0.1,
    downThresholdMillis: 24,
    upThresholdMillis: 16,
    downDwellMillis: 500,
    upDwellMillis: 1000,
  },
  medium: {
    minScale: 0.625,
    maxScale: 1,
    initialScale: 1,
    step: 0.1,
    downThresholdMillis: 20,
    upThresholdMillis: 14,
    downDwellMillis: 500,
    upDwellMillis: 1000,
  },
  high: {
    minScale: 0.5,
    maxScale: 1,
    initialScale: 1,
    step: 0.1,
    downThresholdMillis: 18,
    upThresholdMillis: 12,
    downDwellMillis: 500,
    upDwellMillis: 1000,
  },
};

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isTier(value: unknown): value is QualityTier {
  return typeof value === 'string' && (QUALITY_TIERS as readonly string[]).includes(value);
}

function validateTierConfig(tier: QualityTier, input: unknown): DynamicResolutionTierConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error(`DynamicResolutionConfig.${tier}: must be an object`);
  }
  const config = input as Record<string, unknown>;
  for (const key of [
    'minScale',
    'maxScale',
    'initialScale',
    'step',
    'downThresholdMillis',
    'upThresholdMillis',
    'downDwellMillis',
    'upDwellMillis',
  ]) {
    if (!isFinitePositive(config[key])) {
      throw new Error(`DynamicResolutionConfig.${tier}.${key} must be positive and finite`);
    }
  }
  if (config.minScale! > config.maxScale!) {
    throw new Error(`DynamicResolutionConfig.${tier}: minScale must not exceed maxScale`);
  }
  if (config.initialScale! < config.minScale! || config.initialScale! > config.maxScale!) {
    throw new Error(`DynamicResolutionConfig.${tier}: initialScale must be within bounds`);
  }
  if (config.upThresholdMillis! >= config.downThresholdMillis!) {
    throw new Error(`DynamicResolutionConfig.${tier}: upThresholdMillis must be below downThresholdMillis`);
  }
  return config as unknown as DynamicResolutionTierConfig;
}

/** Validate all tier bounds before a controller can own them. */
export function validateDynamicResolutionConfig(input: unknown): DynamicResolutionConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error('DynamicResolutionConfig: must be an object');
  }
  const record = input as Record<string, unknown>;
  for (const tier of QUALITY_TIERS) {
    validateTierConfig(tier, record[tier]);
  }
  return input as DynamicResolutionConfig;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function validMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Hysteretic, tier-bounded internal-resolution controller.
 *
 * The controller owns only render scale. It has no simulation clock, camera,
 * projection, or gameplay dependency; callers decide when to sample it. Invalid
 * timing samples preserve the last valid scale and increment a diagnostic count.
 */
export class DynamicResolutionController {
  private readonly config: DynamicResolutionConfig;
  private tier: QualityTier;
  private scale: number;
  private invalidMetricCount = 0;
  private effectiveFrameTimeMillis: number | null = null;
  private lastNowMs: number | undefined;
  private overloadSinceMs: number | undefined;
  private recoverySinceMs: number | undefined;
  private direction: 'down' | 'up' | null = null;

  constructor(
    tier: QualityTier,
    config: DynamicResolutionConfig = DEFAULT_DYNAMIC_RESOLUTION_CONFIG,
  ) {
    if (!isTier(tier)) {
      throw new Error(`DynamicResolutionController: unknown tier ${String(tier)}`);
    }
    this.config = validateDynamicResolutionConfig(config);
    this.tier = tier;
    this.scale = this.tierConfig().initialScale;
  }

  /** Select a tier, clamp its scale, and discard dwell history from the old tier. */
  setTier(tier: QualityTier): void {
    if (!isTier(tier)) {
      throw new Error(`DynamicResolutionController: unknown tier ${String(tier)}`);
    }
    if (tier === this.tier) return;
    this.tier = tier;
    const bounds = this.tierConfig();
    this.scale = clamp(this.scale, bounds.minScale, bounds.maxScale);
    this.resetDwell();
  }

  /** Test-only: force scale within current tier bounds and clear dwell history. */
  setScaleForTest(scale: number): void {
    const bounds = this.tierConfig();
    this.scale = clamp(scale, bounds.minScale, bounds.maxScale);
    this.resetDwell();
  }

  /** Current scale, always within the active tier's bounds. */
  getScale(): number {
    return this.scale;
  }

  /** Current immutable-value state for diagnostics and renderer integration. */
  state(): DynamicResolutionState {
    return {
      tier: this.tier,
      scale: this.scale,
      minScale: this.tierConfig().minScale,
      maxScale: this.tierConfig().maxScale,
      invalidMetricCount: this.invalidMetricCount,
      effectiveFrameTimeMillis: this.effectiveFrameTimeMillis,
      direction: this.direction,
    };
  }

  /**
   * Apply one timing sample at `nowMs`. A scale step occurs only after the
   * corresponding direction has remained continuously beyond its threshold for
   * its dwell interval. Dead-band samples clear both dwell timers.
   */
  update(nowMs: number, metrics: DynamicResolutionMetrics): DynamicResolutionUpdate {
    if (!validMetric(nowMs) || (this.lastNowMs !== undefined && nowMs < this.lastNowMs)) {
      this.invalidMetricCount += 1;
      return {
        scale: this.scale,
        changed: false,
        valid: false,
        effectiveFrameTimeMillis: null,
        reason: 'invalid-metric',
      };
    }
    const gpu = metrics.gpuFrameTimeMillis;
    if (!validMetric(metrics.p95FrameTimeMillis) || (gpu !== undefined && !validMetric(gpu))) {
      this.invalidMetricCount += 1;
      return {
        scale: this.scale,
        changed: false,
        valid: false,
        effectiveFrameTimeMillis: null,
        reason: 'invalid-metric',
      };
    }

    this.lastNowMs = nowMs;
    const effective = Math.max(metrics.p95FrameTimeMillis, gpu ?? 0);
    this.effectiveFrameTimeMillis = effective;
    const tier = this.tierConfig();
    if (effective > tier.downThresholdMillis) {
      this.recoverySinceMs = undefined;
      this.direction = 'down';
      if (this.overloadSinceMs === undefined) this.overloadSinceMs = nowMs;
      if (nowMs - this.overloadSinceMs < tier.downDwellMillis) {
        return this.result(false, 'dwell', effective);
      }
      if (this.scale <= tier.minScale) {
        this.overloadSinceMs = nowMs;
        return this.result(false, 'at-bound', effective);
      }
      const previous = this.scale;
      this.scale = clamp(this.scale - tier.step, tier.minScale, tier.maxScale);
      this.overloadSinceMs = nowMs;
      return this.result(this.scale !== previous, 'changed', effective);
    }
    if (effective < tier.upThresholdMillis) {
      this.overloadSinceMs = undefined;
      this.direction = 'up';
      if (this.recoverySinceMs === undefined) this.recoverySinceMs = nowMs;
      if (nowMs - this.recoverySinceMs < tier.upDwellMillis) {
        return this.result(false, 'dwell', effective);
      }
      if (this.scale >= tier.maxScale) {
        this.recoverySinceMs = nowMs;
        return this.result(false, 'at-bound', effective);
      }
      const previous = this.scale;
      this.scale = clamp(this.scale + tier.step, tier.minScale, tier.maxScale);
      this.recoverySinceMs = nowMs;
      return this.result(this.scale !== previous, 'changed', effective);
    }

    this.resetDwell();
    return this.result(false, 'deadband', effective);
  }

  /** Calculate the actual drawing-buffer dimensions for a CSS viewport and DPR. */
  bufferSize(width: number, height: number, devicePixelRatio: number): DynamicResolutionBufferSize {
    if (!validMetric(width) || !validMetric(height) || !validMetric(devicePixelRatio) || width <= 0 || height <= 0 || devicePixelRatio <= 0) {
      throw new RangeError('DynamicResolutionController.bufferSize: dimensions and devicePixelRatio must be positive finite numbers');
    }
    return {
      width: Math.max(1, Math.floor(width * devicePixelRatio * this.scale)),
      height: Math.max(1, Math.floor(height * devicePixelRatio * this.scale)),
      renderScale: this.scale,
    };
  }

  private tierConfig(): DynamicResolutionTierConfig {
    return this.config[this.tier];
  }

  private resetDwell(): void {
    this.overloadSinceMs = undefined;
    this.recoverySinceMs = undefined;
    this.direction = null;
  }

  private result(
    changed: boolean,
    reason: DynamicResolutionUpdateReason,
    effectiveFrameTimeMillis: number,
  ): DynamicResolutionUpdate {
    return {
      scale: this.scale,
      changed,
      valid: true,
      effectiveFrameTimeMillis,
      reason,
    };
  }
}
