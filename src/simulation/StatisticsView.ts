import {
  DEFAULT_STATISTIC_KEYS,
  type StatisticKey,
  type StatisticStore,
} from './StatisticsFramework';

/**
 * Statistics view rows (271): the pure UI projection over a `StatisticStore`.
 * `describeStatistics` returns one row per known key in catalog order with a
 * human-readable label and a formatted value (`statisticsSnapshot` stays the
 * data copy; this module owns presentation only). 205's HUD and the 271
 * panel both consume these rows.
 */

/** Ticks per second of the canonical fixed clock (044). */
export const STATISTICS_TICKS_PER_SECOND = 20;

/** Readable label for one statistic key. */
export const STATISTIC_LABELS: Readonly<Record<StatisticKey, string>> = {
  walk_distance: 'Distance Walked',
  blocks_broken: 'Blocks Mined',
  mob_kills: 'Mob Kills',
  deaths: 'Deaths',
  time_played: 'Time Played',
  damage_taken: 'Damage Taken',
  jumps: 'Jumps',
};

/** One rendered statistics row: key, label, raw value, display text. */
export interface StatisticRowView {
  readonly key: StatisticKey;
  readonly label: string;
  readonly value: number;
  readonly valueText: string;
}

/**
 * Format one statistic value for display. Walk distance renders in meters;
 * time played (fixed ticks) renders as a human duration (`45s`, `3m 05s`,
 * `2h 14m`); every other counter renders as its plain integer. Non-finite
 * or negative inputs render as `0`-shaped text and never throw.
 */
export function formatStatisticValue(key: StatisticKey, value: number): string {
  const safe = Number.isInteger(value) && value >= 0 ? value : 0;
  if (key === 'walk_distance') return `${safe} m`;
  if (key === 'time_played') return formatPlayTicks(safe);
  return `${safe}`;
}

/** Format fixed-tick play time as `45s`, `3m 05s`, or `2h 14m`. */
export function formatPlayTicks(ticks: number): string {
  const totalSeconds = Math.floor(ticks / STATISTICS_TICKS_PER_SECOND);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/**
 * Describe every known statistic in catalog order. The returned array and
 * rows are fresh (mutating them cannot affect the store).
 */
export function describeStatistics(store: StatisticStore): StatisticRowView[] {
  return DEFAULT_STATISTIC_KEYS.map((key) => {
    const value = store[key];
    return {
      key,
      label: STATISTIC_LABELS[key],
      value,
      valueText: formatStatisticValue(key, value),
    };
  });
}
