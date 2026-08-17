import { describe, it, expect } from 'vitest';
import {
  REPLAY_RECORDING_VERSION,
  ReplayRecorder,
  validateReplayRecording,
  type ReplayRecording,
  type ReplayStreamState,
} from '../../src/simulation/ReplayRecording';
import { SimulationHarness } from '../../src/simulation/SimulationHarness';
import { createStreamHolder, makeCountingSystems, applyInputToSystems } from './replayScenario';

function validRecording(overrides: Partial<ReplayRecording> = {}): ReplayRecording {
  return {
    version: 1,
    schema: 'test/schema',
    initialSeed: 42,
    maxTick: 2,
    inputs: [],
    tickSeeds: [
      { tick: 1, seeds: [{ stream: 'counter', state: 1 }] },
      { tick: 2, seeds: [{ stream: 'counter', state: 2 }] },
    ],
    ...overrides,
  };
}

/** Drive the counting world through a fresh recorder and return the recording + captured states. */
function driveRecorder(options: {
  worldSeed: number;
  maxTick: number;
  schema: string;
  inputsByTick: Array<Array<{ tick: number; seq: number; type: string; payload: unknown }>>;
}): { recording: ReplayRecording; capturedStates: ReplayStreamState[][] } {
  const holder = createStreamHolder(options.worldSeed);
  const systems = makeCountingSystems(holder, options.worldSeed);
  const harness = new SimulationHarness({ systems });
  const recorder = new ReplayRecorder({
    initialSeed: options.worldSeed,
    maxTick: options.maxTick,
    schema: options.schema,
  });
  const capturedStates: ReplayStreamState[][] = [];
  for (let tick = 1; tick <= options.maxTick; tick++) {
    const states: ReplayStreamState[] = [
      { stream: 'counter', state: holder.rngFor('counter', options.worldSeed).state },
      { stream: 'ambient', state: holder.rngFor('ambient', options.worldSeed).state },
    ];
    capturedStates.push(states);
    recorder.recordTickSeed(tick, states);
    for (const event of options.inputsByTick[tick] ?? []) {
      recorder.recordInput(event);
      applyInputToSystems(systems, event);
    }
    harness.step(1);
  }
  return { recording: recorder.capture(), capturedStates };
}

describe('recording shape validation (REC-1)', () => {
  it('accepts a fully-covered valid recording unchanged', () => {
    const recording = validRecording();
    expect(validateReplayRecording(recording)).toEqual(recording);
  });

  it('rejects invalid top-level fields naming the offending field', () => {
    expect(() => validateReplayRecording(null)).toThrow(/ReplayRecording: expected an object/);
    expect(() => validateReplayRecording(validRecording({ version: 0 }))).toThrow(/version must be a positive integer/);
    expect(() => validateReplayRecording(validRecording({ schema: '' }))).toThrow(/schema must be a non-empty string/);
    expect(() => validateReplayRecording(validRecording({ initialSeed: -1 }))).toThrow(/initialSeed must be a uint32/);
    expect(() => validateReplayRecording(validRecording({ initialSeed: 1.5 }))).toThrow(/initialSeed must be a uint32/);
    expect(() => validateReplayRecording(validRecording({ maxTick: 0 }))).toThrow(/maxTick must be a positive integer/);
    expect(() => validateReplayRecording(validRecording({ inputs: 'x' }))).toThrow(/inputs must be an array/);
    expect(() => validateReplayRecording(validRecording({ tickSeeds: 'x' }))).toThrow(/tickSeeds must be an array/);
  });
});

describe('input event validation (REC-2)', () => {
  it('rejects malformed input events naming the event index and field', () => {
    const base = { tick: 1, seq: 0, type: 'add', payload: { amount: 1 } };
    expect(() => validateReplayRecording(validRecording({ inputs: [{ ...base, seq: -1 }] }))).toThrow(
      /inputs 0\.seq must be a non-negative integer/,
    );
    expect(() => validateReplayRecording(validRecording({ inputs: [{ ...base, tick: 3 }] }))).toThrow(
      /inputs 0\.tick must be an integer in \[0, maxTick\]/,
    );
    expect(() => validateReplayRecording(validRecording({ inputs: [{ ...base, tick: 1.5 }] }))).toThrow(
      /inputs 0\.tick must be an integer/,
    );
    expect(() => validateReplayRecording(validRecording({ inputs: [{ ...base, type: '' }] }))).toThrow(
      /inputs 0\.type must be a non-empty string/,
    );
    expect(() => validateReplayRecording(validRecording({ inputs: [{ ...base, payload: () => 1 }] }))).toThrow(
      /inputs 0\.payload must be JSON-serializable plain data/,
    );
  });

  it('rejects unordered and duplicate inputs', () => {
    const a = { tick: 1, seq: 0, type: 'add', payload: { amount: 1 } };
    const b = { tick: 1, seq: 1, type: 'add', payload: { amount: 2 } };
    expect(() => validateReplayRecording(validRecording({ inputs: [b, a] }))).toThrow(
      /inputs must be sorted ascending by \(tick, seq\)/,
    );
    expect(() => validateReplayRecording(validRecording({ inputs: [a, a] }))).toThrow(
      /duplicate input event/,
    );
  });
});

describe('full tick-seed coverage and validation (REC-3)', () => {
  it('rejects a missing tick seed with a missing_seed-class error', () => {
    const recording = validRecording({
      maxTick: 3,
      tickSeeds: [
        { tick: 1, seeds: [{ stream: 'a', state: 1 }] },
        { tick: 2, seeds: [{ stream: 'a', state: 2 }] },
      ],
    });
    expect(() => validateReplayRecording(recording)).toThrow(/missing_seed — no tick seed for tick 3/);
  });

  it('rejects duplicate streams within a tick', () => {
    const recording = validRecording({
      tickSeeds: [
        { tick: 1, seeds: [{ stream: 'a', state: 1 }, { stream: 'a', state: 2 }] },
        { tick: 2, seeds: [{ stream: 'a', state: 2 }] },
      ],
    });
    expect(() => validateReplayRecording(recording)).toThrow(/duplicate stream 'a'/);
  });

  it('rejects out-of-range stream states', () => {
    expect(() =>
      validateReplayRecording(
        validRecording({ tickSeeds: [{ tick: 1, seeds: [{ stream: 'a', state: 0x100000000 }] }, { tick: 2, seeds: [{ stream: 'a', state: 2 }] }] }),
      ),
    ).toThrow(/state must be a uint32/);
    expect(() =>
      validateReplayRecording(
        validRecording({ tickSeeds: [{ tick: 1, seeds: [{ stream: 'a', state: -1 }] }, { tick: 2, seeds: [{ stream: 'a', state: 2 }] }] }),
      ),
    ).toThrow(/state must be a uint32/);
  });

  it('rejects unordered, duplicate, and extra tick seeds', () => {
    const tick1 = { tick: 1, seeds: [{ stream: 'a', state: 1 }] };
    const tick2 = { tick: 2, seeds: [{ stream: 'a', state: 2 }] };
    expect(() => validateReplayRecording(validRecording({ tickSeeds: [tick2, tick1] }))).toThrow(
      /tickSeeds must be sorted ascending by tick/,
    );
    expect(() => validateReplayRecording(validRecording({ tickSeeds: [tick1, tick1] }))).toThrow(
      /duplicate tick seed for tick 1/,
    );
    expect(() => validateReplayRecording(validRecording({ tickSeeds: [tick1, tick2, { tick: 3, seeds: [{ stream: 'a', state: 3 }] }] }))).toThrow(
      /tick should be an integer in \[1, maxTick\]/,
    );
    expect(() =>
      validateReplayRecording(validRecording({ tickSeeds: [{ tick: 0, seeds: [{ stream: 'a', state: 0 }] }, tick2] })),
    ).toThrow(/tick should be an integer in \[1, maxTick\]/);
  });

  it('rejects atomically: no partial result and the input object is unchanged', () => {
    const recording = validRecording({ maxTick: 3 });
    const before = JSON.stringify(recording);
    expect(() => validateReplayRecording(recording)).toThrow(/missing_seed/);
    expect(JSON.stringify(recording)).toBe(before);
  });
});

describe('deterministic recorder capture (REC-5)', () => {
  const events = [
    { tick: 1, seq: 0, type: 'add', payload: { amount: 5 } },
    { tick: 2, seq: 0, type: 'set', payload: { value: 100 } },
  ];

  it('captures inputs equal to the recorded events and seeds equal to actual stream states', () => {
    const { recording, capturedStates } = driveRecorder({
      worldSeed: 42,
      maxTick: 2,
      schema: 'recorder/test',
      inputsByTick: [[], events, []],
    });
    expect(recording.version).toBe(REPLAY_RECORDING_VERSION);
    expect(recording.inputs).toEqual(events);
    for (let t = 0; t < recording.tickSeeds.length; t++) {
      const tickSeed = recording.tickSeeds[t] as { tick: number; seeds: ReplayStreamState[] };
      expect(tickSeed.tick).toBe(t + 1);
      expect(tickSeed.seeds).toEqual(capturedStates[t]);
    }
  });

  it('capturing the same scenario twice yields structurally equal recordings', () => {
    const a = driveRecorder({ worldSeed: 42, maxTick: 3, schema: 'recorder/determinism', inputsByTick: [[], events, [], []] });
    const b = driveRecorder({ worldSeed: 42, maxTick: 3, schema: 'recorder/determinism', inputsByTick: [[], events, [], []] });
    expect(b.recording).toEqual(a.recording);
  });

  it('capture throws on invalid accumulated state rather than emitting a malformed recording', () => {
    const recorder = new ReplayRecorder({ initialSeed: 42, maxTick: 2, schema: 'recorder/bad' });
    recorder.recordTickSeed(1, [{ stream: 'a', state: 1 }]);
    // Missing tick 2 seed: capture must throw.
    expect(() => recorder.capture()).toThrow(/missing_seed/);
  });
});