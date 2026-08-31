import { describe, it, expect } from 'vitest';
import { DynamicResolutionController } from '../../src/rendering/DynamicResolution';

describe('VisualRegressionDeterminism (255 visual freeze)', () => {
  it('DynamicResolution.setScaleForTest clamps within tier bounds and clears dwell', () => {
    const ctrl = new DynamicResolutionController('medium');
    expect(ctrl.getScale()).toBe(1);
    ctrl.setScaleForTest(0.1);
    expect(ctrl.getScale()).toBe(0.625);
    ctrl.setScaleForTest(10);
    expect(ctrl.getScale()).toBe(1);
    ctrl.setScaleForTest(0.8);
    expect(ctrl.getScale()).toBe(0.8);
    // dwell cleared: next overload should require full dwell again
    const first = ctrl.update(1000, { p95FrameTimeMillis: 100 });
    expect(first.reason).toBe('dwell');
    const second = ctrl.update(1600, { p95FrameTimeMillis: 100 });
    expect(second.changed).toBe(true);
    expect(second.scale).toBeCloseTo(0.7, 10);
  });

  it('frozen controller would stay at max scale (simulated via setScaleForTest + no update)', () => {
    const ctrl = new DynamicResolutionController('medium');
    ctrl.setScaleForTest(1);
    expect(ctrl.getScale()).toBe(1);
    // simulate frozen by not calling update with overload; scale stays
    expect(ctrl.getScale()).toBe(1);
  });

  it('controller handles invalid metrics without changing scale', () => {
    const ctrl = new DynamicResolutionController('medium');
    const before = ctrl.getScale();
    const res = ctrl.update(1000, { p95FrameTimeMillis: NaN } as unknown as { p95FrameTimeMillis: number });
    expect(res.valid).toBe(false);
    expect(ctrl.getScale()).toBe(before);
  });
});
