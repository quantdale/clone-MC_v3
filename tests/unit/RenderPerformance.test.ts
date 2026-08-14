import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RENDER_BUDGET,
  evaluateRenderBudget,
  validateRenderBudgetConfig,
  type RenderBudgetConfig,
  type RenderMetrics,
} from '../../src/rendering/RenderBudget';
import { RenderPerformanceMonitor } from '../../src/rendering/RenderPerformanceMonitor';

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

describe('validateRenderBudgetConfig', () => {
  it('accepts a valid config', () => {
    expect(validateRenderBudgetConfig(DEFAULT_RENDER_BUDGET)).toEqual(DEFAULT_RENDER_BUDGET);
  });

  it('rejects invalid values naming the field', () => {
    for (const field of [
      'maxDrawCalls',
      'maxMeshBuildMillis',
      'maxFrameTimeMillis',
      'maxGeometryMemoryBytes',
      'maxRenderDistanceChunks',
    ] as const) {
      for (const bad of [0, -1, NaN, Infinity, '5', null, undefined]) {
        expect(() =>
          validateRenderBudgetConfig({ ...DEFAULT_RENDER_BUDGET, [field]: bad } as never),
        ).toThrow(new RegExp(field));
      }
    }
  });

  it('rejects non-object input', () => {
    expect(() => validateRenderBudgetConfig(null)).toThrow(/object/i);
  });
});

describe('evaluateRenderBudget', () => {
  it('reports every dimension within budget when all actuals are at or below', () => {
    const report = evaluateRenderBudget(DEFAULT_RENDER_BUDGET, metrics());
    expect(report.withinBudget).toBe(true);
    expect(report.entries).toHaveLength(5);
    expect(report.entries.every((e) => e.withinBudget)).toBe(true);
    expect(report.entries.map((e) => e.dimension)).toEqual([
      'maxDrawCalls',
      'maxMeshBuildMillis',
      'maxFrameTimeMillis',
      'maxGeometryMemoryBytes',
      'maxRenderDistanceChunks',
    ]);
  });

  it('flags a single violation and fails the overall verdict', () => {
    const report = evaluateRenderBudget(DEFAULT_RENDER_BUDGET, metrics({ drawCalls: 99999 }));
    expect(report.withinBudget).toBe(false);
    const draw = report.entries.find((e) => e.dimension === 'maxDrawCalls')!;
    expect(draw.withinBudget).toBe(false);
    expect(draw.budget).toBe(DEFAULT_RENDER_BUDGET.maxDrawCalls);
    expect(draw.actual).toBe(99999);
    expect(report.entries.filter((e) => e.withinBudget)).toHaveLength(4);
  });

  it('treats boundary equality as within budget', () => {
    const report = evaluateRenderBudget(
      DEFAULT_RENDER_BUDGET,
      metrics({ frameTimeMillis: DEFAULT_RENDER_BUDGET.maxFrameTimeMillis }),
    );
    expect(report.entries.find((e) => e.dimension === 'maxFrameTimeMillis')!.withinBudget).toBe(true);
    expect(report.withinBudget).toBe(true);
  });

  it('treats malformed actuals (negative or non-finite) as violations', () => {
    for (const bad of [-1, NaN, Infinity] as const) {
      const report = evaluateRenderBudget(DEFAULT_RENDER_BUDGET, metrics({ meshBuildMillis: bad }));
      expect(report.withinBudget).toBe(false);
      expect(report.entries.find((e) => e.dimension === 'maxMeshBuildMillis')!.withinBudget).toBe(false);
    }
  });
});

describe('RenderPerformanceMonitor', () => {
  function fakeClock(): { now: () => number; advance: (ms: number) => void } {
    let t = 0;
    return {
      now: () => t,
      advance: (ms) => {
        t += ms;
      },
    };
  }

  it('measures frame time between beginFrame and endFrame', () => {
    const clock = fakeClock();
    const monitor = new RenderPerformanceMonitor(clock.now);
    expect(monitor.sample().frameTimeMillis).toBe(0); // no completed frame yet

    monitor.beginFrame();
    clock.advance(10);
    monitor.endFrame();
    expect(monitor.sample().frameTimeMillis).toBe(10);

    monitor.beginFrame();
    clock.advance(4);
    monitor.endFrame();
    expect(monitor.sample().frameTimeMillis).toBe(4); // last completed frame
  });

  it('resets per-frame accumulators at beginFrame', () => {
    const clock = fakeClock();
    const monitor = new RenderPerformanceMonitor(clock.now);
    monitor.beginFrame();
    monitor.recordDrawCalls(50);
    monitor.beginMeshBuild();
    clock.advance(3);
    monitor.endMeshBuild();
    monitor.endFrame();

    monitor.beginFrame();
    const sample = monitor.sample();
    expect(sample.drawCalls).toBe(0);
    expect(sample.meshBuildMillis).toBe(0);
    expect(sample.frameTimeMillis).toBe(3); // from the completed frame
  });

  it('accumulates mesh-build time across builds within a frame', () => {
    const clock = fakeClock();
    const monitor = new RenderPerformanceMonitor(clock.now);
    monitor.beginFrame();
    monitor.beginMeshBuild();
    clock.advance(2);
    monitor.endMeshBuild();
    monitor.beginMeshBuild();
    clock.advance(5);
    monitor.endMeshBuild();
    expect(monitor.sample().meshBuildMillis).toBe(7);
  });

  it('throws on unbalanced lifecycle calls', () => {
    const clock = fakeClock();
    const monitor = new RenderPerformanceMonitor(clock.now);
    expect(() => monitor.endFrame()).toThrow(/endFrame/);
    monitor.beginFrame();
    expect(() => monitor.endMeshBuild()).toThrow(/endMeshBuild/);
    monitor.beginMeshBuild();
    expect(() => monitor.beginMeshBuild()).toThrow(/beginMeshBuild/);
    monitor.endMeshBuild();
    monitor.endFrame();
    expect(() => monitor.beginMeshBuild()).toThrow(/outside a frame/);
  });

  it('validates recorded values and leaves state unchanged on rejection', () => {
    const clock = fakeClock();
    const monitor = new RenderPerformanceMonitor(clock.now);
    monitor.beginFrame();
    monitor.recordDrawCalls(10);

    expect(() => monitor.recordDrawCalls(-1)).toThrow(/non-negative integer/);
    expect(() => monitor.recordDrawCalls(2.5)).toThrow(/non-negative integer/);
    expect(() => monitor.setGeometryMemory(NaN)).toThrow(/non-negative integer/);
    expect(() => monitor.setRenderDistanceChunks(-3)).toThrow(/non-negative integer/);

    expect(monitor.sample().drawCalls).toBe(10);
    expect(monitor.sample().geometryMemoryBytes).toBe(0);
    expect(monitor.sample().renderDistanceChunks).toBe(0);
  });

  it('snapshots setters and evaluates against a budget config', () => {
    const clock = fakeClock();
    const monitor = new RenderPerformanceMonitor(clock.now);
    monitor.beginFrame();
    monitor.recordDrawCalls(1200);
    monitor.beginMeshBuild();
    clock.advance(5);
    monitor.endMeshBuild();
    monitor.setGeometryMemory(64 * 1024 * 1024);
    monitor.setRenderDistanceChunks(10);
    monitor.endFrame();

    const report = monitor.evaluate(DEFAULT_RENDER_BUDGET);
    expect(report.withinBudget).toBe(true); // all at or below the placeholder budgets

    const tight: RenderBudgetConfig = { ...DEFAULT_RENDER_BUDGET, maxDrawCalls: 1000 };
    const tightReport = monitor.evaluate(tight);
    expect(tightReport.withinBudget).toBe(false);
    expect(tightReport.entries.find((e) => e.dimension === 'maxDrawCalls')!.withinBudget).toBe(false);
  });

  it('is deterministic for identical scripted clocks', () => {
    const run = () => {
      const clock = fakeClock();
      const monitor = new RenderPerformanceMonitor(clock.now);
      monitor.beginFrame();
      monitor.recordDrawCalls(3);
      monitor.beginMeshBuild();
      clock.advance(1.5);
      monitor.endMeshBuild();
      clock.advance(5);
      monitor.endFrame();
      monitor.setGeometryMemory(7);
      monitor.setRenderDistanceChunks(4);
      return monitor.sample();
    };
    expect(run()).toEqual(run());
  });
});
