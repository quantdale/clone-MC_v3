import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutosaveCoordinator, type EventTargetLike } from '../../src/storage/AutosaveCoordinator';
import { DirtySaveQueue, type SaveUnit, type SaveSink } from '../../src/storage/DirtySaveQueue';

class RecordingSink implements SaveSink {
  calls: SaveUnit[] = [];
  failKeys = new Set<string>();
  async write(u: SaveUnit): Promise<void> {
    this.calls.push(u);
    if (this.failKeys.has(u.key)) throw new Error(`forced failure: ${u.key}`);
  }
}

class FakeTarget implements EventTargetLike {
  private readonly listeners = new Map<string, Array<() => void>>();
  addCalls: string[] = [];
  removeCalls: string[] = [];

  addEventListener(type: string, listener: () => void): void {
    this.addCalls.push(type);
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.removeCalls.push(type);
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((l) => l !== listener));
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

function unit(key: string, payload: unknown = 1): SaveUnit {
  return { key, kind: 'world-metadata', worldId: 'a', chunkX: 0, chunkZ: 0, payload };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AutosaveCoordinator', () => {
  it('drains at most limitPerTick per interval', async () => {
    const q = new DirtySaveQueue();
    const sink = new RecordingSink();
    const coord = new AutosaveCoordinator({ queue: q, sink, limitPerTick: 2, intervalMs: 1000, flushTarget: null });
    coord.start();
    coord.markDirty(unit('a'));
    coord.markDirty(unit('b'));
    coord.markDirty(unit('c'));

    await vi.advanceTimersByTimeAsync(1000);
    expect(sink.calls.map((u) => u.key)).toEqual(['a', 'b']);
    expect(coord.size).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(sink.calls.map((u) => u.key)).toEqual(['a', 'b', 'c']);
    expect(coord.size).toBe(0);
  });

  it('an idle tick writes nothing', async () => {
    const q = new DirtySaveQueue();
    const sink = new RecordingSink();
    const coord = new AutosaveCoordinator({ queue: q, sink, limitPerTick: 2, intervalMs: 1000, flushTarget: null });
    coord.start();

    await vi.advanceTimersByTimeAsync(3000);
    expect(sink.calls).toHaveLength(0);
    expect(await coord.tick()).toBe(0);
  });

  it('retries a failing unit on a later tick', async () => {
    const q = new DirtySaveQueue();
    const sink = new RecordingSink();
    sink.failKeys.add('b');
    const coord = new AutosaveCoordinator({ queue: q, sink, limitPerTick: 10, intervalMs: 1000, flushTarget: null });
    coord.start();
    coord.markDirty(unit('a'));
    coord.markDirty(unit('b'));

    await vi.advanceTimersByTimeAsync(1000);
    expect(coord.size).toBe(1); // 'b' remains pending

    sink.failKeys.clear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(coord.size).toBe(0);
  });

  it('flush drains all writable units regardless of limit', async () => {
    const q = new DirtySaveQueue();
    const sink = new RecordingSink();
    const coord = new AutosaveCoordinator({ queue: q, sink, limitPerTick: 2, intervalMs: 1000, flushTarget: null });
    coord.start();
    for (let i = 0; i < 5; i++) coord.markDirty(unit(`u${i}`));

    const written = await coord.flush();
    expect(written).toBe(5);
    expect(coord.size).toBe(0);
  });

  it('flush terminates on persistent failure, keeping the unit pending', async () => {
    const q = new DirtySaveQueue();
    const sink = new RecordingSink();
    sink.failKeys.add('bad');
    const coord = new AutosaveCoordinator({ queue: q, sink, limitPerTick: 1, intervalMs: 1000, flushTarget: null });
    coord.start();
    coord.markDirty(unit('bad'));

    const written = await coord.flush();
    expect(written).toBe(0);
    expect(coord.size).toBe(1);
  });

  it('start is idempotent; stop clears interval and listeners; markDirty re-arms', async () => {
    const q = new DirtySaveQueue();
    const sink = new RecordingSink();
    const target = new FakeTarget();
    const coord = new AutosaveCoordinator({ queue: q, sink, limitPerTick: 2, intervalMs: 1000, flushTarget: target });

    coord.start();
    coord.start();
    expect(vi.getTimerCount()).toBe(1);
    expect(target.addCalls).toEqual(['pagehide', 'visibilitychange']);

    coord.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(target.removeCalls).toEqual(['pagehide', 'visibilitychange']);

    coord.markDirty(unit('a'));
    expect(vi.getTimerCount()).toBe(1); // wake-on-dirty re-arms the interval
  });

  it('a pagehide event triggers a best-effort full flush', async () => {
    const q = new DirtySaveQueue();
    const sink = new RecordingSink();
    const target = new FakeTarget();
    const coord = new AutosaveCoordinator({ queue: q, sink, limitPerTick: 2, intervalMs: 1000, flushTarget: target });
    coord.start();
    for (let i = 0; i < 5; i++) coord.markDirty(unit(`u${i}`));

    target.dispatch('pagehide');
    await vi.advanceTimersByTimeAsync(0); // flush the detached promise's microtasks

    expect(coord.size).toBe(0);
    expect(sink.calls).toHaveLength(5);
  });
});
