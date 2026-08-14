import { describe, it, expect } from 'vitest';
import { FluidTickDispatcher } from '../../src/simulation/FluidTickDispatcher';
import { ScheduledTickQueue } from '../../src/simulation/ScheduledTickQueue';

interface Call {
  x: number;
  y: number;
  z: number;
  dueTick: number;
}

function recordingHandler(log: Call[]): (x: number, y: number, z: number, dueTick: number) => void {
  return (x, y, z, dueTick) => log.push({ x, y, z, dueTick });
}

describe('FluidTickDispatcher', () => {
  it('schedules relative ticks with position dedupe', () => {
    const queue = new ScheduledTickQueue();
    const dispatcher = new FluidTickDispatcher(queue, () => undefined);
    dispatcher.schedule(1, 2, 3, 5, 0);
    dispatcher.schedule(1, 2, 3, 10, 0); // re-schedule: dedupes, newest due tick wins
    expect(dispatcher.pendingCount).toBe(1);
    expect(queue.has(1, 2, 3)).toBe(true);
  });

  it('dispatches due entries in (tickTime, insertion) order', () => {
    const log: Call[] = [];
    const queue = new ScheduledTickQueue();
    const dispatcher = new FluidTickDispatcher(queue, recordingHandler(log));
    dispatcher.schedule(1, 0, 0, 5, 0);
    dispatcher.schedule(2, 0, 0, 3, 0);
    dispatcher.schedule(3, 0, 0, 5, 0);

    const report = dispatcher.tick(5);

    expect(log.map((c) => c.x)).toEqual([2, 1, 3]); // tick 3 first, then tick-5 entries in insertion order
    expect(log.every((c) => c.dueTick === 5 || c.dueTick === 3)).toBe(true);
    expect(report).toEqual({ processed: 3, deferred: 0, pending: 0 });
  });

  it('bounds dispatch and defers the excess at its original due tick', () => {
    const log: Call[] = [];
    const queue = new ScheduledTickQueue();
    const dispatcher = new FluidTickDispatcher(queue, recordingHandler(log), 2);
    dispatcher.schedule(1, 0, 0, 4, 0);
    dispatcher.schedule(2, 0, 0, 4, 0);
    dispatcher.schedule(3, 0, 0, 4, 0);

    const first = dispatcher.tick(4);
    expect(first).toEqual({ processed: 2, deferred: 1, pending: 1 });
    expect(log.map((c) => c.x)).toEqual([1, 2]);

    const second = dispatcher.tick(4); // the deferred entry is still due
    expect(second).toEqual({ processed: 1, deferred: 0, pending: 0 });
    expect(log.map((c) => c.x)).toEqual([1, 2, 3]);
  });

  it('leaves not-yet-due entries pending', () => {
    const log: Call[] = [];
    const queue = new ScheduledTickQueue();
    const dispatcher = new FluidTickDispatcher(queue, recordingHandler(log));
    dispatcher.schedule(1, 0, 0, 10, 0);

    expect(dispatcher.tick(5)).toEqual({ processed: 0, deferred: 0, pending: 1 });
    expect(log).toEqual([]);
  });

  it('passes the due tick to the handler and supports self-rescheduling', () => {
    const log: Call[] = [];
    const queue = new ScheduledTickQueue();
    const dispatcher = new FluidTickDispatcher(
      queue,
      (x, y, z, dueTick) => {
        log.push({ x, y, z, dueTick });
        dispatcher.schedule(x, y, z, 2, dueTick); // re-schedule itself 2 ticks later
      },
    );
    dispatcher.schedule(1, 2, 3, 7, 0);

    expect(dispatcher.tick(7)).toEqual({ processed: 1, deferred: 0, pending: 1 }); // re-scheduled at 9
    expect(log).toEqual([{ x: 1, y: 2, z: 3, dueTick: 7 }]);

    expect(dispatcher.tick(8)).toEqual({ processed: 0, deferred: 0, pending: 1 }); // not due until 9
    expect(dispatcher.tick(9)).toEqual({ processed: 1, deferred: 0, pending: 1 }); // re-scheduled at 11
    expect(log[1]).toEqual({ x: 1, y: 2, z: 3, dueTick: 9 });
  });

  it('exposes pendingCount and clear over the underlying queue', () => {
    const queue = new ScheduledTickQueue();
    const dispatcher = new FluidTickDispatcher(queue, () => undefined);
    dispatcher.schedule(1, 0, 0, 5, 0);
    dispatcher.schedule(2, 0, 0, 5, 0);
    expect(dispatcher.pendingCount).toBe(2);
    expect(dispatcher.pendingCount).toBe(queue.size);

    dispatcher.clear();
    expect(dispatcher.pendingCount).toBe(0);
    expect(queue.size).toBe(0);
  });

  it('rejects invalid budgets at construction', () => {
    for (const bad of [0, -1, 2.5, NaN]) {
      expect(() => new FluidTickDispatcher(new ScheduledTickQueue(), () => undefined, bad)).toThrow(
        /maxPerTick/i,
      );
    }
  });

  it('is deterministic for identical scripted schedules', () => {
    const run = () => {
      const log: Call[] = [];
      const dispatcher = new FluidTickDispatcher(
        new ScheduledTickQueue(),
        recordingHandler(log),
        2,
      );
      dispatcher.schedule(1, 0, 0, 5, 0);
      dispatcher.schedule(2, 0, 0, 3, 0);
      dispatcher.schedule(3, 0, 0, 5, 0);
      dispatcher.schedule(4, 0, 0, 5, 0);
      const r1 = dispatcher.tick(5);
      const r2 = dispatcher.tick(5);
      return { log, r1, r2 };
    };
    const a = run();
    const b = run();
    expect(a.log).toEqual(b.log);
    expect(a.r1).toEqual(b.r1);
    expect(a.r2).toEqual(b.r2);
    // Budget of 2 across two ticks processes all four.
    expect(a.r1.processed + a.r2.processed).toBe(4);
  });
});
