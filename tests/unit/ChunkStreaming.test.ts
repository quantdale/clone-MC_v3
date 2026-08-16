import { describe, it, expect } from 'vitest';
import {
  ChunkStreamManager,
  columnKey,
  type ChunkSnapshot,
  type ChunkUpdate,
} from '../../src/simulation/ChunkStreaming';

function snapshot(key: string, sectionsY: number[] = [0]): ChunkSnapshot {
  const parts = key.split(',');
  const x = Number(parts[0]);
  const z = Number(parts[1]);
  return {
    key,
    x,
    z,
    sections: sectionsY.map((y) => ({ y, data: [y + 1] })),
    tick: 0,
  };
}

describe('ChunkStreamManager', () => {
  describe('construction', () => {
    it('constructs pristine: no center, empty interest, empty store', () => {
      const m = new ChunkStreamManager({ viewDistance: 2 });
      expect(m.center).toBeNull();
      expect(m.interest()).toEqual([]);
      expect(m.hasSnapshot('0,0')).toBe(false);
      expect(m.isInterested(0, 0)).toBe(false);
    });

    it('rejects non-positive or non-integer view distances', () => {
      expect(() => new ChunkStreamManager({ viewDistance: 0 })).toThrow(
        'ChunkStream: viewDistance must be a positive integer',
      );
      expect(() => new ChunkStreamManager({ viewDistance: 2.5 })).toThrow(
        'ChunkStream: viewDistance must be a positive integer',
      );
    });

    it('rejects non-positive or non-integer max snapshots', () => {
      expect(() => new ChunkStreamManager({ viewDistance: 1, maxSnapshots: 0 })).toThrow(
        'ChunkStream: maxSnapshots must be a positive integer',
      );
      expect(() => new ChunkStreamManager({ viewDistance: 1, maxSnapshots: 3.5 })).toThrow(
        'ChunkStream: maxSnapshots must be a positive integer',
      );
    });
  });

  describe('interest', () => {
    it('applies the Chebyshev rule exactly', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(5, 5);
      expect(m.isInterested(5, 5)).toBe(true);
      expect(m.isInterested(6, 5)).toBe(true);
      expect(m.isInterested(5, 4)).toBe(true);
      expect(m.isInterested(6, 6)).toBe(true);
      expect(m.isInterested(7, 5)).toBe(false);
      expect(m.isInterested(5, 7)).toBe(false);
      expect(m.isInterested(-4, 6)).toBe(false);
    });

    it('returns the interest set key-sorted', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(0, 0);
      expect(m.interest()).toEqual([
        '-1,-1',
        '-1,0',
        '-1,1',
        '0,-1',
        '0,0',
        '0,1',
        '1,-1',
        '1,0',
        '1,1',
      ]);
    });
  });

  describe('center moves', () => {
    it('first move enters the whole interest set', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      const delta = m.setCenter(0, 0);
      expect(delta.left).toEqual([]);
      expect(delta.entered.length).toBe(9);
      expect(delta.entered).toEqual(m.interest());
    });

    it('reports the exact delta for a one-chunk move', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(0, 0);
      const delta = m.setCenter(1, 0);
      expect(delta.entered).toEqual(['2,-1', '2,0', '2,1']);
      expect(delta.left).toEqual(['-1,-1', '-1,0', '-1,1']);
    });

    it('returns only this move\'s fresh delta and accumulates internally', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(0, 0);
      const second = m.setCenter(1, 0);
      expect(second.entered).toEqual(['2,-1', '2,0', '2,1']);
      expect(second.left).toEqual(['-1,-1', '-1,0', '-1,1']);
      const third = m.setCenter(2, 0);
      expect(third.entered).toEqual(['3,-1', '3,0', '3,1']);
      expect(third.left).toEqual(['0,-1', '0,0', '0,1']);
      // Accumulation across moves is observable through pendingUpdates.
      m.putSnapshot(snapshot('2,0'));
      m.putSnapshot(snapshot('3,0'));
      const update = m.pendingUpdates(1);
      expect(update.added.map((s) => s.key)).toEqual(['2,0', '3,0']);
    });

    it('rejects non-integer coordinates without changing the center', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(0, 0);
      expect(() => m.setCenter(0.5, 0)).toThrow(
        'ChunkStream: center coordinates must be integers',
      );
      expect(m.center).toEqual({ x: 0, z: 0 });
    });
  });

  describe('snapshots', () => {
    it('round-trips a snapshot', () => {
      const m = new ChunkStreamManager({ viewDistance: 2 });
      m.setCenter(0, 0);
      const snap = snapshot('0,0');
      m.putSnapshot(snap);
      expect(m.hasSnapshot('0,0')).toBe(true);
      expect(m.getSnapshot('0,0')).toEqual(snap);
      expect(m.getSnapshot('1,1')).toBeNull();
    });

    it('rejects a key that does not match the coordinates', () => {
      const m = new ChunkStreamManager({ viewDistance: 2 });
      const bad = { ...snapshot('1,1'), z: 2 };
      expect(() => m.putSnapshot(bad)).toThrow('ChunkStream: snapshot key 1,1 does not match');
      expect(m.hasSnapshot('1,1')).toBe(false);
    });

    it('rejects non-integer coordinates', () => {
      const m = new ChunkStreamManager({ viewDistance: 2 });
      expect(() => m.putSnapshot(snapshot('0.5,0'))).toThrow(
        'ChunkStream: snapshot coordinates must be integers',
      );
    });

    it('rejects empty sections and duplicate section y', () => {
      const m = new ChunkStreamManager({ viewDistance: 2 });
      const noSections = { ...snapshot('0,0'), sections: [] };
      expect(() => m.putSnapshot(noSections)).toThrow(
        'ChunkStream: snapshot sections must be a non-empty array',
      );
      const dup = { ...snapshot('0,0', [0, 0]) };
      expect(() => m.putSnapshot(dup)).toThrow('ChunkStream: duplicate section y 0');
      expect(m.hasSnapshot('0,0')).toBe(false);
    });

    it('rejects non-integer section y', () => {
      const m = new ChunkStreamManager({ viewDistance: 2 });
      const bad = { ...snapshot('0,0'), sections: [{ y: 0.5, data: [1] }] };
      expect(() => m.putSnapshot(bad)).toThrow('ChunkStream: section y must be an integer');
    });

    it('rejects empty or negative data payloads', () => {
      const m = new ChunkStreamManager({ viewDistance: 2 });
      const empty = { ...snapshot('0,0'), sections: [{ y: 0, data: [] }] };
      expect(() => m.putSnapshot(empty)).toThrow(
        'ChunkStream: section data must be a non-empty array',
      );
      const negative = { ...snapshot('0,0'), sections: [{ y: 0, data: [0, -1] }] };
      expect(() => m.putSnapshot(negative)).toThrow(
        'ChunkStream: section data must be non-negative safe integers',
      );
      expect(m.hasSnapshot('0,0')).toBe(false);
    });

    it('rejects invalid ticks', () => {
      const m = new ChunkStreamManager({ viewDistance: 2 });
      expect(() => m.putSnapshot({ ...snapshot('0,0'), tick: -1 })).toThrow(
        'ChunkStream: tick must be a non-negative safe integer',
      );
      expect(() => m.putSnapshot({ ...snapshot('0,0'), tick: 1.5 })).toThrow(
        'ChunkStream: tick must be a non-negative safe integer',
      );
    });

    it('replaces an existing snapshot and removal clears the store', () => {
      const m = new ChunkStreamManager({ viewDistance: 2 });
      m.setCenter(0, 0);
      m.putSnapshot(snapshot('0,0', [0]));
      const replacement = snapshot('0,0', [0, 1]);
      m.putSnapshot(replacement);
      expect(m.getSnapshot('0,0')).toEqual(replacement);
      m.removeSnapshot('0,0');
      expect(m.hasSnapshot('0,0')).toBe(false);
    });

    it('evicts the oldest-inserted snapshot when the store is full', () => {
      const m = new ChunkStreamManager({ viewDistance: 3, maxSnapshots: 2 });
      m.setCenter(0, 0);
      m.putSnapshot(snapshot('0,0'));
      m.putSnapshot(snapshot('1,0'));
      m.putSnapshot(snapshot('2,0'));
      expect(m.hasSnapshot('0,0')).toBe(false);
      expect(m.hasSnapshot('1,0')).toBe(true);
      expect(m.hasSnapshot('2,0')).toBe(true);
    });
  });

  describe('updates', () => {
    it('first update sends added snapshots in key order', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(0, 0);
      m.putSnapshot(snapshot('0,0'));
      m.putSnapshot(snapshot('-1,-1'));
      const update = m.pendingUpdates(10);
      expect(update.tick).toBe(10);
      expect(update.removed).toEqual([]);
      expect(update.updated).toEqual([]);
      expect(update.added.map((s) => s.key)).toEqual(['-1,-1', '0,0']);
    });

    it('consumes the accumulators on each call', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(0, 0);
      m.putSnapshot(snapshot('0,0'));
      m.pendingUpdates(1);
      const second = m.pendingUpdates(2);
      expect(second.added).toEqual([]);
      expect(second.removed).toEqual([]);
      expect(second.updated).toEqual([]);
    });

    it('sends removed keys after a move, without snapshots for unsent entries', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(0, 0);
      m.putSnapshot(snapshot('-1,0'));
      m.pendingUpdates(1);
      m.setCenter(1, 0);
      const update = m.pendingUpdates(2);
      expect(update.added).toEqual([]);
      expect(update.removed).toEqual(['-1,-1', '-1,0', '-1,1']);
      expect(update.updated).toEqual([]);
    });

    it('surfaces a late snapshot as updated while inside the interest', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(0, 0);
      m.setCenter(1, 0);
      m.pendingUpdates(1);
      m.putSnapshot(snapshot('2,0'));
      const update = m.pendingUpdates(2);
      expect(update.added).toEqual([]);
      expect(update.updated.map((s) => s.key)).toEqual(['2,0']);
    });

    it('sends dirty snapshots inside the interest as updated', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(0, 0);
      m.putSnapshot(snapshot('0,0'));
      m.pendingUpdates(1);
      const replacement = snapshot('0,0', [0, 1]);
      m.putSnapshot(replacement);
      const update = m.pendingUpdates(2);
      expect(update.added).toEqual([]);
      expect(update.removed).toEqual([]);
      expect(update.updated.map((s) => s.key)).toEqual(['0,0']);
      expect(update.updated[0]).toEqual(replacement);
    });

    it('does not send snapshots that were removed', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(0, 0);
      m.putSnapshot(snapshot('0,0'));
      m.removeSnapshot('0,0');
      const update = m.pendingUpdates(1);
      expect(update.updated).toEqual([]);
      expect(update.added).toEqual([]);
    });

    it('rejects invalid ticks without consuming the accumulators', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(0, 0);
      m.putSnapshot(snapshot('0,0'));
      expect(() => m.pendingUpdates(-1)).toThrow(
        'ChunkStream: tick must be a non-negative safe integer',
      );
      expect(() => m.pendingUpdates(1.5)).toThrow(
        'ChunkStream: tick must be a non-negative safe integer',
      );
      const update = m.pendingUpdates(1);
      expect(update.added.map((s) => s.key)).toEqual(['0,0']);
    });
  });

  describe('reset and determinism', () => {
    it('reset restores the pristine state', () => {
      const m = new ChunkStreamManager({ viewDistance: 1 });
      m.setCenter(0, 0);
      m.putSnapshot(snapshot('0,0'));
      m.pendingUpdates(1);
      m.setCenter(2, 0);
      m.reset();
      expect(m.center).toBeNull();
      expect(m.interest()).toEqual([]);
      expect(m.hasSnapshot('0,0')).toBe(false);
    });

    it('identical schedules produce identical update output', () => {
      const run = (): ChunkUpdate[] => {
        const m = new ChunkStreamManager({ viewDistance: 1, maxSnapshots: 2 });
        const updates: ChunkUpdate[] = [];
        m.setCenter(0, 0);
        updates.push(m.pendingUpdates(1));
        m.setCenter(2, 0);
        m.putSnapshot(snapshot('1,0'));
        m.putSnapshot(snapshot('3,0'));
        updates.push(m.pendingUpdates(2));
        m.putSnapshot(snapshot('3,0', [0, 1]));
        updates.push(m.pendingUpdates(3));
        return updates;
      };
      expect(run()).toEqual(run());
    });

    it('columnKey builds the documented format', () => {
      expect(columnKey(-3, 7)).toBe('-3,7');
    });
  });
});
