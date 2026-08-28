import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STATISTIC_KEYS,
  STATISTICS_VERSION,
  applyStatisticEvent,
  createStatisticStore,
  deserializeStatisticStore,
  getStatistic,
  incrementStatistic,
  serializeStatisticStore,
  statisticsSnapshot,
  type StatisticStore,
} from '../../src/simulation/StatisticsFramework';

describe('statistics store basics', () => {
  it('starts every known statistic at 0', () => {
    const store = createStatisticStore();
    expect(DEFAULT_STATISTIC_KEYS.length).toBe(7);
    for (const key of DEFAULT_STATISTIC_KEYS) {
      expect(getStatistic(store, key)).toBe(0);
    }
  });

  it('increments accumulate and return a new store', () => {
    const store = createStatisticStore();
    const once = incrementStatistic(store, 'mob_kills', 1);
    expect(getStatistic(once, 'mob_kills')).toBe(1);
    expect(getStatistic(store, 'mob_kills')).toBe(0); // original untouched (immutable)
    const twice = incrementStatistic(once, 'mob_kills', 2);
    expect(getStatistic(twice, 'mob_kills')).toBe(3);
  });

  it('invalid increments are identity no-ops (non-finite or non-positive)', () => {
    const store = createStatisticStore();
    expect(incrementStatistic(store, 'jumps', 0)).toBe(store);
    expect(incrementStatistic(store, 'jumps', -5)).toBe(store);
    expect(incrementStatistic(store, 'jumps', Number.NaN)).toBe(store);
    expect(incrementStatistic(store, 'jumps', Number.POSITIVE_INFINITY)).toBe(store);
  });
});

describe('event hooks', () => {
  it('maps every gameplay event to its counter', () => {
    let store = createStatisticStore();
    store = applyStatisticEvent(store, { type: 'walk', distance: 3.7 });
    store = applyStatisticEvent(store, { type: 'kill_mob', mobKey: 'zombie' });
    store = applyStatisticEvent(store, { type: 'break_block', blockKey: 'stone' });
    store = applyStatisticEvent(store, { type: 'damage', amount: 4 });
    store = applyStatisticEvent(store, { type: 'jump' });
    store = applyStatisticEvent(store, { type: 'play_tick' });
    expect(getStatistic(store, 'walk_distance')).toBe(3); // floored to meters
    expect(getStatistic(store, 'mob_kills')).toBe(1);
    expect(getStatistic(store, 'blocks_broken')).toBe(1);
    expect(getStatistic(store, 'damage_taken')).toBe(4);
    expect(getStatistic(store, 'jumps')).toBe(1);
    expect(getStatistic(store, 'time_played')).toBe(1);
    expect(getStatistic(store, 'deaths')).toBe(0);
  });

  it('records deaths and ignores a non-positive walk distance (identity)', () => {
    let store = createStatisticStore();
    store = applyStatisticEvent(store, { type: 'death' });
    expect(getStatistic(store, 'deaths')).toBe(1);
    const after = applyStatisticEvent(store, { type: 'walk', distance: -2 });
    expect(after).toBe(store);
  });
});

describe('UI projection', () => {
  it('is a plain copy that cannot mutate the store', () => {
    const store = createStatisticStore();
    const snapshot = statisticsSnapshot(store);
    expect(snapshot).toEqual(store);
    (snapshot as { mob_kills: number }).mob_kills = 99;
    expect(getStatistic(store, 'mob_kills')).toBe(0);
  });
});

describe('persistence', () => {
  it('serializes and deserializes round-trip', () => {
    let store: StatisticStore = createStatisticStore();
    store = applyStatisticEvent(store, { type: 'kill_mob', mobKey: 'pig' });
    store = applyStatisticEvent(store, { type: 'play_tick' });
    const serialized = serializeStatisticStore(store);
    expect(serialized.version).toBe(STATISTICS_VERSION);
    expect(deserializeStatisticStore(serialized)).toEqual(store);
  });

  it('rejects malformed payloads', () => {
    expect(() => deserializeStatisticStore(null)).toThrow();
    expect(() => deserializeStatisticStore({ version: 2 })).toThrow(/unsupported version/);
    expect(() =>
      deserializeStatisticStore({ version: 1, statistics: { mob_kills: -1 } }),
    ).toThrow();
    expect(() =>
      deserializeStatisticStore({ version: 1, statistics: { mob_kills: 1.5 } }),
    ).toThrow();
    expect(() =>
      deserializeStatisticStore({ version: 1, statistics: { not_a_stat: 1 } }),
    ).toThrow(); // missing known keys is malformed
    // All known keys PLUS an unknown key trips the unknown-key rejection specifically.
    expect(() =>
      deserializeStatisticStore({
        version: 1,
        statistics: {
          walk_distance: 0,
          mob_kills: 0,
          blocks_broken: 0,
          deaths: 0,
          time_played: 0,
          damage_taken: 0,
          jumps: 0,
          not_a_stat: 1,
        },
      }),
    ).toThrow(/unknown statistic key/);
  });
});
