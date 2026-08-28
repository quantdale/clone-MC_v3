# Proposal: 187-statistics-framework

## Problem
185/186 built advancements and their catalog, but nothing counts the player's *behavior*: distance
walked, mobs killed, time played. Statistics are the last meta-progression layer — typed counters
with persistence that 205's HUD and 242's e2e can read.

## Goals
- `src/simulation/StatisticsFramework.ts` (NEW), pure and deterministic:
  - **Typed counters**: `DEFAULT_STATISTIC_KEYS` — `walk_distance`, `mob_kills`, `blocks_broken`,
    `deaths`, `time_played`, `damage_taken`, `jumps`; `StatisticStore` is an immutable record of
    non-negative integers over exactly those keys.
  - **Core ops**: `createStatisticStore` (all 0); `incrementStatistic(store, key, amount)` — a
    known key + finite positive amount floors to an integer and returns a NEW store; anything else
    returns the IDENTICAL store (cheap no-op); `getStatistic`.
  - **Event hooks**: `applyStatisticEvent(store, event)` — typed events (`walk`/`kill_mob`/
    `break_block`/`death`/`damage`/`jump`/`play_tick`) map to counter increments (walk/damage floored,
    keeping counters integral and persistence lossless).
  - **UI data**: `statisticsSnapshot(store)` — a fresh plain copy for 205's HUD.
  - **Persistence**: versioned `serializeStatisticStore`/`deserializeStatisticStore` — validates
    version, the exact known-key set (unknown keys rejected), and non-negative integer values.

## Non-goals
- **No HUD/UI** (205), **no difficulty integration** (188), **no multiplayer per-player stores**
  (222+), **no `Game`/`World` wiring**.

## Preconditions
- Change 186 (`core-progression-advancements`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library (a standalone framework, like 185).

## Proposed change
1. `src/simulation/StatisticsFramework.ts` (NEW): the constants, types, and six functions above.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change (the store is a new additive persistence shape, versioned).

## Risks
- **Fractional counters breaking persistence** (walk distance is fractional per tick). Mitigation:
  increments floor to integers by rule, and deserialization rejects non-integers — both pinned.
- **Unknown keys creeping in** (a typo silently creating a counter). Mitigation: the store is typed
  over the fixed key set; deserialization rejects unknown keys explicitly.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All listed functions implemented per design.md/spec.md.
- Unit tests cover: zero-initialized store; accumulation + immutability; invalid-increment identity
  no-ops; every event mapping (incl. floored walk/damage); death recording; non-positive walk
  identity; the UI snapshot copy; serialize/deserialize round-trip; malformed-payload rejection
  (null, bad version, negative, non-integer, missing/unknown keys).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. This change closes the meta-progression trio
(185-187).
