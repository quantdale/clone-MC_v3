# Proposal: 153-boss-framework

## Problem
183 (`ender-dragon-boss`) and a later Wither-like secondary boss both need the same underlying
machinery: a boss whose health drives named phases, an arena lifecycle (spawning → active →
defeated), and a boss-bar data model the HUD (205) can render. None of that exists, and building it
inside 183 would make it dragon-specific and unreusable — the change sequence explicitly frames 153
as the *reusable* framework and 183 as its first consumer.

## Goals
- A `BossDefinition` data model: an id/key, `maxHealth`, an ordered `phases` list (each with a name
  and the health *fraction* at or below which it becomes active), and a `barColor`.
- A `BossState`: the definition's key, current health, current phase index, an arena lifecycle
  status (`SPAWNING`/`ACTIVE`/`DEFEATED`), and a tick counter.
- `startBossFight(definition)`: an `ACTIVE`-on-first-tick boss at full health in phase 0.
- `phaseForHealthFraction(definition, fraction)`: the pure phase-index lookup — the last phase whose
  threshold the fraction has fallen to or below.
- `damageBoss(state, definition, amount)`: pure — reduces health (floored at 0), recomputes the
  phase, transitions to `DEFEATED` at 0 health, and reports both whether the phase changed and
  whether this call defeated the boss (so a caller can fire events without diffing states itself).
- `healBoss(state, definition, amount)`: the symmetric heal (capped at `maxHealth`), used by
  crystal-style regeneration; **never** revives a `DEFEATED` boss.
- `tickBossFight(state)`: advances the tick counter and promotes `SPAWNING` → `ACTIVE` after
  `BOSS_SPAWN_TICKS`; a no-op once `DEFEATED`.
- `bossBarSnapshot(state, definition)`: the `{ name, color, progress, phaseName }` projection 205's
  HUD will render, with `progress` in `[0, 1]`.
- `createDefaultBossRegistry()`: a 003-registry-backed catalog seeded with an `ender_dragon` and a
  `wither` definition, so 183 and the later Wither change both have a ready definition and the
  registry's shape is exercised.
- `serializeBoss`/`deserializeBoss`: a strict `version: 1` envelope with atomic validation.

## Non-goals
- **No boss entity types, no AI, no attacks, no arena block generation.** Nothing is registered in
  017's `EntityRegistry`; `BossDefinition` is keyed by a plain string. Dragon-specific behavior
  (crystals, perching, flight paths) is 183's scope; the End dimension it needs does not exist yet
  (180/181).
- **No HUD/boss-bar rendering** — 205 (`hud-parity`) is the titled change; `bossBarSnapshot`
  produces the data it will render, mirroring how 151's `buildTradeMenu` produced menu state for a
  UI that does not exist yet.
- **No event bus wiring.** 053's `GameEventBus` exists, but this module returns explicit
  `phaseChanged`/`defeated` booleans from `damageBoss` rather than publishing events, keeping it
  import-free and letting the caller decide what to emit (a deliberate coupling choice, documented
  in design.md).
- **No IndexedDB store** — codec only, exactly as 149/152 deferred their persistence wiring.
- **Not wired into `Game`** — additive/unconsumed, matching 148-152.

## Preconditions
- Change 152 (`raid-state-machine`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/data/Registry.ts` (003) and `src/data/ResourceId.ts` (002) for the boss-definition registry.
  No other imports — the state machine itself is otherwise self-contained (152's precedent).

## Proposed change
1. `src/simulation/BossFramework.ts` (NEW): `BossPhase`, `BossDefinition`, `BossStatus`,
   `BossState`, `BossBarSnapshot`, `SerializedBoss` types; `BOSS_SPAWN_TICKS`,
   `BOSS_RECORD_VERSION` constants; `BossRegistry`, `createDefaultBossRegistry`;
   `startBossFight`, `phaseForHealthFraction`, `damageBoss`, `healBoss`, `tickBossFight`,
   `bossBarSnapshot`, `serializeBoss`, `deserializeBoss`.

## Compatibility and migration
- One new, additive file. No existing module edited; no `Game.ts` edit; no schema/save-format
  change; no migration.

## Risks
- **A malformed `BossDefinition` (unsorted or out-of-range phase thresholds) would silently produce
  wrong phase lookups.** Mitigation: `BossRegistry`'s constructor validates every definition
  (positive `maxHealth`, at least one phase, thresholds within `[0, 1]` and strictly descending,
  first phase at `1`), throwing before registration — so an invalid definition can never reach
  `phaseForHealthFraction`.

## Rollback strategy
One additive file; reverting fully removes the feature with no other impact.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: registry validation (rejects non-positive `maxHealth`, empty phases,
  out-of-range/ascending thresholds, a first phase below 1) and lookup; `phaseForHealthFraction`
  boundary behavior; `startBossFight` initial state; `damageBoss` (health floor, phase-change
  reporting, defeat reporting, purity, no-op once defeated); `healBoss` (cap at `maxHealth`, no
  revival of a defeated boss, phase recompute); `tickBossFight` (`SPAWNING` → `ACTIVE` promotion,
  defeated no-op); `bossBarSnapshot` (`progress` in `[0, 1]`, correct phase name);
  `serializeBoss`/`deserializeBoss` round-trip and atomic rejection.
- Full gate green: typecheck, lint, unit, build (module count unchanged — additive/unconsumed,
  mirroring 148-152's identical evidence), e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
