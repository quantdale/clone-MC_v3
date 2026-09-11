import { describe, it, expect } from "vitest";
import {
  busyLoopSelfTestSummary,
  evaluateAllPerfGates,
  evaluateCachedTraversalGate,
  evaluateFreshTraversalGate,
  evaluateInteractionFloorGate,
  evaluateStationaryGate,
  type PerfScenarioSummary,
} from "../../src/rendering/PerfGate";

const PERFECT_STATIONARY: PerfScenarioSummary = {
  averageFps: 60,
  p95Ms: 20,
  p99Ms: 30,
  over50Fraction: 0.005,
  rollingMin10sFps: 55,
  severeStallCount: 0,
};

describe("PerfGate stationary thresholds", () => {
  it("passes exactly at the normative boundary", () => {
    expect(
      evaluateStationaryGate({
        averageFps: 55,
        p95Ms: 22,
        p99Ms: 33,
        over50Fraction: 0.01,
        rollingMin10sFps: 45,
        severeStallCount: 3,
      }),
    ).toEqual({ passed: true, reasons: [] });
  });

  it("fails each dimension with a named reason", () => {
    expect(evaluateStationaryGate({ ...PERFECT_STATIONARY, averageFps: 54.9 }).reasons).toEqual([
      "averageFps 54.9 below 55",
    ]);
    expect(evaluateStationaryGate({ ...PERFECT_STATIONARY, p95Ms: 22.1 }).reasons).toEqual(["p95Ms 22.1 above 22"]);
    expect(evaluateStationaryGate({ ...PERFECT_STATIONARY, p99Ms: 33.1 }).reasons).toEqual(["p99Ms 33.1 above 33"]);
    expect(evaluateStationaryGate({ ...PERFECT_STATIONARY, over50Fraction: 0.011 }).reasons).toEqual([
      "over50Fraction 0.011 above 0.01",
    ]);
  });
});

describe("PerfGate traversal and interaction thresholds", () => {
  it("fresh traversal requires zero severe stalls", () => {
    const base: PerfScenarioSummary = {
      averageFps: 50,
      p95Ms: 25,
      p99Ms: 45,
      over50Fraction: 0.05,
      rollingMin10sFps: 40,
      severeStallCount: 0,
    };
    expect(evaluateFreshTraversalGate(base)).toEqual({ passed: true, reasons: [] });
    expect(evaluateFreshTraversalGate({ ...base, severeStallCount: 1 }).passed).toBe(false);
    expect(evaluateFreshTraversalGate({ ...base, averageFps: 44 }).reasons).toEqual(["averageFps 44 below 45"]);
  });

  it("cached traversal enforces the rolling floor", () => {
    expect(
      evaluateCachedTraversalGate({ ...PERFECT_STATIONARY, averageFps: 60, rollingMin10sFps: 45 }),
    ).toEqual({ passed: true, reasons: [] });
    expect(
      evaluateCachedTraversalGate({ ...PERFECT_STATIONARY, averageFps: 60, rollingMin10sFps: 44 }).reasons,
    ).toEqual(["rollingMin10sFps 44 below 45"]);
  });

  it("interaction floor is rolling-window only", () => {
    expect(evaluateInteractionFloorGate({ ...PERFECT_STATIONARY, averageFps: 20 }).passed).toBe(true);
    expect(evaluateInteractionFloorGate({ ...PERFECT_STATIONARY, rollingMin10sFps: 30 }).passed).toBe(false);
  });
});

describe("PerfGate fail-closed validation", () => {
  it("rejects malformed summaries without throwing", () => {
    for (const bad of [
      null,
      { ...PERFECT_STATIONARY, averageFps: Number.NaN },
      { ...PERFECT_STATIONARY, p95Ms: -1 },
      { ...PERFECT_STATIONARY, over50Fraction: 1.5 },
      { ...PERFECT_STATIONARY, severeStallCount: 1.5 },
      { ...PERFECT_STATIONARY, severeStallCount: -1 },
      {},
    ]) {
      expect(evaluateStationaryGate(bad).passed).toBe(false);
      expect(evaluateFreshTraversalGate(bad).passed).toBe(false);
      expect(evaluateCachedTraversalGate(bad).passed).toBe(false);
      expect(evaluateInteractionFloorGate(bad).passed).toBe(false);
    }
  });

  it("the injected busy loop fails every gate (harness self-test)", () => {
    const busy = busyLoopSelfTestSummary();
    const verdicts = evaluateAllPerfGates({
      stationary: busy,
      freshTraversal: busy,
      cachedTraversal: busy,
      interactionFloor: busy,
    });
    expect(verdicts.stationary.passed).toBe(false);
    expect(verdicts["fresh-traversal"].passed).toBe(false);
    expect(verdicts["cached-traversal"].passed).toBe(false);
    expect(verdicts["interaction-floor"].passed).toBe(false);
    // The busy loop is slow on average and saturated with long frames.
    expect(verdicts.stationary.reasons.length).toBeGreaterThan(0);
  });
});
