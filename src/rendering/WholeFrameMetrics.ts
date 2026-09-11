/**
 * Whole-frame rAF-to-rAF telemetry (258 Phase 1).
 *
 * The 075 `RenderPerformanceMonitor` brackets `Game.render()` only, so its
 * frame timing excludes update/world/simulation/input work that runs before
 * the bracket. This module is the frame authority for Change 258: it records
 * the rAF-to-rAF interval (update + world work + simulation + presentation +
 * render) plus per-phase attribution, in fixed-size rings with percentile and
 * rolling-window analysis.
 *
 * Pure and headless-safe: no DOM, no rAF, no allocation after construction.
 * The measurement side that feeds it (GameLoop boundary hook, phase timers)
 * lives alongside; the headed canonical thresholds live in `PerfGate.ts`.
 */

/** Ordered whole-frame phases (normative for summaries and artifacts). */
export const WHOLE_FRAME_PHASES = [
  'input',
  'fixedTicks',
  'worldUpdate',
  'generation',
  'meshingMain',
  'workerDispatch',
  'lighting',
  'upload',
  'unload',
  'ui',
  'renderSubmit',
] as const;

/** One attributable slice of a whole rAF-to-rAF frame. */
export type WholeFramePhase = (typeof WHOLE_FRAME_PHASES)[number];

/** Whole frames longer than this are long frames (milliseconds). */
export const LONG_FRAME_MS = 50;
/** Whole frames longer than this are severe stalls (milliseconds). */
export const SEVERE_STALL_MS = 100;

/** One sampled whole frame: rAF interval plus per-phase attribution. */
export interface WholeFrameSample {
  /** rAF-to-rAF interval covering update + world + simulation + render (ms). */
  rafIntervalMs: number;
  /** Per-phase main-thread attribution; entries sum to at most the interval. */
  phases: Record<WholeFramePhase, number>;
}

/** Percentile + long-frame summary over the whole-frame ring. */
export interface WholeFrameStats {
  samples: number;
  fpsAvg: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  longFrames: number;
  severeStalls: number;
}

function isPhase(value: unknown): value is WholeFramePhase {
  return typeof value === 'string' && (WHOLE_FRAME_PHASES as readonly string[]).includes(value);
}

function assertSampleTime(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`WholeFrameMetrics: ${name} must be a non-negative finite number, got ${String(value)}`);
  }
  return value;
}

/**
 * Validate an unknown value as a `WholeFrameSample`. Returns a defensive copy
 * on success; throws `WholeFrameMetrics: <detail>` naming the first defect.
 */
export function validateWholeFrameSample(input: unknown): WholeFrameSample {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WholeFrameMetrics: sample must be an object');
  }
  const r = input as Record<string, unknown>;
  const rafIntervalMs = assertSampleTime(r.rafIntervalMs, 'rafIntervalMs');
  if (typeof r.phases !== 'object' || r.phases === null) {
    throw new Error('WholeFrameMetrics: phases must be an object');
  }
  const phases = r.phases as Record<string, unknown>;
  const out = {} as Record<WholeFramePhase, number>;
  for (const phase of WHOLE_FRAME_PHASES) {
    out[phase] = assertSampleTime(phases[phase], `phases.${phase}`);
  }
  return { rafIntervalMs, phases: out };
}

/** Zeroed per-phase attribution (used for interval-only samples). */
export function zeroPhases(): Record<WholeFramePhase, number> {
  const out = {} as Record<WholeFramePhase, number>;
  for (const phase of WHOLE_FRAME_PHASES) {
    out[phase] = 0;
  }
  return out;
}

/**
 * Fixed-size whole-frame history. Never grows: once full, new samples
 * overwrite the oldest. All analysis is a deterministic linear scan.
 */
export class WholeFrameRing {
  private readonly capacity: number;
  private readonly intervals: Float64Array;
  private readonly phaseRings: Record<WholeFramePhase, Float64Array>;
  private count = 0;
  private index = 0;

  constructor(capacity = 600) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`WholeFrameRing: capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.intervals = new Float64Array(capacity);
    const phases = {} as Record<WholeFramePhase, Float64Array>;
    for (const phase of WHOLE_FRAME_PHASES) {
      phases[phase] = new Float64Array(capacity);
    }
    this.phaseRings = phases;
  }

  /** Fixed sample capacity. */
  get size(): number {
    return this.capacity;
  }

  /** Samples recorded (capped at capacity). */
  get samples(): number {
    return this.count;
  }

  /** Record one validated sample; overwrites the oldest when full. */
  record(sample: WholeFrameSample): void {
    const valid = validateWholeFrameSample(sample);
    this.intervals[this.index] = valid.rafIntervalMs;
    for (const phase of WHOLE_FRAME_PHASES) {
      this.phaseRings[phase]![this.index] = valid.phases[phase];
    }
    this.index = (this.index + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count += 1;
    }
  }

  /**
   * Record an interval-only sample (phases zeroed). Used by the rAF boundary
   * hook before per-phase timers are wired; keeps the frame authority live
   * with negligible overhead.
   */
  recordInterval(rafIntervalMs: number): void {
    this.record({ rafIntervalMs: assertSampleTime(rafIntervalMs, 'rafIntervalMs'), phases: zeroPhases() });
  }

  /** Intervals oldest-first (for rolling-window analysis). */
  private orderedIntervals(): number[] {
    const n = this.count;
    const out = new Array<number>(n);
    const start = (this.index - this.count + this.capacity * 2) % this.capacity;
    for (let i = 0; i < n; i++) {
      out[i] = this.intervals[(start + i) % this.capacity]!;
    }
    return out;
  }

  private static percentileOf(sorted: number[], p: number): number {
    const n = sorted.length;
    if (n === 0) return 0;
    return sorted[Math.min(n - 1, Math.ceil(p * n) - 1)] ?? 0;
  }

  /** Frame-time percentiles, average FPS, and long/severe frame counts. */
  frameStats(): WholeFrameStats {
    const n = this.count;
    if (n === 0) {
      return { samples: 0, fpsAvg: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, longFrames: 0, severeStalls: 0 };
    }
    const sorted = Array.from(this.intervals.subarray(0, n)).sort((a, b) => a - b);
    let total = 0;
    let longFrames = 0;
    let severeStalls = 0;
    for (const t of sorted) {
      total += t;
      if (t > LONG_FRAME_MS) longFrames += 1;
      if (t > SEVERE_STALL_MS) severeStalls += 1;
    }
    const avg = total / n;
    return {
      samples: n,
      fpsAvg: avg > 0 ? 1000 / avg : 0,
      p50Ms: WholeFrameRing.percentileOf(sorted, 0.5),
      p95Ms: WholeFrameRing.percentileOf(sorted, 0.95),
      p99Ms: WholeFrameRing.percentileOf(sorted, 0.99),
      longFrames,
      severeStalls,
    };
  }

  /** p50/p95/p99 of one attributed phase over the retained samples. */
  phaseStats(phase: WholeFramePhase): { p50Ms: number; p95Ms: number; p99Ms: number; totalMs: number } {
    if (!isPhase(phase)) {
      throw new Error(`WholeFrameMetrics: unknown phase ${String(phase)}`);
    }
    const n = this.count;
    if (n === 0) return { p50Ms: 0, p95Ms: 0, p99Ms: 0, totalMs: 0 };
    const sorted = Array.from(this.phaseRings[phase]!.subarray(0, n)).sort((a, b) => a - b);
    let total = 0;
    for (const t of sorted) total += t;
    return {
      p50Ms: WholeFrameRing.percentileOf(sorted, 0.5),
      p95Ms: WholeFrameRing.percentileOf(sorted, 0.95),
      p99Ms: WholeFrameRing.percentileOf(sorted, 0.99),
      totalMs: total,
    };
  }

  /**
   * Minimum FPS over the trailing window (default 10 s, per the 258 rolling
   * 10-second certification windows). Walks newest-first accumulating
   * intervals until the window is covered; the minimum instantaneous FPS in
   * that span is the rolling minimum. Returns 0 when empty.
   */
  rollingMinFps(windowMs = 10_000): number {
    if (typeof windowMs !== 'number' || !Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error(`WholeFrameMetrics: windowMs must be a positive finite number, got ${String(windowMs)}`);
    }
    const ordered = this.orderedIntervals();
    if (ordered.length === 0) return 0;
    let covered = 0;
    let minFps = Number.POSITIVE_INFINITY;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const interval = ordered[i]!;
      covered += interval;
      const fps = interval > 0 ? 1000 / interval : 0;
      if (fps < minFps) minFps = fps;
      if (covered >= windowMs) break;
    }
    return minFps === Number.POSITIVE_INFINITY ? 0 : minFps;
  }

  /** Fraction of retained frames exceeding the long-frame threshold. */
  longFrameFraction(): number {
    if (this.count === 0) return 0;
    return this.frameStats().longFrames / this.count;
  }

  /** Clear all retained samples (e.g. between harness scenarios). */
  reset(): void {
    this.count = 0;
    this.index = 0;
  }
}

/**
 * Injectable-clock per-phase timer for one in-progress frame.
 *
 * When disabled, `begin`/`end` are strict no-ops that never touch the clock,
 * so the shipped default pays nothing measurable; the harness enables timing
 * explicitly. When enabled, misuse (nested begin, end without begin,
 * finishing with a phase open) throws `WholeFrameMetrics: <detail>`.
 */
export class PhaseTimer {
  private readonly now: () => number;
  private enabled: boolean;
  private openPhase: WholeFramePhase | null = null;
  private openStart = 0;
  private readonly totals: Record<WholeFramePhase, number>;

  constructor(now: () => number, enabled = true) {
    if (typeof now !== 'function') {
      throw new Error('WholeFrameMetrics: now must be a function');
    }
    this.now = now;
    this.enabled = enabled;
    this.totals = zeroPhases();
  }

  /** Whether phase timing is active. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Whether a phase is currently open (timing in progress). Read-only;
   * lets callers with re-entrant work (e.g. sync worker fallbacks) avoid
   * nesting `begin` calls, which throw. Nested time already attributes to
   * the outer phase, so skipping the inner bracket loses nothing.
   */
  get hasOpenPhase(): boolean {
    return this.openPhase !== null;
  }

  /** Enable or disable timing. Disabling mid-phase discards the open phase. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.openPhase = null;
    }
  }

  /** Start timing a phase. No-op (no clock read) while disabled. */
  begin(phase: WholeFramePhase): void {
    if (!this.enabled) return;
    if (!isPhase(phase)) {
      throw new Error(`WholeFrameMetrics: unknown phase ${String(phase)}`);
    }
    if (this.openPhase !== null) {
      throw new Error(`WholeFrameMetrics: begin(${phase}) while ${this.openPhase} is open`);
    }
    this.openPhase = phase;
    this.openStart = this.now();
  }

  /** Stop timing the open phase and accumulate it. No-op while disabled. */
  end(): void {
    if (!this.enabled) return;
    if (this.openPhase === null) {
      throw new Error('WholeFrameMetrics: end without an open phase');
    }
    const elapsed = Math.max(0, this.now() - this.openStart);
    this.totals[this.openPhase] += elapsed;
    this.openPhase = null;
  }

  /**
   * Add an externally measured contribution to one phase of the current
   * frame (e.g. World-internal sub-phases drained after `World.update`).
   * No-op while disabled. Throws `WholeFrameMetrics: <detail>` on an unknown
   * phase or a negative/non-finite contribution.
   */
  accumulate(phase: WholeFramePhase, elapsedMs: number): void {
    if (!this.enabled) return;
    if (!isPhase(phase)) {
      throw new Error(`WholeFrameMetrics: unknown phase ${String(phase)}`);
    }
    if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
      throw new Error(
        `WholeFrameMetrics: accumulate(${phase}) must be a non-negative finite number, got ${String(elapsedMs)}`,
      );
    }
    this.totals[phase] += elapsedMs;
  }

  /**
   * Close the current frame: returns the sample (rAF interval + accumulated
   * phases) and resets phase totals. Throws when a phase is still open.
   */
  finishFrame(rafIntervalMs: number): WholeFrameSample {
    assertSampleTime(rafIntervalMs, 'rafIntervalMs');
    if (this.enabled && this.openPhase !== null) {
      throw new Error(`WholeFrameMetrics: finishFrame with ${this.openPhase} still open`);
    }
    const sample: WholeFrameSample = { rafIntervalMs, phases: { ...this.totals } };
    for (const phase of WHOLE_FRAME_PHASES) {
      this.totals[phase] = 0;
    }
    return sample;
  }
}

/**
 * Per-frame renderer/resource snapshot joined to the whole-frame stream
 * (258 task 22). Recorded once per rendered frame from `renderer.info` plus
 * the drawing-buffer size and dynamic-resolution scale, so headed artifacts
 * can correlate GPU-side cost with whole-frame latency without reshaping the
 * validated `WholeFrameSample`.
 *
 * Fixed-size and allocation-free after construction: seven `Float64Array`
 * columns; once full, new snapshots overwrite the oldest.
 */
export class FrameAuxRing {
  private readonly capacity: number;
  private readonly calls: Float64Array;
  private readonly triangles: Float64Array;
  private readonly geometries: Float64Array;
  private readonly textures: Float64Array;
  private readonly bufferWidth: Float64Array;
  private readonly bufferHeight: Float64Array;
  private readonly dynamicScale: Float64Array;
  private count = 0;
  private index = 0;

  constructor(capacity = 600) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`WholeFrameMetrics: FrameAuxRing capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.calls = new Float64Array(capacity);
    this.triangles = new Float64Array(capacity);
    this.geometries = new Float64Array(capacity);
    this.textures = new Float64Array(capacity);
    this.bufferWidth = new Float64Array(capacity);
    this.bufferHeight = new Float64Array(capacity);
    this.dynamicScale = new Float64Array(capacity);
  }

  /** Fixed snapshot capacity. */
  get size(): number {
    return this.capacity;
  }

  /** Snapshots recorded (capped at capacity). */
  get samples(): number {
    return this.count;
  }

  /** Record one frame's renderer snapshot; overwrites the oldest when full. */
  record(
    calls: number,
    triangles: number,
    geometries: number,
    textures: number,
    bufferWidth: number,
    bufferHeight: number,
    dynamicScale: number,
  ): void {
    const values = [calls, triangles, geometries, textures, bufferWidth, bufferHeight, dynamicScale];
    const names = ['calls', 'triangles', 'geometries', 'textures', 'bufferWidth', 'bufferHeight', 'dynamicScale'];
    for (let i = 0; i < values.length; i++) {
      const value = values[i]!;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`WholeFrameMetrics: FrameAuxRing ${names[i]} must be a non-negative finite number, got ${String(value)}`);
      }
    }
    this.calls[this.index] = calls;
    this.triangles[this.index] = triangles;
    this.geometries[this.index] = geometries;
    this.textures[this.index] = textures;
    this.bufferWidth[this.index] = bufferWidth;
    this.bufferHeight[this.index] = bufferHeight;
    this.dynamicScale[this.index] = dynamicScale;
    this.index = (this.index + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count += 1;
    }
  }

  /** Most recently recorded snapshot, or zeros when empty. */
  latest(): {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
    bufferWidth: number;
    bufferHeight: number;
    dynamicScale: number;
  } {
    if (this.count === 0) {
      return { calls: 0, triangles: 0, geometries: 0, textures: 0, bufferWidth: 0, bufferHeight: 0, dynamicScale: 0 };
    }
    const at = (this.index - 1 + this.capacity) % this.capacity;
    return {
      calls: this.calls[at]!,
      triangles: this.triangles[at]!,
      geometries: this.geometries[at]!,
      textures: this.textures[at]!,
      bufferWidth: this.bufferWidth[at]!,
      bufferHeight: this.bufferHeight[at]!,
      dynamicScale: this.dynamicScale[at]!,
    };
  }

  /** Maximum draw calls over the retained snapshots (burst detection). */
  maxCalls(): number {
    let max = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.calls[i]! > max) max = this.calls[i]!;
    }
    return max;
  }

  /** Clear all retained snapshots (e.g. between harness scenarios). */
  reset(): void {
    this.count = 0;
    this.index = 0;
  }
}
