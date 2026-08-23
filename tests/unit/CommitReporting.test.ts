import { describe, it, expect } from 'vitest';
import { DirtySaveQueue, type SaveSink, type SaveUnit } from '../../src/storage/DirtySaveQueue';
import { AutosaveCoordinator, type TimerLike } from '../../src/storage/AutosaveCoordinator';

/**
 * Regression oracle (hardening 2026-08-23, F-PERS-6): committed unit keys are
 * now reported by drains so owners can release in-memory pending copies at the
 * moment of durable commit (the coordinator's onUnitsCommitted hook), instead
 * of retaining one full overlay copy per edited chunk until a facade flush.
 */

function unit(key: string): SaveUnit {
  return { key, kind: 'world-metadata', worldId: 'w', chunkX: 0, chunkY: 0, chunkZ: 0, payload: { key } };
}

const okSink: SaveSink = {
  write: async () => undefined,
};

describe('drainReport committed keys', () => {
  it('reports exactly the sink-accepted keys', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit('a'));
    q.markDirty(unit('b'));
    const report = await q.drainReport(okSink, 10);
    expect(report.written).toBe(2);
    expect(report.committedKeys).toEqual(['a', 'b']);
  });

  it('omits failed keys and keeps them queued', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit('fail'));
    q.markDirty(unit('ok'));
    let calls = 0;
    const flaky: SaveSink = {
      write: async (u) => {
        calls++;
        if (u.key === 'fail' && calls === 1) throw new Error('quota');
      },
    };
    const first = await q.drainReport(flaky, 10);
    expect(first.committedKeys).toEqual(['ok']);
    expect(q.has('fail')).toBe(true);

    // Retry commits it later.
    const second = await q.drainReport(flaky, 10);
    expect(calls).toBe(3);
    expect(second.committedKeys).toEqual(['fail']);
  });

  it('keeps drain() numeric behavior for existing callers', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit('x'));
    expect(await q.drain(okSink, 10)).toBe(1);
    expect(await q.drain(okSink, 0)).toBe(0);
  });
});

describe('AutosaveCoordinator.onUnitsCommitted', () => {
  const inertTimer: TimerLike = {
    setInterval(): unknown {
      return 0;
    },
    clearInterval(): void {},
  };

  it('fires after each productive tick with the committed keys', async () => {
    const q = new DirtySaveQueue();
    const batches: string[][] = [];
    const hooked = new AutosaveCoordinator({
      queue: q,
      sink: okSink,
      limitPerTick: 1,
      timer: inertTimer,
      flushTarget: null,
      onUnitsCommitted: (keys) => batches.push([...keys]),
    });
    q.markDirty(unit('k1'));
    q.markDirty(unit('k2'));
    await hooked.tick();
    await hooked.tick();
    expect(batches).toEqual([['k1'], ['k2']]);
  });

  it('does not fire when nothing committed', async () => {
    const q = new DirtySaveQueue();
    const gated: SaveSink = {
      write: async () => {
        throw new Error('storage unhealthy');
      },
    };
    const batches: string[][] = [];
    const hooked = new AutosaveCoordinator({
      queue: q,
      sink: gated,
      limitPerTick: 8,
      timer: inertTimer,
      flushTarget: null,
      onUnitsCommitted: (keys) => batches.push([...keys]),
    });
    q.markDirty(unit('g'));
    expect(await hooked.tick()).toBe(0);
    expect(batches).toEqual([]);
  });

  it('flush reports every round and never throws from a throwing hook', async () => {
    const q = new DirtySaveQueue();
    for (let i = 0; i < 5; i++) q.markDirty(unit(`u${i}`));
    let fired = 0;
    const hooked = new AutosaveCoordinator({
      queue: q,
      sink: okSink,
      limitPerTick: 2,
      timer: inertTimer,
      flushTarget: null,
      onUnitsCommitted: () => {
        fired++;
        throw new Error('bookkeeping bug');
      },
    });
    const written = await hooked.flush();
    expect(written).toBe(5);
    expect(fired).toBe(3); // three productive rounds of 2/2/1
    expect(q.size).toBe(0);
  });
});
