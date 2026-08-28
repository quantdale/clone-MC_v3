import { describe, it, expect } from 'vitest';
import { BlockEventQueue, type BlockEvent } from '../../src/simulation/BlockEventQueue';

describe('BlockEventQueue', () => {
  it('delivers events in FIFO order, bounded by maxPerDrain', () => {
    const q = new BlockEventQueue({ maxPerDrain: 2 });
    q.add(0, 0, 0, 1, 10, 100); // A
    q.add(1, 0, 0, 2, 11, 200); // B
    q.add(2, 0, 0, 3, 12, 300); // C
    q.add(3, 0, 0, 4, 13, 400); // D

    const seen: BlockEvent[] = [];
    expect(q.drain((e) => seen.push(e))).toBe(2);
    expect(seen.map((e) => e.eventId)).toEqual([10, 11]);
    expect(q.size).toBe(2);

    expect(q.drain((e) => seen.push(e))).toBe(2);
    expect(seen.map((e) => e.eventId)).toEqual([10, 11, 12, 13]);
    expect(q.size).toBe(0);
  });

  it('de-dupes per (position, eventId) with newest-param-wins', () => {
    const q = new BlockEventQueue();
    expect(q.add(5, 5, 5, 1, 7, 1)).toBe(true);
    expect(q.add(5, 5, 5, 1, 7, 9)).toBe(true); // same key: param update

    const seen: BlockEvent[] = [];
    q.drain((e) => seen.push(e));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ x: 5, y: 5, z: 5, blockId: 1, eventId: 7, param: 9 });
  });

  it('keeps different eventIds at one position as separate events', () => {
    const q = new BlockEventQueue();
    q.add(5, 5, 5, 1, 1, 10);
    q.add(5, 5, 5, 1, 2, 20);

    const seen: BlockEvent[] = [];
    q.drain((e) => seen.push(e));
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ eventId: 1, param: 10 });
    expect(seen[1]).toMatchObject({ eventId: 2, param: 20 });
  });

  it('overflow protection: add returns false at the cap and never delivers the dropped event', () => {
    const q = new BlockEventQueue({ maxQueueSize: 2 });
    expect(q.add(0, 0, 0, 1, 1, 1)).toBe(true);
    expect(q.add(1, 0, 0, 1, 1, 2)).toBe(true);
    expect(q.add(2, 0, 0, 1, 1, 3)).toBe(false); // dropped
    expect(q.size).toBe(2);

    const seen: BlockEvent[] = [];
    q.drain((e) => seen.push(e));
    expect(seen).toHaveLength(2);
  });

  it('exposes size and clear', () => {
    const q = new BlockEventQueue();
    q.add(3, 4, 5, 1, 1, 1);
    expect(q.size).toBe(1);
    q.clear();
    expect(q.size).toBe(0);

    const seen: BlockEvent[] = [];
    q.drain((e) => seen.push(e));
    expect(seen).toHaveLength(0);
  });

  it('a throwing handler aborts the drain; delivered events stay removed', () => {
    const q = new BlockEventQueue({ maxPerDrain: 10 });
    q.add(0, 0, 0, 1, 1, 1);
    q.add(1, 0, 0, 1, 2, 2);

    expect(() =>
      q.drain((e) => {
        if (e.eventId === 2) throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(q.size).toBe(0);
  });
});
