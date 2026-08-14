import { describe, it, expect } from 'vitest';
import { ScheduledTickQueue, validateSerializedScheduledTickQueue } from '../../src/simulation/ScheduledTickQueue';

describe('ScheduledTickQueue', () => {
  it('pops exactly the entries due at or before the threshold', () => {
    const q = new ScheduledTickQueue();
    q.schedule(0, 0, 0, 5);
    q.schedule(1, 0, 0, 10);
    q.schedule(2, 0, 0, 15);

    expect(q.tick(10).map((t) => t.tickTime)).toEqual([5, 10]);
    expect(q.size).toBe(1);
    expect(q.tick(15).map((t) => t.tickTime)).toEqual([15]);
    expect(q.size).toBe(0);
  });

  it('orders due entries by (tickTime, insertion order)', () => {
    const q = new ScheduledTickQueue();
    q.schedule(0, 0, 0, 10); // A
    q.schedule(1, 0, 0, 5); // B
    q.schedule(2, 0, 0, 10); // C

    const due = q.tick(10);
    expect(due.map((t) => [t.x, t.tickTime])).toEqual([
      [1, 5],
      [0, 10],
      [2, 10],
    ]);
  });

  it('de-duplicates by position, updating the due tick in place', () => {
    const q = new ScheduledTickQueue();
    q.schedule(5, 5, 5, 10);
    q.schedule(5, 5, 5, 20);

    expect(q.size).toBe(1);
    expect(q.tick(10)).toHaveLength(0);
    const due = q.tick(20);
    expect(due).toHaveLength(1);
    expect(due[0]).toEqual({ x: 5, y: 5, z: 5, tickTime: 20 });
  });

  it('scheduleIn schedules at currentTick + delayTicks', () => {
    const q = new ScheduledTickQueue();
    q.scheduleIn(3, 4, 5, 3, 100);

    expect(q.tick(102)).toHaveLength(0);
    expect(q.tick(103)).toEqual([{ x: 3, y: 4, z: 5, tickTime: 103 }]);
  });

  it('cancel is idempotent and clear empties the queue', () => {
    const q = new ScheduledTickQueue();
    q.schedule(0, 0, 0, 1);
    q.schedule(1, 1, 1, 2);
    expect(q.has(0, 0, 0)).toBe(true);

    q.cancel(0, 0, 0);
    q.cancel(0, 0, 0);
    expect(q.has(0, 0, 0)).toBe(false);
    expect(q.size).toBe(1);

    q.clear();
    expect(q.size).toBe(0);
    expect(q.has(1, 1, 1)).toBe(false);
  });

  it('serialize → deserialize round-trips exactly', () => {
    const q = new ScheduledTickQueue();
    q.schedule(0, 0, 0, 5);
    q.schedule(1, 2, 3, 10);

    const fresh = new ScheduledTickQueue();
    fresh.deserialize(q.serialize());

    expect(fresh.size).toBe(2);
    expect(fresh.tick(10)).toEqual(q.tick(10));
  });

  it('rejects malformed payloads without changing the queue', () => {
    const q = new ScheduledTickQueue();
    q.schedule(0, 0, 0, 5);

    expect(() => validateSerializedScheduledTickQueue({ version: 2, entries: [] })).toThrow();
    expect(() => validateSerializedScheduledTickQueue({ version: 1, entries: 'x' })).toThrow();
    expect(() =>
      validateSerializedScheduledTickQueue({ version: 1, entries: [{ x: 0, y: 0, z: 0, tickTime: 1.5 }] }),
    ).toThrow();

    expect(() => q.deserialize({ version: 2, entries: [] })).toThrow();
    expect(q.size).toBe(1); // unchanged
  });

  it('throws on invalid schedule inputs', () => {
    const q = new ScheduledTickQueue();
    expect(() => q.schedule(0.5, 0, 0, 1)).toThrow(RangeError);
    expect(() => q.schedule(0, 0, 0, NaN)).toThrow(RangeError);
    expect(() => q.scheduleIn(0, 0, 0, 1.5, 10)).toThrow(RangeError);
  });
});
