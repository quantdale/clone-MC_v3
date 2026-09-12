import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STATISTIC_KEYS,
  createStatisticStore,
  incrementStatistic,
} from '../../src/simulation/StatisticsFramework';
import {
  STATISTIC_LABELS,
  describeStatistics,
  formatPlayTicks,
  formatStatisticValue,
} from '../../src/simulation/StatisticsView';

/**
 * Oracles for the statistics view rows (271): catalog order, readable
 * labels, and value formatting (meters, human durations, plain integers).
 * Pure and headless: no DOM, no Game.
 */

describe('StatisticsView (271)', () => {
  it('describes 7 rows in catalog order with labels and values', () => {
    const rows = describeStatistics(createStatisticStore());
    expect(rows.map((r) => r.key)).toEqual([...DEFAULT_STATISTIC_KEYS]);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.value === 0)).toBe(true);
    expect(rows.map((r) => r.label)).toEqual([
      'Distance Walked',
      'Mob Kills',
      'Blocks Mined',
      'Deaths',
      'Time Played',
      'Damage Taken',
      'Jumps',
    ]);
  });

  it('labels cover every known key exactly once', () => {
    expect(Object.keys(STATISTIC_LABELS).sort()).toEqual([...DEFAULT_STATISTIC_KEYS].sort());
    expect(new Set(Object.values(STATISTIC_LABELS)).size).toBe(DEFAULT_STATISTIC_KEYS.length);
  });

  it('rows carry live values and formatted text', () => {
    let store = createStatisticStore();
    store = incrementStatistic(store, 'walk_distance', 12);
    store = incrementStatistic(store, 'blocks_broken', 3);
    store = incrementStatistic(store, 'time_played', 20 * 65);
    const rows = describeStatistics(store);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get('walk_distance')).toMatchObject({ value: 12, valueText: '12 m' });
    expect(byKey.get('blocks_broken')).toMatchObject({ value: 3, valueText: '3' });
    expect(byKey.get('time_played')).toMatchObject({ value: 1300, valueText: '1m 05s' });
  });

  it('formats play ticks as seconds, minutes, hours', () => {
    expect(formatPlayTicks(0)).toBe('0s');
    expect(formatPlayTicks(20 * 45)).toBe('45s');
    expect(formatPlayTicks(20 * 59)).toBe('59s');
    expect(formatPlayTicks(20 * 60)).toBe('1m 00s');
    expect(formatPlayTicks(20 * 65)).toBe('1m 05s');
    expect(formatPlayTicks(20 * 3599)).toBe('59m 59s');
    expect(formatPlayTicks(20 * 3600)).toBe('1h 00m');
    expect(formatPlayTicks(20 * (2 * 3600 + 14 * 60))).toBe('2h 14m');
  });

  it('floors sub-second ticks and never throws on bad input', () => {
    expect(formatStatisticValue('time_played', 19)).toBe('0s');
    expect(formatStatisticValue('walk_distance', NaN)).toBe('0 m');
    expect(formatStatisticValue('mob_kills', -3)).toBe('0');
    expect(formatStatisticValue('deaths', 1.9)).toBe('0');
    expect(formatStatisticValue('jumps', Infinity)).toBe('0');
  });

  it('returns fresh rows that cannot alias the store', () => {
    const store = createStatisticStore();
    const first = describeStatistics(store);
    const second = describeStatistics(store);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
  });
});
