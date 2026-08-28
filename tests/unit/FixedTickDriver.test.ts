import { describe, it, expect } from 'vitest';
import { FixedTickDriver, type FixedTickFrameResult } from '../../src/engine/FixedTickDriver';

// NOTE on anchoring: the driver owns a synthetic monotonic time base fed by
// `advance(frameDtSeconds)`. The very first `advance` only ANCHORS the underlying
// SimulationClock (0 ticks); every later frame's delta produces whole 50 ms ticks.
// All expectations below account for that anchor frame explicitly.

function makeDriver(opts?: {
  tickRateHz?: number;
  maxCatchUpTicks?: number;
}): { driver: FixedTickDriver; ticks: number[] } {
  const ticks: number[] = [];
  const driver = new FixedTickDriver({
    tick: (i) => ticks.push(i),
    tickRateHz: opts?.tickRateHz,
    maxCatchUpTicks: opts?.maxCatchUpTicks,
  });
  return { driver, ticks };
}

describe('FixedTickDriver', () => {
  describe('deterministic 20 Hz tick emission', () => {
    it('anchors on the first frame, then emits exactly one tick per 50 ms frame', () => {
      const { driver, ticks } = makeDriver();
      const executed: number[] = [];
      for (let f = 0; f < 11; f++) {
        const r = driver.advance(0.05);
        executed.push(r.ticksExecuted);
        expect(r.debtDiscarded).toBe(0);
      }
      expect(executed).toEqual([0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
      expect(ticks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(driver.totalTicks).toBe(10);
      expect(driver.currentTickIndex).toBe(10);
      expect(driver.previousTickIndex).toBe(9);
      expect(driver.isRunning).toBe(true);
    });

    it('accumulates sub-tick frame deltas into exact whole ticks (25 ms input)', () => {
      const { driver, ticks } = makeDriver();
      // Anchor frame, then seven 25 ms deltas = 175 ms -> 3 ticks with 25 ms left over.
      let executed = 0;
      for (let f = 0; f < 8; f++) executed += driver.advance(0.025).ticksExecuted;
      expect(executed).toBe(3);
      expect(ticks).toEqual([0, 1, 2]);
      expect(driver.alpha).toBeCloseTo(0.5, 5);
    });

    it('is frame-rate independent: identical elapsed wall time yields identical tick totals', () => {
      const run = (frames: number[]): number => {
        const { driver } = makeDriver();
        let sum = 0;
        for (const dt of frames) sum += driver.advance(dt).ticksExecuted;
        return sum;
      };
      // Both schedules cover 250 ms after the anchor -> 5 ticks either way.
      expect(run(Array(6).fill(0.05))).toBe(5);
      expect(run(Array(11).fill(0.025))).toBe(5);
      expect(run(Array(26).fill(0.01))).toBe(5);
    });
  });

  describe('bounded catch-up', () => {
    it('caps ticks per frame and discards the excess debt', () => {
      const { driver } = makeDriver({ maxCatchUpTicks: 5 });
      driver.advance(0.05); // anchor
      const r = driver.advance(1.0); // 20 ticks owed, only 5 may run
      expect(r.ticksExecuted).toBe(5);
      expect(r.debtDiscarded).toBe(15);
      expect(driver.totalTicks).toBe(5);
      // Debt is dropped, not carried: the next normal frame emits exactly its own ticks.
      const r2 = driver.advance(0.05);
      expect(r2.ticksExecuted).toBe(1);
      expect(r2.debtDiscarded).toBe(0);
      expect(driver.totalTicks).toBe(6);
    });

    it('reports debtDiscarded per frame via a watermark (only new drops)', () => {
      const { driver } = makeDriver({ maxCatchUpTicks: 2 });
      driver.advance(0.05); // anchor
      expect(driver.advance(0.5).debtDiscarded).toBe(8); // 10 owed -> 2 run, 8 dropped
      const r = driver.advance(0.5); // another 10 owed -> 2 run, 8 more dropped
      expect(r.ticksExecuted).toBe(2);
      expect(r.debtDiscarded).toBe(8);
      expect(driver.totalTicks).toBe(4);
    });

    it('discards no debt when the burst fits exactly under the cap', () => {
      const { driver } = makeDriver({ maxCatchUpTicks: 5 });
      driver.advance(0.05); // anchor
      const r = driver.advance(0.25); // exactly 5 ticks owed
      expect(r.ticksExecuted).toBe(5);
      expect(r.debtDiscarded).toBe(0);
      expect(driver.alpha).toBe(0);
    });

    it('honors custom tick rates deterministically (10 Hz)', () => {
      const { driver } = makeDriver({ tickRateHz: 10, maxCatchUpTicks: 3 });
      // Interval is exactly 100 ms; 250 ms deltas keep expectations float-exact.
      expect(driver.advance(0.25).ticksExecuted).toBe(0); // anchor
      const r = driver.advance(0.25); // 250 ms -> 2 ticks, 50 ms banked
      expect(r.ticksExecuted).toBe(2);
      expect(driver.alpha).toBeCloseTo(0.5, 5);
      const burst = driver.advance(1.0); // +1000 ms on top of 50 ms -> 10 ticks owed, cap 3
      expect(burst.ticksExecuted).toBe(3);
      expect(burst.debtDiscarded).toBe(7);
      expect(driver.totalTicks).toBe(5);
    });
  });

  describe('alpha', () => {
    it('is computed post-tick from the leftover accumulator and stays in [0, 1)', () => {
      const { driver } = makeDriver();
      expect(driver.alpha).toBe(0); // nothing advanced yet
      driver.advance(0.06); // anchor
      const r = driver.advance(0.06); // 60 ms -> 1 tick, 10 ms leftover
      expect(r.ticksExecuted).toBe(1);
      expect(r.alpha).toBeCloseTo(0.2, 5);
      expect(driver.alpha).toBe(r.alpha);

      driver.advance(0.04); // accumulator back to 0
      const r2 = driver.advance(0.099); // 99 ms -> 1 tick, 49 ms leftover
      expect(r2.ticksExecuted).toBe(1);
      expect(r2.alpha).toBeGreaterThan(0);
      expect(r2.alpha).toBeLessThan(1);
    });

    it('treats non-finite or non-positive deltas as zero-length frames', () => {
      const { driver } = makeDriver();
      driver.advance(0.05); // anchor
      driver.advance(0.05);
      expect(driver.totalTicks).toBe(1);
      for (const bad of [NaN, Infinity, -Infinity, 0, -0.05]) {
        const r = driver.advance(bad);
        expect(r.ticksExecuted).toBe(0);
        expect(r.debtDiscarded).toBe(0);
        expect(r.alpha).toBe(driver.alpha);
      }
      expect(driver.totalTicks).toBe(1); // garbage deltas never touch the clock
    });
  });

  describe('pause/resume drops pending wall-time', () => {
    it('runs no ticks while paused and never replays the paused interval', () => {
      const { driver, ticks } = makeDriver();
      driver.advance(0.05); // anchor
      driver.advance(0.05);
      expect(driver.totalTicks).toBe(1);

      driver.pause();
      expect(driver.isPaused).toBe(true);
      // Wall time flows while paused; each frame runs zero ticks.
      for (let f = 0; f < 10; f++) {
        const r = driver.advance(0.1); // 1000 ms of paused wall time
        expect(r.ticksExecuted).toBe(0);
        expect(r.debtDiscarded).toBe(0);
      }
      expect(ticks.length).toBe(1);
      expect(driver.isRunning).toBe(true);

      driver.resume();
      expect(driver.isPaused).toBe(false);
      // Only the delta after resume counts — none of the paused 1000 ms replays.
      const r = driver.advance(0.05);
      expect(r.ticksExecuted).toBe(1);
      expect(r.debtDiscarded).toBe(0);
      expect(driver.totalTicks).toBe(2);
    });

    it('keeps the anchor fresh during pause so resume causes no catch-up burst', () => {
      const { driver } = makeDriver();
      driver.pause();
      driver.advance(0.05); // anchored during pause
      driver.resume();
      const r = driver.advance(0.05); // measured from the pause-window frame
      expect(r.ticksExecuted).toBe(1);
      expect(r.debtDiscarded).toBe(0);
      expect(driver.alpha).toBe(0);
    });
  });

  describe('reused frame-result object', () => {
    it('returns the same object identity every advance, overwritten in place', () => {
      const { driver } = makeDriver();
      const results: FixedTickFrameResult[] = [];
      for (let f = 0; f < 3; f++) results.push(driver.advance(0.05));
      // Documented hot-path behavior: allocation-light, identity reused across frames.
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
      // Callers must not retain it: values reflect the LATEST frame only.
      expect(results[0]!.ticksExecuted).toBe(1);
      // Copying preserves a stable snapshot across later advances.
      const snapshot = { ...results[0]! };
      driver.advance(1.0); // triggers debt discard
      expect(snapshot.debtDiscarded).toBe(0);
      expect(results[0]!.debtDiscarded).toBe(15);
    });

    it('zeroes the reused result on reset', () => {
      const { driver } = makeDriver({ maxCatchUpTicks: 2 });
      driver.advance(0.05); // anchor
      const r = driver.advance(0.5);
      expect(r.debtDiscarded).toBe(8);
      driver.reset();
      expect(r.ticksExecuted).toBe(0);
      expect(r.debtDiscarded).toBe(0);
      expect(r.alpha).toBe(0);
    });
  });

  describe('reset()', () => {
    it('restarts tick numbering at 0 and clears all counters', () => {
      const { driver, ticks } = makeDriver();
      driver.advance(0.05); // anchor
      driver.advance(0.05); // tick 0
      driver.advance(1.0); // ticks 1..5, 15 discarded
      expect(driver.totalTicks).toBe(6);

      driver.reset();
      expect(driver.totalTicks).toBe(0);
      expect(driver.currentTickIndex).toBe(0);
      expect(driver.previousTickIndex).toBe(-1);
      expect(driver.isRunning).toBe(false);
      expect(driver.alpha).toBe(0);
      expect(driver.isPaused).toBe(false);

      // Next frame re-anchors; the one after restarts gap-free at index 0.
      expect(driver.advance(0.05).ticksExecuted).toBe(0);
      driver.advance(0.05);
      expect(ticks).toEqual([0, 1, 2, 3, 4, 5, 0]);
    });
  });

  describe('constructor validation', () => {
    it('rejects a missing/non-function tick', () => {
      expect(() => new FixedTickDriver({ tick: undefined as never })).toThrow(/tick/);
      expect(() => new FixedTickDriver({ tick: 'nope' as never })).toThrow(/tick/);
    });

    it('rejects invalid tickRateHz naming the field', () => {
      for (const bad of [0, -20, NaN, Infinity]) {
        expect(() => makeDriver({ tickRateHz: bad })).toThrow(/tickRateHz/);
      }
    });

    it('rejects invalid maxCatchUpTicks naming the field', () => {
      for (const bad of [0, -1, 1.5, NaN, Infinity]) {
        expect(() => makeDriver({ maxCatchUpTicks: bad })).toThrow(/maxCatchUpTicks/);
      }
    });
  });
});
