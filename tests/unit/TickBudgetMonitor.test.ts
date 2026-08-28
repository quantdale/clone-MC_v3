import { describe, it, expect } from 'vitest';
import { WorldTickProcess, type TickSystem } from '../../src/simulation/WorldTickProcess';
import {
  DEFAULT_TICK_BUDGET,
  validateTickBudgetConfig,
  evaluateTickBudget,
  TickBudgetMonitor,
  wrapSystemWithBudget,
} from '../../src/simulation/TickBudgetMonitor';
import {
  DEFAULT_RENDER_BUDGET,
  evaluateRenderBudget,
  type RenderMetrics,
} from '../../src/rendering/RenderBudget';
import { RenderPerformanceMonitor } from '../../src/rendering/RenderPerformanceMonitor';

function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

function metrics(overrides: Partial<RenderMetrics> = {}): RenderMetrics {
  return {
    drawCalls: 100,
    meshBuildMillis: 2,
    frameTimeMillis: 10,
    geometryMemoryBytes: 1024,
    renderDistanceChunks: 8,
    ...overrides,
  };
}

describe('validateTickBudgetConfig', () => {
  it('accepts a valid config', () => {
    expect(validateTickBudgetConfig(DEFAULT_TICK_BUDGET)).toEqual(DEFAULT_TICK_BUDGET);
  });

  it('rejects invalid maxTickMillis values naming the field', () => {
    for (const bad of [0, -1, NaN, Infinity, '5', null, undefined]) {
      expect(() => validateTickBudgetConfig({ maxTickMillis: bad } as never)).toThrow(/maxTickMillis/);
    }
  });

  it('rejects non-object input', () => {
    expect(() => validateTickBudgetConfig(undefined)).toThrow(/object/i);
  });
});

describe('evaluateTickBudget', () => {
  it('is within budget when the last tick is at or below the budget', () => {
    const entry = evaluateTickBudget(DEFAULT_TICK_BUDGET, { lastTickMillis: 4 });
    expect(entry.withinBudget).toBe(true);
    expect(entry.dimension).toBe('tick');
    expect(entry.budget).toBe(DEFAULT_TICK_BUDGET.maxTickMillis);
    expect(entry.actual).toBe(4);
  });

  it('flags an overrun and malformed actuals', () => {
    expect(evaluateTickBudget(DEFAULT_TICK_BUDGET, { lastTickMillis: 20 }).withinBudget).toBe(false);
    for (const bad of [-1, NaN, Infinity] as const) {
      expect(evaluateTickBudget(DEFAULT_TICK_BUDGET, { lastTickMillis: bad }).withinBudget).toBe(false);
    }
  });
});

describe('TickBudgetMonitor', () => {
  function slowSystem(clock: ReturnType<typeof fakeClock>, ms = 10): TickSystem {
    return { tick: () => clock.advance(ms) };
  }

  it('records an overrun without throwing when the wrapped tick exceeds the budget', () => {
    const clock = fakeClock();
    const monitor = new TickBudgetMonitor(slowSystem(clock, 10), { now: clock.now, config: DEFAULT_TICK_BUDGET });
    expect(() => monitor.tick(1)).not.toThrow();
    expect(monitor.lastTickMillis).toBe(10);
    expect(monitor.overruns).toBe(1);
    expect(monitor.lastOverrunMillis).toBe(10);
    expect(monitor.sample().withinBudget).toBe(false);
  });

  it('records no overrun for a within-budget tick', () => {
    const clock = fakeClock();
    const monitor = new TickBudgetMonitor(slowSystem(clock, 2), { now: clock.now, config: DEFAULT_TICK_BUDGET });
    monitor.tick(1);
    expect(monitor.overruns).toBe(0);
    expect(monitor.sample().withinBudget).toBe(true);
  });

  it('propagates a throwing system (per 224 semantics) instead of masking it', () => {
    const clock = fakeClock();
    const throwing: TickSystem = {
      tick: () => {
        throw new Error('boom');
      },
    };
    const monitor = new TickBudgetMonitor(throwing, { now: clock.now, config: DEFAULT_TICK_BUDGET });
    expect(() => monitor.tick(1)).toThrow(/boom/);
  });

  it('integrates inside a WorldTickProcess: overrun recorded without stopping the process', () => {
    const clock = fakeClock();
    const monitor = new TickBudgetMonitor(slowSystem(clock, 10), { now: clock.now, config: DEFAULT_TICK_BUDGET });
    const process = new WorldTickProcess({ systems: [monitor] });

    const ticks = process.step(1);

    expect(ticks).toBe(1);
    expect(process.tick).toBe(1);
    expect(process.isStopped).toBe(false);
    expect(monitor.overruns).toBe(1);
    expect(monitor.sample().withinBudget).toBe(false);
  });

  it('is deterministic for identical fake clocks and call sequences', () => {
    const run = () => {
      const clock = fakeClock();
      const monitor = new TickBudgetMonitor(slowSystem(clock, 6), { now: clock.now, config: DEFAULT_TICK_BUDGET });
      monitor.tick(1);
      monitor.tick(2);
      return monitor.sample();
    };
    expect(run()).toEqual(run());
  });
});

describe('wrapSystemWithBudget (224 alignment helper)', () => {
  it('wraps a system in a TickBudgetMonitor that records overruns without throwing', () => {
    const clock = fakeClock();
    const system: TickSystem = { tick: () => clock.advance(10) };
    const monitor = wrapSystemWithBudget(system, { now: clock.now, config: DEFAULT_TICK_BUDGET });

    expect(monitor).toBeInstanceOf(TickBudgetMonitor);
    expect(() => monitor.tick(0)).not.toThrow(); // overrun recorded, never thrown
    expect(monitor.lastTickMillis).toBe(10);
    expect(monitor.overruns).toBe(1);
    expect(monitor.lastOverrunMillis).toBe(10);
    expect(monitor.sample().withinBudget).toBe(false);

    monitor.tick(1);
    expect(monitor.overruns).toBe(2); // keeps counting across ticks
  });

  it('rejects values that are not TickSystem-shaped', () => {
    const clock = fakeClock();
    const opts = { now: clock.now, config: DEFAULT_TICK_BUDGET };
    for (const bad of [null, undefined, {}, { tick: 'not-a-function' }, 42]) {
      expect(() => wrapSystemWithBudget(bad as never, opts)).toThrow(/tick/);
    }
  });

  it('reset() clears timing and overrun counters but keeps the budget', () => {
    const clock = fakeClock();
    const monitor = wrapSystemWithBudget({ tick: () => clock.advance(20) }, {
      now: clock.now,
      config: DEFAULT_TICK_BUDGET,
    });
    monitor.tick(0);
    expect(monitor.overruns).toBe(1);
    expect(monitor.sample().withinBudget).toBe(false);

    monitor.reset();
    expect(monitor.lastTickMillis).toBe(0);
    expect(monitor.overruns).toBe(0);
    expect(monitor.lastOverrunMillis).toBe(0);
    expect(monitor.maxTickMillis).toBe(DEFAULT_TICK_BUDGET.maxTickMillis); // budget kept
    expect(monitor.sample()).toEqual({
      lastTickMillis: 0,
      overruns: 0,
      lastOverrunMillis: 0,
      withinBudget: true, // zero elapsed counts as within budget after reset
    });

    // Still fully functional after reset.
    monitor.tick(1);
    expect(monitor.overruns).toBe(1);
  });
});

describe('frame budget under saturation (reuses 075)', () => {
  it('reports a violation when a saturated frame exceeds its budget', () => {
    const clock = fakeClock();
    const monitor = new RenderPerformanceMonitor(clock.now);
    monitor.beginFrame();
    monitor.recordDrawCalls(99999);
    monitor.beginMeshBuild();
    clock.advance(5);
    monitor.endMeshBuild();
    clock.advance(100);
    monitor.endFrame();

    const report = monitor.evaluate(DEFAULT_RENDER_BUDGET);
    expect(report.withinBudget).toBe(false);
    expect(report.entries.find((e) => e.dimension === 'maxDrawCalls')!.withinBudget).toBe(false);
    expect(report.entries.find((e) => e.dimension === 'maxFrameTimeMillis')!.withinBudget).toBe(false);
  });

  it('reports every frame dimension within budget when the frame is well under', () => {
    const clock = fakeClock();
    const monitor = new RenderPerformanceMonitor(clock.now);
    monitor.beginFrame();
    monitor.recordDrawCalls(10);
    monitor.setGeometryMemory(64 * 1024);
    monitor.setRenderDistanceChunks(6);
    clock.advance(8);
    monitor.endFrame();

    const report = monitor.evaluate(DEFAULT_RENDER_BUDGET);
    expect(report.withinBudget).toBe(true);
    expect(report.entries.every((e) => e.withinBudget)).toBe(true);
  });

  it('treats a malformed actual (negative/non-finite) as a violation via 075 evaluation', () => {
    for (const bad of [-1, NaN, Infinity] as const) {
      const report = evaluateRenderBudget(DEFAULT_RENDER_BUDGET, metrics({ drawCalls: bad }));
      expect(report.withinBudget).toBe(false);
      expect(report.entries.find((e) => e.dimension === 'maxDrawCalls')!.withinBudget).toBe(false);
    }
  });

  it('keeps frame and tick verdicts independent', () => {
    // Frame is well within budget.
    const clock = fakeClock();
    const frameMonitor = new RenderPerformanceMonitor(clock.now);
    frameMonitor.beginFrame();
    frameMonitor.recordDrawCalls(10);
    clock.advance(8);
    frameMonitor.endFrame();
    const frameReport = frameMonitor.evaluate(DEFAULT_RENDER_BUDGET);
    expect(frameReport.withinBudget).toBe(true);

    // The same clock, but a tick that overruns its (much tighter) budget.
    const slow: TickSystem = { tick: () => clock.advance(20) };
    const tickMonitor = new TickBudgetMonitor(slow, { now: clock.now, config: DEFAULT_TICK_BUDGET });
    tickMonitor.tick(1);
    const tickSample = tickMonitor.sample();

    expect(frameReport.withinBudget).toBe(true);
    expect(tickSample.withinBudget).toBe(false);
    expect(frameReport.entries.find((e) => e.dimension === 'maxDrawCalls')!.withinBudget).toBe(true);
    expect(evaluateTickBudget(DEFAULT_TICK_BUDGET, { lastTickMillis: tickSample.lastTickMillis }).withinBudget).toBe(false);
  });
});
