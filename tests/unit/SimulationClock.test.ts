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

  it('accounts discarded debt in whole ticks and milliseconds after bursts beyond the cap', () => {
    const clock = new SimulationClock({ maxTicksPerFrame: 4 });
    expect(clock.debtDiscardedTicks).toBe(0);
    expect(clock.debtDiscardedMs).toBe(0);

    clock.update(0); // anchor
    clock.update(450); // 9 ticks owed -> 4 emitted, 5 discarded
    expect(clock.totalTicks).toBe(4);
    expect(clock.debtDiscardedTicks).toBe(5);
    expect(clock.debtDiscardedMs).toBe(250);
    // The accumulator is left below one tick so the next frame starts clean.
    expect(clock.accumulatorMs).toBeLessThan(TICK_MS);
    expect(clock.accumulatorMs).toBeGreaterThanOrEqual(0);

    clock.update(650); // +200 ms -> exactly 4 more emitted, no new debt
    expect(clock.totalTicks).toBe(8);
    expect(clock.debtDiscardedTicks).toBe(5);
    expect(clock.debtDiscardedMs).toBe(250);

    // Simulated time only counts emitted ticks; discarded backlog is not retroactively applied.
    expect(clock.totalMs).toBe(clock.totalTicks * TICK_MS);
  });

  it('accumulates nothing while paused and re-anchors its lastTime on every paused update', () => {
    const clock = new SimulationClock();
    clock.update(0); // anchor
    clock.update(100); // 2 ticks
    expect(clock.totalTicks).toBe(2);

    clock.pause();
    expect(clock.isPaused).toBe(true);
    // Wall time keeps flowing through update (the anchor stays fresh) but nothing accumulates:
    for (const now of [200, 500, 10_000]) {
      expect(clock.update(now)).toBe(0);
    }
    expect(clock.accumulatorMs).toBe(0); // the 100 ms delta was dropped, not banked
    expect(clock.totalTicks).toBe(2);
    expect(clock.isRunning).toBe(true);

    clock.resume();
    expect(clock.isPaused).toBe(false);
    // lastTime was re-anchored at 10_000, so only the NEW delta counts on resume.
    expect(clock.update(10_050)).toBe(1);
    expect(clock.update(10_150)).toBe(2);
    expect(clock.totalTicks).toBe(5); // 2 pre-pause + 3 post-resume, no replay of the pause
    expect(clock.totalMs).toBe(5 * TICK_MS);
  });

  it('clears pause state and debt counters on reset', () => {
    const clock = new SimulationClock({ maxTicksPerFrame: 2 });
    clock.update(0);
    clock.update(500); // debt
    clock.pause();
    clock.reset();
    expect(clock.isPaused).toBe(false);
    expect(clock.debtDiscardedTicks).toBe(0);
    expect(clock.debtDiscardedMs).toBe(0);
    clock.update(1000); // fresh anchor after reset
    expect(clock.update(1100)).toBe(2);
    expect(clock.totalTicks).toBe(2);
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
