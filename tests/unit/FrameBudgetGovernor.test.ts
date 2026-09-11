import { describe, it, expect } from "vitest";
import {
  DEFAULT_GOVERNOR_CONFIG,
  FrameBudgetGovernor,
  validateFrameBudgetGovernorConfig,
  type GovernedClass,
} from "../../src/rendering/FrameBudgetGovernor";

const ALL_BUSY: Record<GovernedClass, boolean> = {
  generation: true,
  meshMain: true,
  lighting: true,
  upload: true,
  unload: true,
};

const ALL_IDLE: Record<GovernedClass, boolean> = {
  generation: false,
  meshMain: false,
  lighting: false,
  upload: false,
  unload: false,
};

describe("FrameBudgetGovernor config validation", () => {
  it("accepts the default config", () => {
    expect(validateFrameBudgetGovernorConfig(DEFAULT_GOVERNOR_CONFIG)).toEqual(DEFAULT_GOVERNOR_CONFIG);
  });

  it("rejects malformed configs naming the defect", () => {
    expect(() => validateFrameBudgetGovernorConfig(null)).toThrow(/must be an object/);
    expect(() => validateFrameBudgetGovernorConfig({ ...DEFAULT_GOVERNOR_CONFIG, targetFrameMs: -1 })).toThrow(
      /targetFrameMs/,
    );
    expect(() =>
      validateFrameBudgetGovernorConfig({ ...DEFAULT_GOVERNOR_CONFIG, renderReserveMs: 16.67 }),
    ).toThrow(/must be below targetFrameMs/);
    expect(() =>
      validateFrameBudgetGovernorConfig({
        ...DEFAULT_GOVERNOR_CONFIG,
        hardCapsMs: { ...DEFAULT_GOVERNOR_CONFIG.hardCapsMs, upload: 0 },
      }),
    ).toThrow(/hardCapsMs\.upload/);
    expect(() => validateFrameBudgetGovernorConfig({ ...DEFAULT_GOVERNOR_CONFIG, overloadCutback: 1 })).toThrow(
      /overloadCutback/,
    );
    expect(() =>
      validateFrameBudgetGovernorConfig({
        ...DEFAULT_GOVERNOR_CONFIG,
        starvationFloorMs: 100,
      }),
    ).toThrow(/starvationFloorMs/);
    expect(() => validateFrameBudgetGovernorConfig({ ...DEFAULT_GOVERNOR_CONFIG, historySize: 0 })).toThrow(
      /historySize/,
    );
  });
});

describe("FrameBudgetGovernor decisions", () => {
  it("grants full hard caps with no history and zeros for idle queues", () => {
    const governor = new FrameBudgetGovernor({
      ...DEFAULT_GOVERNOR_CONFIG,
      hardCapsMs: { generation: 2, meshMain: 2, lighting: 2, upload: 2, unload: 2 },
    });
    const decision = governor.decide(ALL_BUSY);
    expect(decision.overloaded).toBe(false);
    expect(decision.allowanceScale).toBe(1);
    // Caps total 10 ms within the 10.67 ms available background budget.
    for (const value of Object.values(decision.perClassMs)) {
      expect(value).toBe(2);
    }
    const idle = new FrameBudgetGovernor().decide(ALL_IDLE);
    for (const value of Object.values(idle.perClassMs)) {
      expect(value).toBe(0);
    }
    expect(idle.reservedRenderMs).toBe(DEFAULT_GOVERNOR_CONFIG.renderReserveMs);
    expect(idle.availableBackgroundMs).toBeCloseTo(
      DEFAULT_GOVERNOR_CONFIG.targetFrameMs - DEFAULT_GOVERNOR_CONFIG.renderReserveMs,
      9,
    );
  });

  it("caps a single over-budget queue at the shared available background budget", () => {
    const governor = new FrameBudgetGovernor();
    const decision = governor.decide({ ...ALL_IDLE, generation: true });
    // Generation cap 12 ms exceeds the 10.67 ms available: the shared budget
    // wins over the hard cap (caps remain maxima, never guaranteed spending).
    expect(decision.perClassMs.generation).toBeCloseTo(decision.availableBackgroundMs, 9);
    expect(decision.perClassMs.generation).toBeLessThan(DEFAULT_GOVERNOR_CONFIG.hardCapsMs.generation);
  });

  it("treats CONFIG budgets as hard maxima, not guaranteed spending", () => {
    const governor = new FrameBudgetGovernor();
    // Idle queues receive nothing even though caps are large.
    const idle = governor.decide(ALL_IDLE);
    for (const value of Object.values(idle.perClassMs)) {
      expect(value).toBe(0);
    }
    // Active allocations never exceed their hard cap.
    for (let i = 0; i < 30; i++) {
      governor.observe(8 + (i % 5));
      const decision = governor.decide(ALL_BUSY);
      for (const [cls, value] of Object.entries(decision.perClassMs) as [GovernedClass, number][]) {
        expect(value).toBeLessThanOrEqual(DEFAULT_GOVERNOR_CONFIG.hardCapsMs[cls]);
      }
    }
  });

  it("cuts background allowance quickly on overload and preserves the render reserve", () => {
    const governor = new FrameBudgetGovernor();
    for (let i = 0; i < 60; i++) governor.observe(30);
    const first = governor.decide(ALL_BUSY);
    expect(first.overloaded).toBe(true);
    expect(first.allowanceScale).toBeLessThan(1);
    // Reserve grows with measured excess: half of (30 - 16.67) above baseline.
    expect(first.reservedRenderMs).toBeGreaterThan(DEFAULT_GOVERNOR_CONFIG.renderReserveMs);
    const second = governor.decide(ALL_BUSY);
    expect(second.allowanceScale).toBeLessThan(first.allowanceScale);
    expect(second.perClassMs.generation).toBeLessThanOrEqual(first.perClassMs.generation);
  });

  it("recovers gradually toward full caps on healthy frames", () => {
    const governor = new FrameBudgetGovernor();
    for (let i = 0; i < 60; i++) governor.observe(40);
    const overloaded = governor.decide(ALL_BUSY);
    expect(overloaded.allowanceScale).toBeLessThan(1);
    let scale = overloaded.allowanceScale;
    for (let i = 0; i < 200 && scale < 1; i++) {
      governor.observe(8);
      scale = governor.decide(ALL_BUSY).allowanceScale;
    }
    expect(scale).toBe(1);
    const recovered = governor.decide(ALL_BUSY);
    expect(recovered.overloaded).toBe(false);
  });

  it("treats invalid telemetry as overload (fail-closed) exactly once", () => {
    const governor = new FrameBudgetGovernor();
    governor.observe(Number.NaN);
    const decision = governor.decide(ALL_BUSY);
    expect(decision.overloaded).toBe(true);
    expect(decision.allowanceScale).toBeLessThan(1);
    // The latch clears: healthy observations recover on subsequent decisions.
    for (let i = 0; i < 200 && governor.scale < 1; i++) {
      governor.observe(8);
      governor.decide(ALL_BUSY);
    }
    expect(governor.scale).toBe(1);
  });

  it("guarantees starvation floors for non-empty queues under contention", () => {
    const governor = new FrameBudgetGovernor({
      ...DEFAULT_GOVERNOR_CONFIG,
      hardCapsMs: { generation: 12, meshMain: 8, lighting: 4, upload: 3, unload: 2 },
    });
    for (let i = 0; i < 120; i++) governor.observe(50);
    const decision = governor.decide(ALL_BUSY);
    for (const [cls, value] of Object.entries(decision.perClassMs) as [GovernedClass, number][]) {
      expect(value).toBeGreaterThanOrEqual(Math.min(DEFAULT_GOVERNOR_CONFIG.starvationFloorMs, DEFAULT_GOVERNOR_CONFIG.hardCapsMs[cls]));
      expect(value).toBeGreaterThan(0);
    }
  });

  it("is deterministic across identical observation sequences", () => {
    const run = (): unknown[] => {
      const governor = new FrameBudgetGovernor();
      const out: unknown[] = [];
      const frames = [8, 12, 20, 30, 9, 16, 40, 8, 8, 25];
      for (const frame of frames) {
        governor.observe(frame);
        out.push(governor.decide(frame > 15 ? ALL_BUSY : { ...ALL_IDLE, upload: true }));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it("rejects non-boolean backlog flags", () => {
    const governor = new FrameBudgetGovernor();
    expect(() => governor.decide({ ...ALL_BUSY, upload: 1 as never })).toThrow(/nonEmpty\.upload must be a boolean/);
  });

  it("reset restores full allowance and clears history", () => {
    const governor = new FrameBudgetGovernor();
    for (let i = 0; i < 60; i++) governor.observe(50);
    governor.decide(ALL_BUSY);
    expect(governor.scale).toBeLessThan(1);
    governor.reset();
    expect(governor.scale).toBe(1);
    expect(governor.observations).toBe(0);
    expect(governor.decide(ALL_BUSY).overloaded).toBe(false);
  });
});
