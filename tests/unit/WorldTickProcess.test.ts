import { describe, it, expect } from "vitest";
import { SimulationClock } from "../../src/engine/SimulationClock";
import {
  WorldTickProcess,
  type TickSystem,
} from "../../src/simulation/WorldTickProcess";

/** Records the tick numbers it receives, in call order. */
class RecordingSystem implements TickSystem {
  ticks: number[] = [];
  tick(tick: number): void {
    this.ticks.push(tick);
  }
}

describe("construction and validation", () => {
  it("constructs with no options: zero systems, fresh clock, pristine state", () => {
    const p = new WorldTickProcess();
    expect(p.tick).toBe(0);
    expect(p.isStopped).toBe(false);
    expect(p.lastError).toBeNull();
    expect(p.isRunning).toBe(false);
  });

  it("rejects a non-array systems option", () => {
    expect(
      () =>
        new WorldTickProcess({ systems: "nope" as unknown as TickSystem[] }),
    ).toThrow("WorldTickProcess: systems must be an array");
  });

  it("rejects an entry without a callable tick, naming the index", () => {
    expect(
      () =>
        new WorldTickProcess({
          systems: [
            { tick: "nope" } as unknown as TickSystem,
            new RecordingSystem(),
          ],
        }),
    ).toThrow("WorldTickProcess: systems 0 must have a callable tick");
  });

  it("rejects a clock that does not satisfy the clock surface", () => {
    expect(
      () =>
        new WorldTickProcess({
          clock: { update: 42 } as unknown as SimulationClock,
        }),
    ).toThrow("WorldTickProcess: clock must provide callable update and reset");
    expect(
      () => new WorldTickProcess({ clock: {} as SimulationClock }),
    ).toThrow("WorldTickProcess: clock must provide callable update and reset");
  });
});

describe("update-driven ticking", () => {
  it("anchors on the first update, returning 0 without ticking", () => {
    const rec = new RecordingSystem();
    const p = new WorldTickProcess({ systems: [rec] });
    expect(p.update(1000)).toBe(0);
    expect(rec.ticks).toEqual([]);
    expect(p.isRunning).toBe(true);
  });

  it("runs exactly the emitted ticks in one call and returns the count", () => {
    const rec = new RecordingSystem();
    const p = new WorldTickProcess({ systems: [rec] });
    p.update(1000);
    expect(p.update(1000 + 5 * 50)).toBe(5);
    expect(rec.ticks).toEqual([1, 2, 3, 4, 5]);
    expect(p.tick).toBe(5);
  });

  it("calls systems once per tick in registration order", () => {
    const order: string[] = [];
    const a: TickSystem = { tick: (t) => order.push(`A${t}`) };
    const b: TickSystem = { tick: (t) => order.push(`B${t}`) };
    const p = new WorldTickProcess({ systems: [a, b] });
    p.update(1000);
    p.update(1100);
    expect(order).toEqual(["A1", "B1", "A2", "B2"]);
  });

  it("returns 0 without ticking on non-finite or backward timestamps", () => {
    const rec = new RecordingSystem();
    const p = new WorldTickProcess({ systems: [rec] });
    expect(p.update(Number.NaN)).toBe(0);
    expect(p.update(Number.POSITIVE_INFINITY)).toBe(0);
    p.update(1000);
    expect(p.update(900)).toBe(0);
    expect(rec.ticks).toEqual([]);
  });
});

describe("bounded catch-up", () => {
  it("caps the ticks per update at the clock cap and leaves no spiral", () => {
    const rec = new RecordingSystem();
    const clock = new SimulationClock({ maxTicksPerFrame: 2 });
    const p = new WorldTickProcess({ systems: [rec], clock });
    p.update(1000);
    expect(p.update(1500)).toBe(2);
    expect(rec.ticks).toEqual([1, 2]);
    expect(p.update(1550)).toBe(1);
    expect(rec.ticks).toEqual([1, 2, 3]);
  });
});

describe("stepping", () => {
  it("steps exactly the requested count with consecutive 1-based tick numbers", () => {
    const rec = new RecordingSystem();
    const p = new WorldTickProcess({ systems: [rec] });
    expect(p.step(3)).toBe(3);
    expect(rec.ticks).toEqual([1, 2, 3]);
    expect(p.tick).toBe(3);
  });

  it("defaults to one tick", () => {
    const rec = new RecordingSystem();
    const p = new WorldTickProcess({ systems: [rec] });
    expect(p.step()).toBe(1);
    expect(rec.ticks).toEqual([1]);
  });

  it("treats non-integer or non-positive counts as a no-op returning 0", () => {
    const rec = new RecordingSystem();
    const p = new WorldTickProcess({ systems: [rec] });
    expect(p.step(0)).toBe(0);
    expect(p.step(-2)).toBe(0);
    expect(p.step(2.5)).toBe(0);
    expect(rec.ticks).toEqual([]);
    expect(p.tick).toBe(0);
  });

  it("keeps tick numbers monotonic across interleaved step and update calls", () => {
    const rec = new RecordingSystem();
    const p = new WorldTickProcess({ systems: [rec] });
    p.step(2);
    p.update(1000);
    p.update(1050);
    p.step(1);
    expect(rec.ticks).toEqual([1, 2, 3, 4]);
  });
});

describe("counter, clock state, and reset", () => {
  it("reports completed ticks and resets everything to pristine state", () => {
    const rec = new RecordingSystem();
    const p = new WorldTickProcess({ systems: [rec] });
    p.step(3);
    expect(p.tick).toBe(3);
    expect(p.isRunning).toBe(false);
    p.update(1000);
    expect(p.isRunning).toBe(true);
    p.reset();
    expect(p.tick).toBe(0);
    expect(p.isRunning).toBe(false);
    expect(p.isStopped).toBe(false);
    expect(p.lastError).toBeNull();
    expect(p.step(2)).toBe(2);
    expect(rec.ticks).toEqual([1, 2, 3, 1, 2]);
  });

  it("re-anchors the clock after reset so the next update returns 0", () => {
    const rec = new RecordingSystem();
    const p = new WorldTickProcess({ systems: [rec] });
    p.update(1000);
    p.update(1050);
    expect(p.tick).toBe(1);
    p.reset();
    expect(p.update(1000)).toBe(0);
    expect(p.update(1050)).toBe(1);
    // Numbering restarts at 1 after reset.
    expect(rec.ticks).toEqual([1, 1]);
  });
});

describe("failure behavior", () => {
  it("stops on a mid-tick throw: failed tick uncounted, later systems skipped, error rethrown", () => {
    const a = new RecordingSystem();
    const c = new RecordingSystem();
    const b: TickSystem = {
      tick: (t) => {
        if (t === 2) throw new Error("boom");
      },
    };
    const p = new WorldTickProcess({ systems: [a, b, c] });
    expect(() => p.step(2)).toThrow("boom");
    expect(a.ticks).toEqual([1, 2]);
    expect(c.ticks).toEqual([1]);
    expect(p.tick).toBe(1);
    expect(p.isStopped).toBe(true);
    expect(p.lastError).toBeInstanceOf(Error);
    expect((p.lastError as Error).message).toBe("boom");
  });

  it("rethrows the same recorded error from every driving call until reset", () => {
    const a = new RecordingSystem();
    const b: TickSystem = {
      tick: (t) => {
        if (t === 1) throw new Error("boom");
      },
    };
    const p = new WorldTickProcess({ systems: [a, b] });
    expect(() => p.step(1)).toThrow("boom");
    expect(() => p.step(1)).toThrow("boom");
    expect(() => p.update(1234)).toThrow("boom");
    expect(p.tick).toBe(0);
    // System A ran before B threw during the failed tick; the tick is not counted.
    expect(a.ticks).toEqual([1]);
  });

  it("resumes ticking normally after reset clears the failure", () => {
    const a = new RecordingSystem();
    const b: TickSystem = {
      tick: (t) => {
        if (t === 2) throw new Error("boom");
      },
    };
    const p = new WorldTickProcess({ systems: [a, b] });
    expect(() => p.step(2)).toThrow("boom");
    p.reset();
    expect(p.isStopped).toBe(false);
    expect(p.lastError).toBeNull();
    expect(p.step(1)).toBe(1);
    expect(a.ticks).toEqual([1, 2, 1]);
  });

  it("treats a throwing clock like a system failure (stopped, recorded, rethrown)", () => {
    const badClock = {
      update: () => {
        throw new Error("clock exploded");
      },
      isRunning: false,
      reset: () => {},
    } as unknown as SimulationClock;
    const p = new WorldTickProcess({ clock: badClock });
    expect(() => p.update(1000)).toThrow("clock exploded");
    expect(p.isStopped).toBe(true);
    expect((p.lastError as Error).message).toBe("clock exploded");
    expect(() => p.step(1)).toThrow("clock exploded");
  });
});

describe("determinism", () => {
  it("identical systems with identical scripted schedules produce identical call sequences", () => {
    const run = (): { a: RecordingSystem; b: RecordingSystem } => {
      const a = new RecordingSystem();
      const b = new RecordingSystem();
      const p = new WorldTickProcess({ systems: [a, b] });
      p.update(1000);
      p.update(1050);
      p.update(1200);
      p.step(2);
      p.update(1300);
      return { a, b };
    };
    const first = run();
    const second = run();
    expect(second.a.ticks).toEqual(first.a.ticks);
    expect(second.b.ticks).toEqual(first.b.ticks);
    expect(first.a.ticks.length).toBeGreaterThan(0);
  });

  it("ticks an empty-systems process without error", () => {
    const p = new WorldTickProcess();
    expect(p.step(3)).toBe(3);
    expect(p.tick).toBe(3);
    p.update(1000);
    expect(p.update(1100)).toBe(2);
    expect(p.tick).toBe(5);
  });
});

// ── Per-system budget coverage (verification campaign) ──────────────────────

describe("WorldTickProcess — per-system budget", () => {
  it("wraps systems when perSystemBudget is configured and still ticks the inner bodies", () => {
    const a = new RecordingSystem();
    const b = new RecordingSystem();
    const now = 0;
    const p = new WorldTickProcess({
      systems: [a, b],
      perSystemBudget: { maxTickMillis: 8, now: () => now },
    });

    expect(p.systemsInOrder.length).toBe(2);
    expect(p.systemsInOrder[0]).not.toBe(a); // wrapped in TimedSystem
    expect(p.step(2)).toBe(2);
    expect(a.ticks).toEqual([1, 2]);
    expect(b.ticks).toEqual([1, 2]);
    expect(p.tick).toBe(2);

    // Zero elapsed time: no overruns, within budget, last tick millis measured as 0.
    expect(p.lastSystemTickMillis).toBe(0);
    expect(p.systemBudgetOverruns).toBe(0);
    expect(p.withinTickBudget).toBe(true);
  });

  it("rejects invalid maxTickMillis naming the field", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        () =>
          new WorldTickProcess({
            systems: [],
            perSystemBudget: { maxTickMillis: bad },
          }),
      ).toThrow(
        "perSystemBudget.maxTickMillis must be a positive finite number",
      );
    }
  });

  it("counts overruns against the injected clock and reports the slowest system", () => {
    const fast = { tick: () => {} };
    let now = 100;
    // First system consumes 1 ms of injected time; second consumes 10 ms.
    const first = {
      tick: () => {
        now += 1;
      },
    };
    const second = {
      tick: () => {
        now += 10;
      },
    };
    void fast;
    const p = new WorldTickProcess({
      systems: [first, second],
      perSystemBudget: { maxTickMillis: 4, now: () => now },
    });

    p.step(3);
    // Each tick: slowest system took 10 ms > 4 ms budget → one overrun per tick.
    expect(p.systemBudgetOverruns).toBe(3);
    expect(p.lastSystemTickMillis).toBe(10);
    expect(p.withinTickBudget).toBe(false);
  });

  it("boundary equality (elapsed == budget) is within budget and records no overrun", () => {
    let now = 0;
    const sys = {
      tick: () => {
        now += 5;
      },
    };
    const p = new WorldTickProcess({
      systems: [sys],
      perSystemBudget: { maxTickMillis: 5, now: () => now },
    });
    p.step(1);
    expect(p.lastSystemTickMillis).toBe(5);
    expect(p.systemBudgetOverruns).toBe(0);
    expect(p.withinTickBudget).toBe(true);
  });

  it("budget observables report their no-budget defaults", () => {
    const p = new WorldTickProcess({ systems: [new RecordingSystem()] });
    p.step(1);
    expect(p.lastSystemTickMillis).toBe(0);
    expect(p.systemBudgetOverruns).toBe(0);
    expect(p.withinTickBudget).toBe(true);
  });

  it("reset() clears timing counters along with the rest of the state", () => {
    let now = 0;
    const sys = {
      tick: () => {
        now += 10;
      },
    };
    const p = new WorldTickProcess({
      systems: [sys],
      perSystemBudget: { maxTickMillis: 1, now: () => now },
    });
    p.step(2);
    expect(p.systemBudgetOverruns).toBe(2);
    expect(p.tick).toBe(2);

    now = 0;
    p.reset();
    expect(p.tick).toBe(0);
    expect(p.isStopped).toBe(false);
    expect(p.lastSystemTickMillis).toBe(0);
    expect(p.systemBudgetOverruns).toBe(0);

    // Fresh numbering after reset.
    const recorder = new RecordingSystem();
    const q = new WorldTickProcess({ systems: [recorder] });
    q.reset();
    q.step(1);
    expect(recorder.ticks).toEqual([1]);
  });
});
