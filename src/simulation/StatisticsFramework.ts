/**
 * Statistics framework (187): the last meta-progression change — typed counters, event hooks, a
 * UI-data projection, and versioned persistence. A `StatisticStore` is an immutable record of
 * non-negative integer counters over the known `DEFAULT_STATISTIC_KEYS`; gameplay events map to
 * counter increments via `applyStatisticEvent`; `statisticsSnapshot` is the plain UI projection
 * (205's HUD consumes it); serialize/deserialize are the validated persistence pair (the 153/184
 * pattern).
 *
 * Determinism rules:
 * - `incrementStatistic` requires a known key and a finite, positive amount; anything else returns
 *   the IDENTICAL store (a cheap no-op).
 * - Event increments are floored to integers (walk distance in meters), so counters always stay
 *   integral and persistence stays lossless.
 * - Deserialization validates the version, the known-key set (unknown keys rejected), and
 *   non-negative integer values before accepting anything.
 */
/** Versioned serialized form; bump with migration rules when the format changes. */
export const STATISTICS_VERSION = 1;

/** The known statistic keys (the framework's typed counter set). */
export const DEFAULT_STATISTIC_KEYS = [
  'walk_distance',
  'mob_kills',
  'blocks_broken',
  'deaths',
  'time_played',
  'damage_taken',
  'jumps',
] as const;

export type StatisticKey = (typeof DEFAULT_STATISTIC_KEYS)[number];

/** Gameplay events that map to counter increments. */
export type StatisticEvent =
  | { type: 'walk'; distance: number }
  | { type: 'kill_mob'; mobKey: string }
  | { type: 'break_block'; blockKey: string }
  | { type: 'death' }
  | { type: 'damage'; amount: number }
  | { type: 'jump' }
  | { type: 'play_tick' };

/** An immutable statistics store: every known key at a non-negative integer count. */
export type StatisticStore = Readonly<Record<StatisticKey, number>>;

/** Versioned serialized statistics store. */
export interface SerializedStatisticStore {
  version: 1;
  statistics: Record<string, number>;
}

/** A fresh store: every known statistic at 0. */
export function createStatisticStore(): StatisticStore {
  const store: Record<string, number> = {};
  for (const key of DEFAULT_STATISTIC_KEYS) {
    store[key] = 0;
  }
  return store as StatisticStore;
}

function isKnownKey(key: string): key is StatisticKey {
  return (DEFAULT_STATISTIC_KEYS as readonly string[]).includes(key);
}

/**
 * Increment a statistic by a finite, positive `amount` (floored to an integer). An unknown key or a
 * non-finite/non-positive amount returns the IDENTICAL store (no-op).
 */
export function incrementStatistic(store: StatisticStore, key: StatisticKey, amount: number): StatisticStore {
  if (!Number.isFinite(amount) || amount <= 0) return store;
  const delta = Math.floor(amount);
  if (delta <= 0) return store;
  if (store[key] + delta === store[key]) return store; // cannot overflow meaningfully
  return { ...store, [key]: store[key] + delta };
}

/** Read one statistic. */
export function getStatistic(store: StatisticStore, key: StatisticKey): number {
  return store[key];
}

/**
 * Apply a gameplay event to the store. Returns a NEW store when something changed, the IDENTICAL
 * store otherwise. Walk/damage amounts are floored (meters / hit points stay integral).
 */
export function applyStatisticEvent(store: StatisticStore, event: StatisticEvent): StatisticStore {
  switch (event.type) {
    case 'walk':
      return incrementStatistic(store, 'walk_distance', event.distance);
    case 'kill_mob':
      return incrementStatistic(store, 'mob_kills', 1);
    case 'break_block':
      return incrementStatistic(store, 'blocks_broken', 1);
    case 'death':
      return incrementStatistic(store, 'deaths', 1);
    case 'damage':
      return incrementStatistic(store, 'damage_taken', event.amount);
    case 'jump':
      return incrementStatistic(store, 'jumps', 1);
    case 'play_tick':
      return incrementStatistic(store, 'time_played', 1);
  }
}

/** The plain UI-data projection (a fresh copy — mutating it cannot affect the store). */
export function statisticsSnapshot(store: StatisticStore): StatisticStore {
  return { ...store };
}

/** Serialize the store (identity-shaped; validation happens on deserialize). */
export function serializeStatisticStore(store: StatisticStore): SerializedStatisticStore {
  return { version: STATISTICS_VERSION as 1, statistics: { ...store } };
}

/**
 * Validate and restore a serialized store. The whole payload is validated first: version, known
 * keys only (unknown keys rejected), non-negative integer values. Any violation throws a
 * descriptive `Error` and nothing is partially accepted.
 */
export function deserializeStatisticStore(input: unknown): StatisticStore {
  if (typeof input !== 'object' || input === null) {
    throw new Error('StatisticStore: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== STATISTICS_VERSION) {
    throw new Error(`StatisticStore: unsupported version ${String(r.version)}`);
  }
  if (typeof r.statistics !== 'object' || r.statistics === null || Array.isArray(r.statistics)) {
    throw new Error('StatisticStore: statistics must be an object');
  }
  const stats = r.statistics as Record<string, unknown>;
  const store: Record<string, number> = {};
  for (const key of DEFAULT_STATISTIC_KEYS) {
    const value = stats[key];
    if (!Number.isInteger(value) || (value as number) < 0) {
      throw new Error(`StatisticStore: ${key} must be a non-negative integer, got ${String(value)}`);
    }
    store[key] = value as number;
  }
  for (const key of Object.keys(stats)) {
    if (!isKnownKey(key)) {
      throw new Error(`StatisticStore: unknown statistic key ${key}`);
    }
  }
  return store as StatisticStore;
}
