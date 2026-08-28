import { describe, it, expect } from 'vitest';
import {
  ReplayRecordingError,
  ReplayRecorder,
  validateReplayRecording,
  type ReplayRecording,
} from '../../src/simulation/ReplayRecording';

function validBase(overrides: Partial<ReplayRecording> = {}): ReplayRecording {
  return {
    version: 1,
    schema: 'schema-x',
    initialSeed: 42,
    maxTick: 3,
    inputs: [],
    tickSeeds: [
      { tick: 1, seeds: [{ stream: 'mob-spawn', state: 100 }] },
      { tick: 2, seeds: [{ stream: 'mob-spawn', state: 200 }] },
      { tick: 3, seeds: [{ stream: 'mob-spawn', state: 300 }] },
    ],
    ...overrides,
  };
}

describe('ReplayRecording: recording shape validation', () => {
  it('accepts a well-formed recording unchanged', () => {
    const rec = validBase();
    expect(validateReplayRecording(rec)).toEqual(rec);
  });

  it('rejects invalid top-level fields with a descriptive error', () => {
    expect(() => validateReplayRecording(validBase({ version: 0 }))).toThrow(ReplayRecordingError);
    expect(() => validateReplayRecording(validBase({ schema: '' }))).toThrow(ReplayRecordingError);
    expect(() => validateReplayRecording(validBase({ initialSeed: -1 }))).toThrow(ReplayRecordingError);
    expect(() => validateReplayRecording(validBase({ initialSeed: 1.5 }))).toThrow(ReplayRecordingError);
    expect(() => validateReplayRecording(validBase({ initialSeed: 0x100000000 }))).toThrow(ReplayRecordingError);
    expect(() => validateReplayRecording(validBase({ maxTick: 0 }))).toThrow(ReplayRecordingError);
  });

  it('names the offending field in errors', () => {
    expect(() => validateReplayRecording(validBase({ version: 0 }))).toThrow(/version/);
    expect(() => validateReplayRecording(validBase({ initialSeed: -1 }))).toThrow(/initialSeed/);
    expect(() => validateReplayRecording(validBase({ maxTick: 0 }))).toThrow(/maxTick/);
  });
});

describe('ReplayRecording: input event validation', () => {
  it('rejects malformed inputs', () => {
    expect(() =>
      validateReplayRecording(validBase({ inputs: [{ tick: 1, seq: -1, type: 'x', payload: 1 }] })),
    ).toThrow(/seq/);
    expect(() =>
      validateReplayRecording(validBase({ inputs: [{ tick: 4, seq: 0, type: 'x', payload: 1 }] })),
    ).toThrow(/tick/);
    expect(() =>
      validateReplayRecording(validBase({ inputs: [{ tick: 1, seq: 0, type: '', payload: 1 }] })),
    ).toThrow(/type/);
    expect(() =>
      validateReplayRecording(validBase({ inputs: [{ tick: 1, seq: 0, type: 'x', payload: () => 1 }] })),
    ).toThrow(ReplayRecordingError);
  });

  it('rejects unordered or duplicate inputs', () => {
    const unordered = validBase({
      inputs: [
        { tick: 2, seq: 0, type: 'a', payload: 1 },
        { tick: 1, seq: 0, type: 'a', payload: 1 },
      ],
    });
    expect(() => validateReplayRecording(unordered)).toThrow(/sorted/);
    const dup = validBase({
      inputs: [
        { tick: 1, seq: 0, type: 'a', payload: 1 },
        { tick: 1, seq: 0, type: 'a', payload: 1 },
      ],
    });
    expect(() => validateReplayRecording(dup)).toThrow(/duplicate/);
  });
});

describe('ReplayRecording: full tick-seed coverage and validation', () => {
  it('rejects a missing tick seed', () => {
    const rec = validBase();
    const missing = { ...rec, tickSeeds: rec.tickSeeds.slice(0, 2) };
    expect(() => validateReplayRecording(missing)).toThrow(/missing_seed/);
  });

  it('rejects a duplicate or extra tick', () => {
    const rec = validBase();
    const dup = {
      ...rec,
      tickSeeds: [rec.tickSeeds[0]!, rec.tickSeeds[0]!, rec.tickSeeds[2]!],
    };
    expect(() => validateReplayRecording(dup)).toThrow(ReplayRecordingError);
    const extra = {
      ...rec,
      tickSeeds: [...rec.tickSeeds, { tick: 4, seeds: [{ stream: 'a', state: 1 }] }],
    };
    expect(() => validateReplayRecording(extra)).toThrow(ReplayRecordingError);
  });

  it('rejects a duplicate stream name within a tick', () => {
    const rec = validBase({
      tickSeeds: [{ tick: 1, seeds: [{ stream: 'a', state: 1 }, { stream: 'a', state: 2 }] }],
    });
    expect(() => validateReplayRecording(rec)).toThrow(/duplicate stream/);
  });

  it('rejects out-of-range state or unordered ticks', () => {
    const rec = validBase({ tickSeeds: [{ tick: 1, seeds: [{ stream: 'a', state: 0x100000000 }] }] });
    expect(() => validateReplayRecording(rec)).toThrow(ReplayRecordingError);
    const unordered = validBase({
      tickSeeds: [
        { tick: 2, seeds: [{ stream: 'a', state: 1 }] },
        { tick: 1, seeds: [{ stream: 'a', state: 1 }] },
      ],
    });
    expect(() => validateReplayRecording(unordered)).toThrow(/sorted/);
  });
});

describe('ReplayRecording: deterministic recorder capture', () => {
  it('captures inputs and seeds and reproduces a valid recording', () => {
    const r = new ReplayRecorder({ initialSeed: 5, maxTick: 2, schema: 'cap' });
    r.recordInput({ tick: 0, seq: 0, type: 'setup', payload: { v: 1 } });
    r.recordTickSeed(1, [{ stream: 'alpha', state: 11 }]);
    r.recordTickSeed(2, [{ stream: 'alpha', state: 22 }]);
    const rec = r.capture();
    expect(rec.version).toBe(1);
    expect(rec.schema).toBe('cap');
    expect(rec.initialSeed).toBe(5);
    expect(rec.maxTick).toBe(2);
    expect(rec.inputs).toEqual([{ tick: 0, seq: 0, type: 'setup', payload: { v: 1 } }]);
    expect(rec.tickSeeds).toEqual([
      { tick: 1, seeds: [{ stream: 'alpha', state: 11 }] },
      { tick: 2, seeds: [{ stream: 'alpha', state: 22 }] },
    ]);
  });

  it('captures the same scenario twice into structurally equal recordings', () => {
    const build = () => {
      const r = new ReplayRecorder({ initialSeed: 9, maxTick: 2, schema: 'cap2' });
      r.recordTickSeed(1, [{ stream: 'alpha', state: 100 }]);
      r.recordInput({ tick: 1, seq: 0, type: 'move', payload: { dx: 1 } });
      r.recordTickSeed(2, [{ stream: 'alpha', state: 200 }]);
      return r.capture();
    };
    expect(build()).toEqual(build());
  });

  it('throws on capture when the accumulated state is invalid', () => {
    const r = new ReplayRecorder({ initialSeed: 1, maxTick: 2, schema: 'bad' });
    r.recordTickSeed(1, [{ stream: 'a', state: 1 }]);
    // missing tick 2 seed
    expect(() => r.capture()).toThrow(/missing_seed/);
  });
});
