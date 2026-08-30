import { describe, expect, it } from 'vitest';
import {
  DynamicResolutionController,
  DEFAULT_DYNAMIC_RESOLUTION_CONFIG,
  validateDynamicResolutionConfig,
  type DynamicResolutionConfig,
} from '../../src/rendering/DynamicResolution';

function config(overrides: Partial<DynamicResolutionConfig['medium']> = {}): DynamicResolutionConfig {
  const tier = {
    ...DEFAULT_DYNAMIC_RESOLUTION_CONFIG.medium,
    downDwellMillis: 100,
    upDwellMillis: 200,
    ...overrides,
  };
  return { low: tier, medium: tier, high: tier };
}

describe('validateDynamicResolutionConfig', () => {
  it('accepts the shipped tier-bounded defaults', () => {
    expect(validateDynamicResolutionConfig(DEFAULT_DYNAMIC_RESOLUTION_CONFIG)).toBe(
      DEFAULT_DYNAMIC_RESOLUTION_CONFIG,
    );
  });

  it('rejects malformed bounds and threshold relationships', () => {
    expect(() => validateDynamicResolutionConfig(null)).toThrow(/object/);
    expect(() => validateDynamicResolutionConfig({ low: null, medium: {}, high: {} })).toThrow(/low/);
    expect(() =>
      validateDynamicResolutionConfig({
        ...DEFAULT_DYNAMIC_RESOLUTION_CONFIG,
        medium: { ...DEFAULT_DYNAMIC_RESOLUTION_CONFIG.medium, minScale: 1.1, maxScale: 1 },
      }),
    ).toThrow(/minScale/);
    expect(() =>
      validateDynamicResolutionConfig({
        ...DEFAULT_DYNAMIC_RESOLUTION_CONFIG,
        high: { ...DEFAULT_DYNAMIC_RESOLUTION_CONFIG.high, upThresholdMillis: 20 },
      }),
    ).toThrow(/upThresholdMillis/);
  });
});

describe('DynamicResolutionController', () => {
  it('steps down only after the overload dwell and never exceeds one configured step', () => {
    const controller = new DynamicResolutionController('medium', config({ step: 0.2, minScale: 0.5 }));
    expect(controller.getScale()).toBe(1);

    expect(controller.update(0, { p95FrameTimeMillis: 25 }).reason).toBe('dwell');
    expect(controller.update(99, { p95FrameTimeMillis: 25 }).changed).toBe(false);
    const first = controller.update(100, { p95FrameTimeMillis: 25 });
    expect(first).toMatchObject({ changed: true, scale: 0.8, reason: 'changed' });

    expect(controller.update(199, { p95FrameTimeMillis: 25 }).changed).toBe(false);
    expect(controller.update(200, { p95FrameTimeMillis: 25 }).scale).toBeCloseTo(0.6, 12);
    expect(controller.update(300, { p95FrameTimeMillis: 25 }).scale).toBe(0.5);
    expect(controller.update(400, { p95FrameTimeMillis: 25 }).reason).toBe('at-bound');
    expect(controller.getScale()).toBe(0.5);
  });

  it('recovers only after the longer recovery dwell and does not oscillate in the dead band', () => {
    const recoveryConfig = config({ initialScale: 0.5, minScale: 0.5 });
    const controller = new DynamicResolutionController('medium', recoveryConfig);
    expect(controller.update(0, { p95FrameTimeMillis: 10 }).changed).toBe(false);
    expect(controller.update(199, { p95FrameTimeMillis: 10 }).changed).toBe(false);
    expect(controller.update(200, { p95FrameTimeMillis: 10 })).toMatchObject({
      changed: true,
      scale: 0.6,
    });

    // A single overload sample begins a new down dwell but cannot immediately undo recovery.
    expect(controller.update(201, { p95FrameTimeMillis: 25 }).reason).toBe('dwell');
    expect(controller.getScale()).toBe(0.6);
    // A dead-band sample clears both directions and requires a fresh dwell.
    expect(controller.update(202, { p95FrameTimeMillis: 17 }).reason).toBe('deadband');
    expect(controller.update(301, { p95FrameTimeMillis: 10 }).reason).toBe('dwell');
    expect(controller.getScale()).toBe(0.6);
  });

  it('uses the slower valid GPU signal and retains scale on invalid metrics', () => {
    const controller = new DynamicResolutionController('medium', config());
    expect(controller.update(0, { p95FrameTimeMillis: 10, gpuFrameTimeMillis: 30 }).effectiveFrameTimeMillis).toBe(30);
    expect(controller.update(50, { p95FrameTimeMillis: NaN }).valid).toBe(false);
    expect(controller.update(60, { p95FrameTimeMillis: 10, gpuFrameTimeMillis: Infinity }).valid).toBe(false);
    expect(controller.state()).toMatchObject({ scale: 1, invalidMetricCount: 2 });
    expect(controller.update(100, { p95FrameTimeMillis: 10 }).reason).toBe('dwell');
    expect(controller.state().effectiveFrameTimeMillis).toBe(10);
  });

  it('resets dwell state at a tier boundary and clamps the existing scale', () => {
    const controller = new DynamicResolutionController('medium', config({ minScale: 0.4, maxScale: 1, initialScale: 1 }));
    expect(controller.update(0, { p95FrameTimeMillis: 25 }).reason).toBe('dwell');
    controller.setTier('low');
    expect(controller.state()).toMatchObject({ tier: 'low', scale: 1, direction: null });
    expect(controller.update(99, { p95FrameTimeMillis: 25 }).reason).toBe('dwell');

    const narrower: DynamicResolutionConfig = {
      low: { ...config().low, maxScale: 0.8, initialScale: 0.8 },
      medium: config().medium,
      high: config().high,
    };
    const clamped = new DynamicResolutionController('medium', narrower);
    clamped.setTier('low');
    expect(clamped.getScale()).toBe(0.8);
  });

  it('calculates deterministic physical drawing-buffer dimensions without changing camera semantics', () => {
    const controller = new DynamicResolutionController('medium', config({ initialScale: 0.75 }));
    expect(controller.bufferSize(1280, 720, 2)).toEqual({
      width: 1920,
      height: 1080,
      renderScale: 0.75,
    });
    expect(() => controller.bufferSize(0, 720, 1)).toThrow(RangeError);
    expect(() => controller.bufferSize(1280, 720, NaN)).toThrow(RangeError);
  });
});
