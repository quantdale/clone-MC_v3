import { describe, it, expect } from 'vitest';
import {
  FrameWorkBudgetScheduler,
  FRAME_TASK_CLASSES,
} from '../../src/rendering/RenderBudget';

function scheduler(overrides: Partial<Record<string, number>> = {}): FrameWorkBudgetScheduler {
  return new FrameWorkBudgetScheduler({
    generateMs: 4,
    meshUploadMs: 3,
    lightMs: 2,
    unloadMs: 1,
    ...overrides,
  });
}

describe('FrameWorkBudgetScheduler', () => {
  it('beginFrame resets per-class consumption but keeps EMA history', () => {
    const s = scheduler();
    s.beginFrame();
    expect(s.tryAcquire('generate', 4)).toBe(true);
    s.recordActual('generate', 2);
    expect(s.summary().classes.generate.usedMs).toBe(4);
    s.beginFrame();
    const gen = s.summary().classes.generate;
    expect(gen.usedMs).toBe(0);
    expect(gen.remainingMs).toBe(4);
    expect(gen.emaMs).toBe(2); // EMA persists across frames
  });

  it('tryAcquire reserves budget and remaining() shrinks accordingly', () => {
    const s = scheduler();
    s.beginFrame();
    expect(s.tryAcquire('generate', 1.5)).toBe(true);
    expect(s.remaining('generate')).toBeCloseTo(2.5, 12);
    expect(s.tryAcquire('generate', 1)).toBe(true);
    expect(s.remaining('generate')).toBeCloseTo(1.5, 12);
    expect(s.summary().classes.generate.usedMs).toBeCloseTo(2.5, 12);
  });

  it('rejects dispatch once the class budget is exhausted and reserves nothing on rejection', () => {
    const s = scheduler();
    s.beginFrame();
    expect(s.tryAcquire('unload', 0.5)).toBe(true);
    expect(s.tryAcquire('unload', 0.5)).toBe(true); // exactly exhausts
    expect(s.remaining('unload')).toBe(0);
    expect(s.tryAcquire('unload', 0.5)).toBe(false);
    expect(s.summary().classes.unload.usedMs).toBeCloseTo(1, 12); // nothing extra reserved
    // The epsilon slack allows a cost just within remaining + 0.01ms.
    const t = scheduler({ unloadMs: 0.005 });
    t.beginFrame();
    expect(t.tryAcquire('unload', 0.01)).toBe(true); // 0.01 <= 0.005 + 0.01
  });

  it('uses the class EMA as the default estimate when none is given', () => {
    const s = scheduler({ lightMs: 3 });
    s.recordActual('light', 1); // seeds EMA
    s.beginFrame();
    expect(s.tryAcquire('light')).toBe(true);
    expect(s.summary().classes.light.usedMs).toBeCloseTo(1, 12);
    // With no history at all, a missing estimate contributes zero cost.
    const fresh = scheduler();
    fresh.beginFrame();
    expect(fresh.tryAcquire('mesh-upload')).toBe(true);
    expect(fresh.summary().classes['mesh-upload'].usedMs).toBe(0);
  });

  it('throws RangeError on invalid costs without touching state', () => {
    const s = scheduler();
    s.beginFrame();
    for (const bad of [-0.5, NaN, Infinity]) {
      expect(() => s.tryAcquire('generate', bad)).toThrow(RangeError);
    }
    expect(s.summary().classes.generate.usedMs).toBe(0);
  });

  it('recordActual applies the documented EMA math (alpha = 0.25) with seed-from-zero behavior', () => {
    const s = scheduler();
    // First sample seeds directly.
    s.recordActual('generate', 8);
    expect(s.emaMs('generate')).toBe(8);
    // Subsequent samples blend: ema = ema * 0.75 + value * 0.25.
    s.recordActual('generate', 4);
    expect(s.emaMs('generate')).toBeCloseTo(8 * 0.75 + 4 * 0.25, 12); // 7
    s.recordActual('generate', 0);
    expect(s.emaMs('generate')).toBeCloseTo(7 * 0.75, 12); // 5.25 — decays toward 0
    for (const bad of [-1, NaN, Infinity]) {
      expect(() => s.recordActual('light', bad)).toThrow(RangeError);
    }
  });

  it('summary() reports all classes in shape with exhausted flag semantics', () => {
    const s = scheduler();
    s.beginFrame();
    let sum = s.summary();
    expect(Object.keys(sum.classes).sort()).toEqual([...FRAME_TASK_CLASSES].sort());
    expect(sum.exhausted).toBe(false); // every class has full remaining budget
    // Exhaust every class to its limit.
    expect(s.tryAcquire('generate', 4)).toBe(true);
    expect(s.tryAcquire('mesh-upload', 3)).toBe(true);
    expect(s.tryAcquire('light', 2)).toBe(true);
    expect(s.tryAcquire('unload', 1)).toBe(true);
    sum = s.summary();
    expect(sum.exhausted).toBe(true);
    for (const cls of FRAME_TASK_CLASSES) {
      expect(sum.classes[cls].remainingMs).toBeLessThan(0.01);
      expect(sum.classes[cls].usedMs).toBe(sum.classes[cls].budgetMs);
    }
  });
});
