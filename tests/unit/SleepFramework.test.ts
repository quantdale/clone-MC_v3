import { describe, it, expect } from 'vitest';
import {
  DAY_TICKS,
  NIGHT_END_TICK,
  NIGHT_START_TICK,
  canSkipNight,
  canSleep,
  createDefaultSleepState,
  deserializeSleepState,
  enterBed,
  isNight,
  leaveBed,
  serializeSleepState,
  skipNight,
  spawnPoint,
  type SleepState,
} from '../../src/simulation/SleepFramework';

describe('night window and sleep permission', () => {
  it('pins the night window boundaries', () => {
    expect(NIGHT_START_TICK).toBe(12542);
    expect(NIGHT_END_TICK).toBe(23459);
    expect(DAY_TICKS).toBe(24000);
    expect(isNight(12541)).toBe(false);
    expect(isNight(12542)).toBe(true);
    expect(isNight(23459)).toBe(true);
    expect(isNight(23460)).toBe(false);
    expect(isNight(0)).toBe(false);
  });

  it('allows sleep at night and during any storm', () => {
    expect(canSleep(12542, false)).toBe(true);
    expect(canSleep(23459, false)).toBe(true);
    expect(canSleep(10000, false)).toBe(false);
    expect(canSleep(10000, true)).toBe(true);
    expect(canSleep(0, true)).toBe(true);
  });
});

describe('bed entry', () => {
  it('defaults to awake with no spawn point', () => {
    expect(createDefaultSleepState()).toEqual({ sleeping: false, spawnSet: false, spawn: [0, 0, 0] });
  });

  it('enters a free bed, setting sleeping and the spawn point', () => {
    const result = enterBed(createDefaultSleepState(), [10, 64, -5], false);
    expect(result).toEqual({
      ok: true,
      state: { sleeping: true, spawnSet: true, spawn: [10, 64, -5] },
    });
  });

  it('rejects an occupied bed', () => {
    expect(enterBed(createDefaultSleepState(), [10, 64, -5], true)).toEqual({
      ok: false,
      reason: 'occupied',
    });
  });

  it('identity-no-ops when re-entering the same bed', () => {
    const sleeping = enterBed(createDefaultSleepState(), [10, 64, -5], false);
    if (!sleeping.ok) throw new Error('unreachable');
    expect(enterBed(sleeping.state, [10, 64, -5], true)).toEqual({ ok: true, state: sleeping.state });
  });
});

describe('leaving a bed', () => {
  it('wakes up but keeps the spawn point', () => {
    const sleeping = enterBed(createDefaultSleepState(), [10, 64, -5], false);
    if (!sleeping.ok) throw new Error('unreachable');
    expect(leaveBed(sleeping.state)).toEqual({
      sleeping: false,
      spawnSet: true,
      spawn: [10, 64, -5],
    });
  });

  it('identity-no-ops when already awake', () => {
    const state = createDefaultSleepState();
    expect(leaveBed(state)).toBe(state);
  });
});

describe('spawn query', () => {
  it('returns null until set, then the bed position', () => {
    expect(spawnPoint(createDefaultSleepState())).toBeNull();
    const sleeping = enterBed(createDefaultSleepState(), [1, 2, 3], false);
    if (!sleeping.ok) throw new Error('unreachable');
    expect(spawnPoint(sleeping.state)).toEqual([1, 2, 3]);
    expect(spawnPoint(leaveBed(sleeping.state))).toEqual([1, 2, 3]);
  });
});

describe('occupancy', () => {
  it('requires all players to sleep', () => {
    expect(canSkipNight(0, 1)).toBe(false);
    expect(canSkipNight(1, 1)).toBe(true);
    expect(canSkipNight(1, 2)).toBe(false);
    expect(canSkipNight(2, 2)).toBe(true);
    expect(canSkipNight(0, 0)).toBe(false);
  });
});

describe('night skip', () => {
  it('skips to morning with the correct tick count', () => {
    expect(skipNight(20000)).toEqual({ timeOfDay: 0, skippedTicks: 4000 });
    expect(skipNight(12542)).toEqual({ timeOfDay: 0, skippedTicks: 11458 });
    expect(skipNight(0)).toEqual({ timeOfDay: 0, skippedTicks: 24000 });
  });
});

describe('persistence', () => {
  it('round-trips states', () => {
    const states: readonly SleepState[] = [
      createDefaultSleepState(),
      { sleeping: true, spawnSet: true, spawn: [1, 2, 3] },
      { sleeping: false, spawnSet: true, spawn: [-10, 64.5, 200] },
    ];
    for (const state of states) {
      expect(deserializeSleepState(serializeSleepState(state))).toEqual(state);
    }
  });

  it('rejects a non-object payload', () => {
    expect(() => deserializeSleepState(null)).toThrow('SleepFramework: expected an object');
    expect(() => deserializeSleepState('sleeping')).toThrow('SleepFramework: expected an object');
  });

  it('rejects an unsupported version', () => {
    expect(() =>
      deserializeSleepState({ version: 0, sleeping: true, spawnSet: true, spawn: [1, 2, 3] }),
    ).toThrow('SleepFramework: unsupported version 0');
  });

  it('rejects non-boolean flags', () => {
    expect(() =>
      deserializeSleepState({ version: 1, sleeping: 'yes', spawnSet: true, spawn: [1, 2, 3] }),
    ).toThrow('SleepFramework: sleeping must be a boolean, got yes');
    expect(() =>
      deserializeSleepState({ version: 1, sleeping: true, spawnSet: 1, spawn: [1, 2, 3] }),
    ).toThrow('SleepFramework: spawnSet must be a boolean, got 1');
  });

  it('rejects a malformed spawn tuple', () => {
    expect(() =>
      deserializeSleepState({ version: 1, sleeping: true, spawnSet: true, spawn: [1, 2] }),
    ).toThrow('SleepFramework: spawn must be an array of three finite numbers');
    expect(() =>
      deserializeSleepState({ version: 1, sleeping: true, spawnSet: true, spawn: [1, NaN, 3] }),
    ).toThrow('SleepFramework: spawn must be an array of three finite numbers');
  });

  it('rejects unknown keys', () => {
    expect(() =>
      deserializeSleepState({
        version: 1,
        sleeping: true,
        spawnSet: true,
        spawn: [1, 2, 3],
        extra: true,
      }),
    ).toThrow('SleepFramework: unknown key extra');
  });
});
