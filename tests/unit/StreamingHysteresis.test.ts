import { describe, expect, it } from 'vitest';
import {
  HysteresisLatch,
  isOutsideHysteresisRadius,
} from '../../src/world/StreamingHysteresis';

describe('Streaming hysteresis', () => {
  it('holds an at-most threshold inside its exit band', () => {
    const latch = new HysteresisLatch({
      direction: 'at-most',
      enterAt: 3,
      exitAt: 5,
    });

    expect(latch.update(3)).toBe(true);
    expect(latch.update(4)).toBe(true);
    expect(latch.update(5)).toBe(true);
    expect(latch.update(6)).toBe(false);
  });

  it('holds an at-least threshold inside its exit band', () => {
    const latch = new HysteresisLatch({
      direction: 'at-least',
      enterAt: 5,
      exitAt: 3,
    });

    expect(latch.update(5)).toBe(true);
    expect(latch.update(4)).toBe(true);
    expect(latch.update(3)).toBe(true);
    expect(latch.update(2)).toBe(false);
  });

  it('supports deterministic reset and initial state', () => {
    const latch = new HysteresisLatch({
      direction: 'at-most',
      enterAt: 1,
      exitAt: 2,
      initialActive: true,
    });

    expect(latch.isActive).toBe(true);
    latch.reset();
    expect(latch.isActive).toBe(false);
    expect(latch.update(1)).toBe(true);
    latch.reset(true);
    expect(latch.isActive).toBe(true);
  });

  it('rejects inverted, non-finite, and invalid threshold configuration', () => {
    expect(() => new HysteresisLatch({ direction: 'at-most', enterAt: 4, exitAt: 3 })).toThrow();
    expect(() => new HysteresisLatch({ direction: 'at-least', enterAt: 3, exitAt: 4 })).toThrow();
    expect(() => new HysteresisLatch({ direction: 'at-most', enterAt: Number.NaN, exitAt: 2 })).toThrow();
    expect(() => new HysteresisLatch({ direction: 'at-most', enterAt: 1, exitAt: 2 }).update(Infinity)).toThrow();
  });

  it('validates and applies the load/unload radius band', () => {
    expect(isOutsideHysteresisRadius(3, 2, 1)).toBe(false);
    expect(isOutsideHysteresisRadius(4, 2, 1)).toBe(true);
    expect(() => isOutsideHysteresisRadius(1, -1, 1)).toThrow();
    expect(() => isOutsideHysteresisRadius(1, 1, 1.5)).toThrow();
  });
});
