# Design: 187-statistics-framework

## Context/current state
- 185/186 established the meta-progression core and catalog. Statistics — the behavioral counters —
  are the missing third layer. The framework is standalone (no dependencies), following 185's
  style.

## Target state
- `src/simulation/StatisticsFramework.ts` holding the key set, the immutable store ops, the event
  hooks, the UI projection, and the validated persistence pair.

## Invariants
- `DEFAULT_STATISTIC_KEYS` is exactly the 7-key set; a store has every key at a non-negative integer.
- `incrementStatistic` returns a NEW store only for a finite, positive amount (floored); otherwise
  the IDENTICAL store.
- Event increments are floored (walk meters, damage hit points), keeping counters integral.
- `statisticsSnapshot` is a fresh copy.
- `deserializeStatisticStore` validates version, known-key set, and non-negative integers before
  accepting.

## API and data model
```ts
// src/simulation/StatisticsFramework.ts (new)
export const STATISTICS_VERSION = 1;
export const DEFAULT_STATISTIC_KEYS = ['walk_distance','mob_kills','blocks_broken','deaths','time_played','damage_taken','jumps'] as const;
export type StatisticKey = (typeof DEFAULT_STATISTIC_KEYS)[number];
export type StatisticEvent =
  | { type: 'walk'; distance: number }
  | { type: 'kill_mob'; mobKey: string }
  | { type: 'break_block'; blockKey: string }
  | { type: 'death' }
  | { type: 'damage'; amount: number }
  | { type: 'jump' }
  | { type: 'play_tick' };
export type StatisticStore = Readonly<Record<StatisticKey, number>>;
export interface SerializedStatisticStore { version: 1; statistics: Record<string, number>; }
export function createStatisticStore(): StatisticStore;
export function incrementStatistic(store: StatisticStore, key: StatisticKey, amount: number): StatisticStore;
export function getStatistic(store: StatisticStore, key: StatisticKey): number;
export function applyStatisticEvent(store: StatisticStore, event: StatisticEvent): StatisticStore;
export function statisticsSnapshot(store: StatisticStore): StatisticStore;
export function serializeStatisticStore(store: StatisticStore): SerializedStatisticStore;
export function deserializeStatisticStore(input: unknown): StatisticStore;
```

## Control/data flow
1. The wiring creates a store per world/player and feeds gameplay events into
   `applyStatisticEvent` per tick/action.
2. 205's HUD reads `statisticsSnapshot`; the save layer persists via the serialization pair.

## Detailed behavior
- Floored increments: `walk 3.7` → `walk_distance += 3` (meters); `damage 4` → `damage_taken += 4`.
  Sub-integer progress is intentionally dropped (documented rule) to keep persistence lossless.
- The unknown-key check runs AFTER the known-key completeness check in deserialization; a payload
  missing known keys is malformed regardless of extras (both paths tested).

## Failure modes
- Deserialization throws on any malformed field; every other function is total.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; new additive versioned shape.

## Performance/resource constraints
- All operations O(keys) or O(1); stores are small fixed records.

## Testing seams
- Tests use plain store literals and the real serialization pair.

## Observability/debugging
- `statisticsSnapshot` exposes the full store; counters are plain numbers.

## Affected files/symbols
- `src/simulation/StatisticsFramework.ts` (new).
- Tests: `tests/unit/StatisticsFramework.test.ts` (new). No other files.

## Rejected alternatives
- **A dynamic key registry**: rejected — the fixed typed set keeps the store shape exact and
  persistence strict; new statistics are added to the const set deliberately.
- **Auto-creating counters on unknown keys**: rejected — silent typo counters would corrupt the
  exact-key contract.

## Downstream dependencies
- 205 (`hud-parity`) consumes `statisticsSnapshot`; 188 (difficulty) may read counters; 242's e2e
  asserts counters along the survival path.
