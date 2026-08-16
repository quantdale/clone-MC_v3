import { describe, it, expect } from 'vitest';
import { DirtySaveQueue, type SaveSink, type SaveUnit } from '../../src/storage/DirtySaveQueue';
import {
  validateSaveSaturationConfig,
  evaluateSaveSaturation,
  runSaveSaturation,
  type SaveQueueSaturationConfig,
} from '../../src/storage/SaveQueueSaturation';

function unit(key: string): SaveUnit {
  return { key, kind: 'world-metadata', worldId: 'a', chunkX: 0, chunkZ: 0, payload: key };
}

function config(overrides: Partial<SaveQueueSaturationConfig> = {}): SaveQueueSaturationConfig {
  return { maxPendingUnits: 10000, maxUnitsPerSecond: 100, iterations: 4, sinkWriteMillis: 5, ...overrides };
}

/** A deterministic sink that records order, can advance a fake clock, and can fail transiently/permanently. */
class TestSink implements SaveSink {
  calls: string[] = [];
  advance: ((ms: number) => void) | null = null;
  sinkWriteMillis = 0;
  failFirst = new Map<string, number>();
  alwaysFail = new Set<string>();

  async write(u: SaveUnit): Promise<void> {
    if (this.advance) this.advance(this.sinkWriteMillis);
    this.calls.push(u.key);
    const remaining = this.failFirst.get(u.key) ?? 0;
    if (this.alwaysFail.has(u.key) || remaining > 0) {
      if (remaining > 0) this.failFirst.set(u.key, remaining - 1);
      throw new Error(`forced failure: ${u.key}`);
    }
  }
}

function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

describe('validateSaveSaturationConfig', () => {
  it('accepts a valid config', () => {
    expect(validateSaveSaturationConfig(config())).toEqual(config());
  });

  it('rejects invalid values naming the field', () => {
    for (const field of ['maxPendingUnits', 'maxUnitsPerSecond', 'iterations', 'sinkWriteMillis'] as const) {
      for (const bad of [0, -1, NaN, Infinity, '5', null, undefined]) {
        expect(() => validateSaveSaturationConfig({ ...config(), [field]: bad } as never)).toThrow(new RegExp(field));
      }
    }
  });

  it('rejects non-object input', () => {
    expect(() => validateSaveSaturationConfig(42)).toThrow(/object/i);
  });
});

describe('evaluateSaveSaturation', () => {
  it('reports the throughput within budget when the achieved rate is at or above the target', () => {
    const report = evaluateSaveSaturation(config({ maxUnitsPerSecond: 100 }), { unitsPerSecond: 200, dropped: 0 });
    expect(report.withinBudget).toBe(true);
    expect(report.entries[0]!.withinBudget).toBe(true);
    expect(report.entries[0]!.dimension).toBe('throughput');
  });

  it('flags a throughput violation when the achieved rate falls below the target', () => {
    const report = evaluateSaveSaturation(config({ maxUnitsPerSecond: 500 }), { unitsPerSecond: 200, dropped: 0 });
    expect(report.withinBudget).toBe(false);
    expect(report.entries[0]!.withinBudget).toBe(false);
    expect(report.entries[0]!.budget).toBe(500);
    expect(report.entries[0]!.actual).toBe(200);
  });

  it('treats malformed actuals as violations', () => {
    for (const bad of [-1, NaN, Infinity] as const) {
      const report = evaluateSaveSaturation(config(), { unitsPerSecond: bad, dropped: 0 });
      expect(report.withinBudget).toBe(false);
    }
  });
});

describe('per-call write limit', () => {
  it('writes at most `limit` units per drain', async () => {
    const q = new DirtySaveQueue();
    for (let i = 0; i < 1000; i++) q.markDirty(unit(`u${i}`));
    const sink = new TestSink();
    const written = await q.drain(sink, 64);
    expect(written).toBe(64);
    expect(sink.calls).toHaveLength(64);
    expect(q.size).toBe(936);
  });

  it('treats a non-positive limit as a no-op', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit('a'));
    const sink = new TestSink();
    expect(await q.drain(sink, 0)).toBe(0);
    expect(await q.drain(sink, -1)).toBe(0);
    expect(await q.drain(sink, NaN)).toBe(0);
    expect(sink.calls).toHaveLength(0);
    expect(q.size).toBe(1);
  });
});

describe('no-loss under a failing sink', () => {
  it('retries a transient failure until every unit is written once', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit('a'));
    q.markDirty(unit('b'));
    q.markDirty(unit('c'));
    const sink = new TestSink();
    sink.failFirst.set('b', 2);

    while (q.size > 0) await q.drain(sink, 64);

    expect(q.size).toBe(0);
    expect(sink.calls.filter((k) => k === 'a')).toHaveLength(1);
    expect(sink.calls.filter((k) => k === 'c')).toHaveLength(1);
    expect(sink.calls.filter((k) => k === 'b')).toHaveLength(3); // 2 failures + 1 success
  });

  it('keeps a permanently failing unit pending (never silently dropped)', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit('a'));
    q.markDirty(unit('b'));
    const sink = new TestSink();
    sink.alwaysFail.add('b');

    for (let i = 0; i < 5; i++) await q.drain(sink, 64);

    expect(q.has('b')).toBe(true);
    expect(q.has('a')).toBe(false);
    expect(sink.calls.filter((k) => k === 'a')).toHaveLength(1);
  });

  it('reports zero units lost through runSaveSaturation even with a failing unit', async () => {
    const clock = fakeClock();
    const q = new DirtySaveQueue();
    const sink = new TestSink();
    sink.alwaysFail.add('b');
    sink.sinkWriteMillis = 5;
    sink.advance = clock.advance;

    const report = await runSaveSaturation(q, sink, [unit('a'), unit('b')], config({ iterations: 2, maxUnitsPerSecond: 10 }), clock.now);

    expect(report.unitsWritten).toBe(1);
    expect(report.unitsLost).toBe(0);
    expect(report.withinBudget).toBe(true);
    expect(q.has('b')).toBe(true);
  });
});

describe('FIFO order and re-mark semantics', () => {
  it('drains in FIFO order and keeps a re-marked unit\'s original position with updated payload', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit('a'));
    q.markDirty(unit('b'));
    q.markDirty(unit('c'));
    q.markDirty({ ...unit('b'), payload: 'updated' });
    const sink = new TestSink();
    await q.drain(sink, 10);

    expect(sink.calls).toEqual(['a', 'b', 'c']);
    expect(q.size).toBe(0);
  });
});

describe('throughput budget', () => {
  it('is within budget when the achieved rate is at or above the target', async () => {
    const clock = fakeClock();
    const q = new DirtySaveQueue();
    const units = Array.from({ length: 200 }, (_, i) => unit(`u${i}`));
    const sink = new TestSink();
    sink.sinkWriteMillis = 5;
    sink.advance = clock.advance;

    const report = await runSaveSaturation(q, sink, units, config({ iterations: 200, maxUnitsPerSecond: 100 }), clock.now);

    expect(report.unitsWritten).toBe(200);
    expect(report.unitsLost).toBe(0);
    expect(report.withinBudget).toBe(true);
    expect(report.unitsPerSecond).toBeGreaterThanOrEqual(100);
  });

  it('flags a violation when the achieved rate falls below the target', async () => {
    const clock = fakeClock();
    const q = new DirtySaveQueue();
    const units = Array.from({ length: 200 }, (_, i) => unit(`u${i}`));
    const sink = new TestSink();
    sink.sinkWriteMillis = 5;
    sink.advance = clock.advance;

    const report = await runSaveSaturation(q, sink, units, config({ iterations: 200, maxUnitsPerSecond: 5000 }), clock.now);

    expect(report.withinBudget).toBe(false);
    expect(report.entries[0]!.withinBudget).toBe(false);
  });
});

describe('bounded pending', () => {
  it('drops over-cap marks so pending units never exceed the cap, and drains all accepted units', async () => {
    const clock = fakeClock();
    const q = new DirtySaveQueue();
    const units = Array.from({ length: 2000 }, (_, i) => unit(`u${i}`));
    const sink = new TestSink();
    sink.sinkWriteMillis = 1;
    sink.advance = clock.advance;

    const report = await runSaveSaturation(q, sink, units, config({ iterations: 2000, maxPendingUnits: 1000 }), clock.now);

    expect(report.dropped).toBe(1000);
    expect(report.unitsWritten).toBe(1000);
    expect(report.unitsLost).toBe(0);
    expect(q.size).toBe(0);
  });
});

describe('determinism', () => {
  it('produces identical write sequences and counts for identical units, sinks, and scripted clocks', async () => {
    const run = async () => {
      const clock = fakeClock();
      const q = new DirtySaveQueue();
      const sink = new TestSink();
      sink.sinkWriteMillis = 3;
      sink.advance = clock.advance;
      sink.failFirst.set('b', 1);
      const report = await runSaveSaturation(
        q,
        sink,
        [unit('a'), unit('b'), unit('c'), unit('d')],
        config({ iterations: 4 }),
        clock.now,
      );
      return { calls: sink.calls.join(','), written: report.unitsWritten, lost: report.unitsLost };
    };
    expect(await run()).toEqual(await run());
  });
});
