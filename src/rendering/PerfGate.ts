/**
 * Headed certification gate evaluation (258 Phase 6, pure core).
 *
 * Normative thresholds from the 258 proposal Definition of Done:
 * - stationary 30 s: avg >= 55 FPS, p95 <= 22 ms, p99 <= 33 ms, >50 ms <= 1%;
 * - fresh 60 s traversal: avg >= 45 FPS, p95 <= 28 ms, p99 <= 50 ms, no
 *   recurring >100 ms stalls (zero severe stalls);
 * - cached traversal: avg >= 55 FPS and no rolling 10 s window below 45 FPS;
 * - interaction/entity/day-night: no sustained rolling 10 s window below 45 FPS.
 *
 * Pure and headless-safe: the headed harness collects `PerfScenarioSummary`
 * values from real runs and evaluates them here. Malformed summaries fail
 * closed with a named reason. The harness self-test (task 38) feeds a
 * synthetic busy-loop summary and requires every gate to fail.
 */

/** Measured summary of one headed scenario run. */
export interface PerfScenarioSummary {
  /** Mean frames per second over the scenario measurement window. */
  averageFps: number;
  /** Whole-frame p95 over the window (milliseconds). */
  p95Ms: number;
  /** Whole-frame p99 over the window (milliseconds). */
  p99Ms: number;
  /** Fraction of frames exceeding 50 ms, in [0, 1]. */
  over50Fraction: number;
  /** Minimum FPS over any rolling 10-second window after warm-up. */
  rollingMin10sFps: number;
  /** Count of frames exceeding 100 ms. */
  severeStallCount: number;
}

/** Pass/fail verdict with machine-checkable failure reasons. */
export interface PerfGateVerdict {
  passed: boolean;
  reasons: string[];
}

/** Which certification scenario a verdict applies to. */
export type PerfGateKind = 'stationary' | 'fresh-traversal' | 'cached-traversal' | 'interaction-floor';

function finiteNonNegative(value: unknown, name: string, reasons: string[]): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    reasons.push(`invalid ${name}: ${String(value)}`);
    return null;
  }
  return value;
}

function check(
  ok: boolean,
  reason: string,
  reasons: string[],
): void {
  if (!ok) reasons.push(reason);
}

/**
 * Validate a scenario summary. Returns the summary narrowed on success;
 * pushes fail-closed reasons and returns null on any malformed field.
 */
function validateSummary(input: unknown): { summary: PerfScenarioSummary; reasons: string[] } {
  const reasons: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { summary: input as PerfScenarioSummary, reasons: ['summary must be an object'] };
  }
  const r = input as Record<string, unknown>;
  finiteNonNegative(r.averageFps, 'averageFps', reasons);
  finiteNonNegative(r.p95Ms, 'p95Ms', reasons);
  finiteNonNegative(r.p99Ms, 'p99Ms', reasons);
  const over50Fraction = finiteNonNegative(r.over50Fraction, 'over50Fraction', reasons);
  finiteNonNegative(r.rollingMin10sFps, 'rollingMin10sFps', reasons);
  const severeStallCount = r.severeStallCount;
  if (typeof severeStallCount !== 'number' || !Number.isInteger(severeStallCount) || severeStallCount < 0) {
    reasons.push(`invalid severeStallCount: ${String(severeStallCount)}`);
  }
  if (over50Fraction !== null && over50Fraction > 1) {
    reasons.push(`invalid over50Fraction: ${String(r.over50Fraction)}`);
  }
  if (reasons.length > 0) {
    return { summary: input as PerfScenarioSummary, reasons };
  }
  return {
    summary: input as PerfScenarioSummary,
    reasons,
  };
}

/** Stationary 30 s gate: avg >= 55 FPS, p95 <= 22 ms, p99 <= 33 ms, >50 ms <= 1%. */
export function evaluateStationaryGate(input: unknown): PerfGateVerdict {
  const { summary, reasons } = validateSummary(input);
  if (reasons.length > 0) return { passed: false, reasons };
  check(summary.averageFps >= 55, `averageFps ${summary.averageFps} below 55`, reasons);
  check(summary.p95Ms <= 22, `p95Ms ${summary.p95Ms} above 22`, reasons);
  check(summary.p99Ms <= 33, `p99Ms ${summary.p99Ms} above 33`, reasons);
  check(summary.over50Fraction <= 0.01, `over50Fraction ${summary.over50Fraction} above 0.01`, reasons);
  return { passed: reasons.length === 0, reasons };
}

/** Fresh-traversal 60 s gate: avg >= 45 FPS, p95 <= 28 ms, p99 <= 50 ms, zero severe stalls. */
export function evaluateFreshTraversalGate(input: unknown): PerfGateVerdict {
  const { summary, reasons } = validateSummary(input);
  if (reasons.length > 0) return { passed: false, reasons };
  check(summary.averageFps >= 45, `averageFps ${summary.averageFps} below 45`, reasons);
  check(summary.p95Ms <= 28, `p95Ms ${summary.p95Ms} above 28`, reasons);
  check(summary.p99Ms <= 50, `p99Ms ${summary.p99Ms} above 50`, reasons);
  check(summary.severeStallCount === 0, `severeStallCount ${summary.severeStallCount} is not zero`, reasons);
  return { passed: reasons.length === 0, reasons };
}

/** Cached-traversal gate: avg >= 55 FPS and no rolling 10 s window below 45 FPS. */
export function evaluateCachedTraversalGate(input: unknown): PerfGateVerdict {
  const { summary, reasons } = validateSummary(input);
  if (reasons.length > 0) return { passed: false, reasons };
  check(summary.averageFps >= 55, `averageFps ${summary.averageFps} below 55`, reasons);
  check(summary.rollingMin10sFps >= 45, `rollingMin10sFps ${summary.rollingMin10sFps} below 45`, reasons);
  return { passed: reasons.length === 0, reasons };
}

/** Interaction/entity/day-night floor: no sustained rolling 10 s window below 45 FPS. */
export function evaluateInteractionFloorGate(input: unknown): PerfGateVerdict {
  const { summary, reasons } = validateSummary(input);
  if (reasons.length > 0) return { passed: false, reasons };
  check(summary.rollingMin10sFps >= 45, `rollingMin10sFps ${summary.rollingMin10sFps} below 45`, reasons);
  return { passed: reasons.length === 0, reasons };
}

/** Evaluate all four gates over their respective scenario summaries. */
export function evaluateAllPerfGates(input: {
  stationary: unknown;
  freshTraversal: unknown;
  cachedTraversal: unknown;
  interactionFloor: unknown;
}): Record<PerfGateKind, PerfGateVerdict> {
  return {
    stationary: evaluateStationaryGate(input.stationary),
    'fresh-traversal': evaluateFreshTraversalGate(input.freshTraversal),
    'cached-traversal': evaluateCachedTraversalGate(input.cachedTraversal),
    'interaction-floor': evaluateInteractionFloorGate(input.interactionFloor),
  };
}

/**
 * Synthetic busy-loop summary for the harness self-test (task 38): every
 * frame takes 60 ms, so every gate MUST fail. The harness feeds this through
 * the same evaluation path as real runs to prove the gate is not vacuous.
 */
export function busyLoopSelfTestSummary(): PerfScenarioSummary {
  return {
    averageFps: 1000 / 60,
    p95Ms: 60,
    p99Ms: 60,
    over50Fraction: 1,
    rollingMin10sFps: 1000 / 60,
    severeStallCount: 0,
  };
}
