import { describe, it, expect } from "vitest";
import {
  LONG_FRAME_MS,
  PhaseTimer,
  SEVERE_STALL_MS,
  WHOLE_FRAME_PHASES,
  WholeFrameRing,
  validateWholeFrameSample,
  zeroPhases,
  type WholeFrameSample,
} from "../../src/rendering/WholeFrameMetrics";

function sample(intervalMs: number, phaseMs = 0): WholeFrameSample {
  const phases = zeroPhases();
  phases.renderSubmit = phaseMs;
  return { rafIntervalMs: intervalMs, phases };
}

describe("WholeFrameMetrics validation", () => {
  it("accepts a well-formed sample and returns a defensive copy", () => {
    const input = sample(16.7, 5);
    const out = validateWholeFrameSample(input);
    expect(out.rafIntervalMs).toBe(16.7);
    expect(out.phases.renderSubmit).toBe(5);
    out.phases.renderSubmit = 999;
    expect(input.phases.renderSubmit).toBe(5);
  });

  it("rejects malformed samples naming the defect", () => {
    expect(() => validateWholeFrameSample(null)).toThrow(/WholeFrameMetrics: sample must be an object/);
    expect(() => validateWholeFrameSample({ rafIntervalMs: -1, phases: zeroPhases() })).toThrow(/rafIntervalMs/);
    expect(() => validateWholeFrameSample({ rafIntervalMs: Number.NaN, phases: zeroPhases() })).toThrow(/rafIntervalMs/);
    expect(() => validateWholeFrameSample({ rafIntervalMs: 16, phases: null })).toThrow(/phases must be an object/);
    const bad = sample(16);
    bad.phases.generation = Number.POSITIVE_INFINITY;
    expect(() => validateWholeFrameSample(bad)).toThrow(/phases\.generation/);
  });

  it("rejects non-positive integer ring capacities", () => {
    expect(() => new WholeFrameRing(0)).toThrow(RangeError);
    expect(() => new WholeFrameRing(1.5)).toThrow(RangeError);
  });

  it("exports the normative long-frame and severe-stall thresholds", () => {
    expect(LONG_FRAME_MS).toBe(50);
    expect(SEVERE_STALL_MS).toBe(100);
  });
});

describe("WholeFrameRing frame authority", () => {
  it("whole-frame latency grows with injected update work, unlike render-only timing", () => {
    const ring = new WholeFrameRing(16);
    // Baseline: cheap frames.
    for (let i = 0; i < 5; i++) ring.record(sample(10, 4));
    expect(ring.frameStats().p50Ms).toBe(10);
    // Inject deterministic main-thread update work outside render-submit.
    for (let i = 0; i < 5; i++) {
      const phases = zeroPhases();
      phases.worldUpdate = 40;
      ring.record({ rafIntervalMs: 50, phases });
    }
    const stats = ring.frameStats();
    expect(stats.samples).toBe(10);
    // Sorted intervals are [10 x5, 50 x5]: p95 (index 9) exposes the debt
    // while the median still sits on the cheap frames.
    expect(stats.p95Ms).toBe(50);
    expect(stats.fpsAvg).toBeLessThan(1000 / 10);
    // Render-submit attribution alone stays cheap: the whole frame owns the debt.
    expect(ring.phaseStats("renderSubmit").p95Ms).toBe(4);
    expect(ring.phaseStats("worldUpdate").p95Ms).toBe(40);
  });

  it("computes percentiles, average FPS, and long/severe counts", () => {
    const ring = new WholeFrameRing(16);
    for (let ms = 10; ms <= 100; ms += 10) ring.record(sample(ms));
    const stats = ring.frameStats();
    expect(stats.samples).toBe(10);
    expect(stats.p50Ms).toBe(50);
    expect(stats.p95Ms).toBe(100);
    expect(stats.p99Ms).toBe(100);
    expect(stats.fpsAvg).toBeCloseTo(1000 / 55, 9);
    expect(stats.longFrames).toBe(5); // 60..100 strictly above 50
    expect(stats.severeStalls).toBe(0); // 100 is not strictly above 100
    ring.record(sample(101));
    expect(ring.frameStats().severeStalls).toBe(1);
  });

  it("never grows beyond capacity and overwrites the oldest samples", () => {
    const ring = new WholeFrameRing(4);
    for (const ms of [10, 20, 30, 40, 50]) ring.record(sample(ms));
    expect(ring.samples).toBe(4);
    expect(ring.frameStats().p50Ms).toBe(30);
    for (let i = 0; i < 50; i++) ring.record(sample(12));
    expect(ring.samples).toBe(4);
    expect(ring.frameStats().p50Ms).toBe(12);
  });

  it("recordInterval stores zeroed phases for the boundary hook", () => {
    const ring = new WholeFrameRing(8);
    ring.recordInterval(16.7);
    expect(ring.samples).toBe(1);
    expect(ring.frameStats().p50Ms).toBe(16.7);
    const phases = ring.phaseStats("worldUpdate");
    expect(phases.totalMs).toBe(0);
    expect(() => ring.recordInterval(-2)).toThrow(/rafIntervalMs/);
  });

  it("rollingMinFps covers the trailing window and returns 0 when empty", () => {
    const ring = new WholeFrameRing(600);
    expect(ring.rollingMinFps()).toBe(0);
    // 600 frames at 16.67 ms cover ~10 s; one 100 ms stall inside.
    for (let i = 0; i < 599; i++) ring.record(sample(16.67));
    ring.record(sample(100));
    expect(ring.rollingMinFps(10_000)).toBeCloseTo(10, 9);
    // A window narrower than the stall tail sees only healthy frames.
    expect(ring.rollingMinFps(50)).toBeCloseTo(10, 9);
    expect(() => ring.rollingMinFps(0)).toThrow(/windowMs/);
  });

  it("longFrameFraction is zero when empty and exact otherwise", () => {
    const ring = new WholeFrameRing(8);
    expect(ring.longFrameFraction()).toBe(0);
    ring.record(sample(10));
    ring.record(sample(60));
    expect(ring.longFrameFraction()).toBe(0.5);
  });

  it("rejects unknown phases", () => {
    const ring = new WholeFrameRing(4);
    expect(() => ring.phaseStats("bogus" as never)).toThrow(/unknown phase/);
  });

  it("reset clears retained samples", () => {
    const ring = new WholeFrameRing(4);
    ring.record(sample(30));
    ring.reset();
    expect(ring.samples).toBe(0);
    expect(ring.frameStats().fpsAvg).toBe(0);
  });
});

describe("PhaseTimer", () => {
  it("attributes phase durations with a scripted clock", () => {
    let t = 0;
    const timer = new PhaseTimer(() => t);
    timer.begin("worldUpdate");
    t += 7;
    timer.end();
    timer.begin("renderSubmit");
    t += 3;
    timer.end();
    const finished = timer.finishFrame(16);
    expect(finished.rafIntervalMs).toBe(16);
    expect(finished.phases.worldUpdate).toBe(7);
    expect(finished.phases.renderSubmit).toBe(3);
    expect(finished.phases.generation).toBe(0);
    // Totals reset after finishFrame.
    const next = timer.finishFrame(16);
    expect(next.phases.worldUpdate).toBe(0);
  });

  it("disabled timing never reads the clock (negligible overhead)", () => {
    let reads = 0;
    const timer = new PhaseTimer(() => {
      reads += 1;
      return reads;
    }, false);
    expect(timer.isEnabled).toBe(false);
    timer.begin("worldUpdate");
    timer.end();
    const finished = timer.finishFrame(16);
    expect(reads).toBe(0);
    expect(finished.phases.worldUpdate).toBe(0);
    timer.setEnabled(true);
    expect(timer.isEnabled).toBe(true);
    timer.begin("worldUpdate");
    timer.end();
    expect(reads).toBe(2);
  });

  it("discards an open phase when disabled mid-phase", () => {
    let t = 0;
    const timer = new PhaseTimer(() => t);
    timer.begin("lighting");
    t += 5;
    timer.setEnabled(false);
    const finished = timer.finishFrame(16);
    expect(finished.phases.lighting).toBe(0);
  });

  it("fails closed on misuse", () => {
    const t = 0;
    const timer = new PhaseTimer(() => t);
    expect(() => timer.end()).toThrow(/end without an open phase/);
    expect(() => timer.begin("bogus" as never)).toThrow(/unknown phase/);
    timer.begin("upload");
    expect(() => timer.begin("lighting")).toThrow(/while upload is open/);
    expect(() => timer.finishFrame(16)).toThrow(/still open/);
    timer.end();
    expect(() => timer.finishFrame(-1)).toThrow(/rafIntervalMs/);
  });

  it("covers every normative phase", () => {
    expect(WHOLE_FRAME_PHASES.length).toBe(11);
    const zeroed = zeroPhases();
    for (const phase of WHOLE_FRAME_PHASES) {
      expect(zeroed[phase]).toBe(0);
    }
  });
});
