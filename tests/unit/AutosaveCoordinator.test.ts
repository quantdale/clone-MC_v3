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

  it('waits for an in-flight failed tick and keeps the failed unit pending', async () => {
    const q = new DirtySaveQueue();
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writing = new Promise<void>((resolve) => { started = resolve; });
    let attempts = 0;
    const sink: SaveSink = {
      async write() {
        attempts++;
        if (attempts === 1) { started(); await gate; }
        throw new Error('persistent failure');
      },
    };
    const coord = new AutosaveCoordinator({ queue: q, sink, flushTarget: null });
    coord.markDirty(unit('bad'));
    const tick = coord.tick();
    await writing;
    let completed = false;
    const flush = coord.flush().then((written) => { completed = true; return written; });
    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);
    release();
    expect(await tick).toBe(0);
    expect(await flush).toBe(0);
    expect(q.keys()).toEqual(['bad']);
    coord.stop();
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

  it('flush is hard-bounded under continuous concurrent marking (SAVE-FAIL-4)', async () => {
    const q = new DirtySaveQueue();
    const calls: string[] = [];
    // A hostile sink that marks a fresh unit on every successful write: each
    // drain round makes progress, so only the round cap can end the flush.
    const sink: SaveSink = {
      async write(u: SaveUnit): Promise<void> {
        calls.push(u.key);
        if (calls.length <= 500) q.markDirty(unit(`spawned-${calls.length}`));
      },
    };
    const coord = new AutosaveCoordinator({ queue: q, sink, limitPerTick: 1, intervalMs: 1000, flushTarget: null });
    coord.start();
    coord.markDirty(unit('seed'));

    const written = await coord.flush(); // must terminate, not spin forever
    expect(written).toBe(128); // FLUSH_MAX_ROUNDS × limitPerTick(1)
    expect(coord.size).toBeGreaterThan(0); // excess units remain queued for later ticks
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

  it('suppresses overlapping tick() during flush and waits for all writes to settle (REQ-AFD-1)', async () => {
    const q = new DirtySaveQueue();
    let slowRelease!: () => void;
    const slowGate = new Promise<void>((resolve) => { slowRelease = resolve; });
    let tickPromise: Promise<number> | null = null;
    let tickFinished = false;
    const holder: { coord?: AutosaveCoordinator } = {};

    const sink: SaveSink = {
      async write(u: SaveUnit): Promise<void> {
        if (u.key === 'b') {
          tickPromise = holder.coord!.tick().then((v) => {
            tickFinished = true;
            return v;
          });
        }
        if (u.key === 'c') {
          await slowGate;
        }
      },
    };

    const coord = new AutosaveCoordinator({ queue: q, sink, limitPerTick: 2, intervalMs: 1000, flushTarget: null });
    holder.coord = coord;
    coord.markDirty(unit('a'));
    coord.markDirty(unit('b'));
    coord.markDirty(unit('c'));

    let flushFinished = false;
    const flushPromise = coord.flush().then((n) => {
      flushFinished = true;
      return n;
    });

    try {
      for (let i = 0; i < 16; i++) await Promise.resolve();

      expect(tickPromise).not.toBeNull();
      expect(tickFinished).toBe(true);
      expect(flushFinished).toBe(false);
      expect(q.outstandingSize).toBe(1);

      slowRelease();
      expect(await tickPromise!).toBe(0);
      expect(await flushPromise).toBe(3);
      expect(coord.size).toBe(0);
    } finally {
      slowRelease();
    }
  });

  it('settles external in-flight drain between rounds and retries on failure (REQ-AFD-1)', async () => {
    const q = new DirtySaveQueue();
    let slowRelease!: () => void;
    const slowGate = new Promise<void>((resolve) => { slowRelease = resolve; });
    let externalDrain: Promise<unknown> | null = null;
    let cAttempts = 0;

    const sink: SaveSink = {
      async write(u: SaveUnit): Promise<void> {
        if (u.key === 'b' && externalDrain === null) {
          externalDrain = q.drainReport(sink, 2);
        }
        if (u.key === 'c') {
          cAttempts++;
          if (cAttempts === 1) {
            await slowGate;
            throw new Error('transient external drain failure');
          }
        }
      },
    };

    const coord = new AutosaveCoordinator({ queue: q, sink, limitPerTick: 2, intervalMs: 1000, flushTarget: null });
    coord.markDirty(unit('a'));
    coord.markDirty(unit('b'));
    coord.markDirty(unit('c'));

    let flushFinished = false;
    const flushPromise = coord.flush().then((n) => {
      flushFinished = true;
      return n;
    });

    for (let i = 0; i < 16; i++) await Promise.resolve();

    expect(externalDrain).not.toBeNull();
    expect(flushFinished).toBe(false);
    expect(q.outstandingSize).toBe(1);

    slowRelease();
    await flushPromise;
    await externalDrain;

    expect(cAttempts).toBe(2);
    expect(q.outstandingSize).toBe(0);
    expect(coord.size).toBe(0);
  });

  it('serializes concurrent flush() calls sequentially without early completion (REQ-AFD-2)', async () => {
    const q = new DirtySaveQueue();
    let releaseA!: () => void;
    let startedA!: () => void;
    let releaseB!: () => void;
    let startedB!: () => void;
    const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
    const waitA = new Promise<void>((resolve) => { startedA = resolve; });
    const gateB = new Promise<void>((resolve) => { releaseB = resolve; });
    const waitB = new Promise<void>((resolve) => { startedB = resolve; });
    const written: string[] = [];

    const sink: SaveSink = {
      async write(u: SaveUnit): Promise<void> {
        if (u.key === 'a') {
          startedA();
          await gateA;
        }
        if (u.key === 'b') {
          startedB();
          await gateB;
        }
        written.push(u.key);
      },
    };

    const coord = new AutosaveCoordinator({ queue: q, sink, limitPerTick: 1, intervalMs: 1000, flushTarget: null });
    coord.markDirty(unit('a'));

    const first = coord.flush();
    await waitA;

    coord.markDirty(unit('b'));
    let secondFinished = false;
    const second = coord.flush().then((n) => {
      secondFinished = true;
      return n;
    });

    releaseA();
    await waitB;
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(secondFinished).toBe(false);

    releaseB();
    const [w1, w2] = await Promise.all([first, second]);
    expect(w1 + w2).toBe(2);
    expect(written).toEqual(['a', 'b']);
    expect(coord.size).toBe(0);
  });
});
