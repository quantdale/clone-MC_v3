# Proposal: 152-raid-state-machine

## Problem
The master plan's Phase 15 calls for a "raid-like event system" over settlements: a bounded,
deterministic lifecycle where a raid is triggered, spawns escalating waves of raiders, and resolves
to a win (all waves cleared) or a loss (the settlement falls), with the outcome persisted. Nothing
resembling a multi-wave event state machine exists anywhere in the codebase.

## Goals
- A `RaidState` model: a status (`INACTIVE`/`ACTIVE`/`VICTORY`/`DEFEAT`), a center position, the
  current wave index, total wave count, the count of raiders remaining alive in the current wave,
  a per-raid bad-omen level, and a tick counter.
- `startRaid(center, badOmenLevel)`: creates an `ACTIVE` raid whose total wave count derives from
  the bad-omen level (deterministically, no RNG).
- `waveComposition(waveIndex, badOmenLevel)`: a pure, deterministic per-wave raider roster
  (`{ typeKey, count }[]`) — escalating with wave index and bad-omen level.
- `spawnWave(state)`: advances to the next wave, returning the new state plus that wave's
  composition; sets `raidersRemaining` to the wave's total raider count.
- `recordRaiderDeath(state)`: decrements `raidersRemaining` (floored at 0), never below zero, and
  never on a non-`ACTIVE` raid.
- `tickRaid(state)`: the single lifecycle-advancing step — advances the tick counter; when the
  current wave is cleared (`raidersRemaining === 0`), either spawns the next wave or transitions to
  `VICTORY` after the final wave; transitions to `DEFEAT` when the raid exceeds
  `RAID_TIMEOUT_TICKS` without clearing.
- `serializeRaid`/`deserializeRaid`: a strict `version: 1` envelope with atomic validation, so a
  future persistence-wiring change can store raid outcome across sessions (the change title's
  "win-loss persistence" requirement, satisfied at the codec level exactly as 149 satisfied POI
  persistence at the codec level without adding an IndexedDB store).

## Non-goals
- **No raider entity types, no actual mob spawning.** `waveComposition` returns raider *type keys*
  as plain strings; no `pillager`/`vindicator`/`ravager` entity is registered in 017 and nothing
  calls `EntityManager.spawn`. Registering raider mobs and spawning them is a substantial, separate
  scope with no titled change before 153 — flagged, not silently dropped.
- **No village-boundary/settlement detection.** `startRaid` takes a caller-supplied center
  position; deciding *where* a settlement is (and therefore what triggers a raid) requires village
  structure generation, which does not exist (150/151's identical inherited blocker).
- **No bad-omen status effect or trigger condition.** `badOmenLevel` is a caller-supplied number;
  nothing grants bad omen (that would need a raid-captain mob and 121's effect runtime wiring, both
  out of scope).
- **No IndexedDB store for raid records** — `serializeRaid`/`deserializeRaid` provide the codec;
  wiring it to a real store is deferred exactly as 149 deferred POI persistence.
- **Not wired into `Game`**, and **no boss bar / raid HUD** (205's scope) — additive/unconsumed,
  matching 148-151.

## Preconditions
- Change 151 (`villager-trading`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond TypeScript itself. Deliberately self-contained: the state machine takes plain
  positions/numbers and returns plain data, so it has no import-time coupling to `EntityManager`,
  `World`, or any registry (matching how 141's `MeleeCombat` is pure math with zero imports).

## Proposed change
1. `src/simulation/RaidStateMachine.ts` (NEW): `RaidStatus` type; `RaidWaveEntry`, `RaidState`,
   `SerializedRaid` interfaces; `RAID_MAX_WAVES`, `RAID_BASE_WAVES`, `RAID_TIMEOUT_TICKS`,
   `RAID_RECORD_VERSION` constants; `startRaid`, `waveComposition`, `spawnWave`,
   `recordRaiderDeath`, `tickRaid`, `serializeRaid`, `deserializeRaid`.

## Compatibility and migration
- One new, additive file. No existing module edited; no `Game.ts` edit; no schema/save-format
  change (no store is wired); no migration.

## Risks
- **`waveComposition` names raider types that do not exist in 017's `EntityRegistry`** — a future
  spawning change must register them before the composition can be acted on. Mitigated by returning
  plain string keys (not `ResourceId`s resolved against a registry), so nothing can throw today, and
  by documenting the gap explicitly.

## Rollback strategy
One additive file; reverting fully removes the feature with no other impact.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: `startRaid` initial state and bad-omen-derived wave count (clamped at
  `RAID_MAX_WAVES`); `waveComposition` determinism and escalation; `spawnWave` wave advance +
  `raidersRemaining` seeding, and its refusal to advance past the final wave; `recordRaiderDeath`
  decrement/floor/non-`ACTIVE` no-op; `tickRaid` full lifecycle (clears a wave → next wave; clears
  the final wave → `VICTORY`; exceeds the timeout → `DEFEAT`; no-op once terminal);
  `serializeRaid`/`deserializeRaid` round-trip and atomic rejection of a malformed payload.
- Full gate green: typecheck, lint, unit, build (module count unchanged — additive/unconsumed,
  mirroring 148-151's identical evidence), e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
