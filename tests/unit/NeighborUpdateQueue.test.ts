import { describe, it, expect } from 'vitest';
import { NeighborUpdateQueue } from '../../src/simulation/NeighborUpdateQueue';

describe('NeighborUpdateQueue', () => {
  it('processes positions in FIFO order, bounded by maxPerDrain', () => {
    const q = new NeighborUpdateQueue({ maxPerDrain: 2 });
    q.enqueue(0, 0, 0); // A
    q.enqueue(1, 0, 0); // B
    q.enqueue(2, 0, 0); // C
    q.enqueue(3, 0, 0); // D

    const seen: string[] = [];
    expect(q.drain((x) => seen.push(`${x}`))).toBe(2);
    expect(seen).toEqual(['0', '1']);
    expect(q.size).toBe(2);

    expect(q.drain((x) => seen.push(`${x}`))).toBe(2);
    expect(seen).toEqual(['0', '1', '2', '3']);
    expect(q.size).toBe(0);
  });

  it('de-duplicates by position', () => {
    const q = new NeighborUpdateQueue();
    expect(q.enqueue(5, 5, 5)).toBe(true);
    expect(q.enqueue(5, 5, 5)).toBe(true); // already pending

    let count = 0;
    q.drain(() => count++);
    expect(count).toBe(1);
    expect(q.size).toBe(0);
  });

  it('processes handler-enqueued positions in the same drain (no recursion)', () => {
    const q = new NeighborUpdateQueue({ maxPerDrain: 10 });
    q.enqueue(0, 0, 0); // A

    const seen: string[] = [];
    q.drain((x) => {
      seen.push(`${x}`);
      if (x === 0) q.enqueue(1, 0, 0); // B on A
      if (x === 1) q.enqueue(2, 0, 0); // C on B
    });

    expect(seen).toEqual(['0', '1', '2']);
    expect(q.size).toBe(0);
  });

  it('overflow protection: enqueue returns false at the cap and does not grow', () => {
    const q = new NeighborUpdateQueue({ maxQueueSize: 2 });
    expect(q.enqueue(0, 0, 0)).toBe(true);
    expect(q.enqueue(1, 0, 0)).toBe(true);
    expect(q.enqueue(2, 0, 0)).toBe(false); // dropped
    expect(q.size).toBe(2);

    const seen: string[] = [];
    q.drain((x) => seen.push(`${x}`));
    expect(seen).toEqual(['0', '1']); // the dropped position never runs
  });

  it('exposes size/has/clear', () => {
    const q = new NeighborUpdateQueue();
    q.enqueue(3, 4, 5);
    expect(q.size).toBe(1);
    expect(q.has(3, 4, 5)).toBe(true);
    expect(q.has(9, 9, 9)).toBe(false);

    q.clear();
    expect(q.size).toBe(0);
    expect(q.has(3, 4, 5)).toBe(false);
  });

  it('a throwing handler aborts the drain; processed entries stay removed', () => {
    const q = new NeighborUpdateQueue({ maxPerDrain: 10 });
    q.enqueue(0, 0, 0);
    q.enqueue(1, 0, 0);

    expect(() =>
      q.drain((x) => {
        if (x === 1) throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(q.size).toBe(0); // both were popped; the handler threw on the second
  });
});
