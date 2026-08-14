import { describe, it, expect } from 'vitest';
import { SimulationClock, TICK_MS } from '../../src/engine/SimulationClock';

describe('SimulationClock', () => {
  it('emits exactly whole ticks and accumulates the remainder', () => {
    const clock = new SimulationClock();
    expect(clock.update(0)).toBe(0); // anchor
    expect(clock.update(50)).toBe(1);
    expect(clock.update(100)).toBe(1); // +50ms
    expect(clock.update(125)).toBe(0); // +25ms (accumulates)
    expect(clock.accumulatorMs).toBe(25);
    expect(clock.update(175)).toBe(1); // +50ms -> total 75ms -> 1 tick, 25ms remainder
    expect(clock.accumulatorMs).toBe(25);
    expect(clock.totalTicks).toBe(3);
    expect(clock.totalMs).toBe(150);
  });

  it('is frame-rate independent: equal elapsed time yields equal ticks', () => {
    const run = (frames: number[]): number => {
      const clock = new SimulationClock();
      let t = 0;
      let sum = 0;
      clock.update(t); // anchor
      for (const step of frames) {
        t += step;
        sum += clock.update(t);
      }
      expect(clock.totalMs).toBe(sum * TICK_MS);
      return sum;
    };

    expect(run(Array(10).fill(50))).toBe(10);
    expect(run(Array(5).fill(100))).toBe(10);
    expect(run(Array(4).fill(125))).toBe(10);
  });

  it('bounds catch-up after a long stall and caps the accumulator', () => {
    const clock = new SimulationClock({ maxTicksPerFrame: 10 });
    expect(clock.update(0)).toBe(0);
    expect(clock.update(5000)).toBe(10);
    expect(clock.totalTicks).toBe(10);
    expect(clock.accumulatorMs).toBeLessThan(TICK_MS);
    // Next frame starts fresh below one tick.
    expect(clock.update(5050)).toBe(1);
  });

  it('is safe against backward time', () => {
    const clock = new SimulationClock();
    expect(clock.update(1000)).toBe(0);
    expect(clock.update(500)).toBe(0); // backward: clamped
    expect(clock.update(1050)).toBe(1); // 50ms after the anchor
    expect(clock.totalTicks).toBe(1);
  });

  it('anchors on the first update and after reset', () => {
    const clock = new SimulationClock();
    expect(clock.update(12345)).toBe(0);
    expect(clock.totalTicks).toBe(0);
    expect(clock.isRunning).toBe(true);

    clock.reset();
    expect(clock.isRunning).toBe(false);
    expect(clock.update(9999)).toBe(0);
    expect(clock.totalTicks).toBe(0);
    expect(clock.totalMs).toBe(0);
  });

  it('ignores non-finite timestamps', () => {
    const clock = new SimulationClock();
    expect(clock.update(0)).toBe(0); // anchor
    expect(clock.update(NaN)).toBe(0);
    expect(clock.update(Infinity)).toBe(0);
    expect(clock.totalTicks).toBe(0);
    expect(clock.update(50)).toBe(1); // still works after garbage input
  });
});
