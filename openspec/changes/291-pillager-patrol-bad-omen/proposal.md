# Proposal: 291-pillager-patrol-bad-omen

## Problem

The raid track (282–290) is playable end to end — Bad Omen (285) starts a raid
inside a detected village (287), raiders fight (288), and VICTORY rewards Hero
of the Village (290). But the only way to *acquire* Bad Omen in live play is
the `Game.grantBadOmen` seam, which no gameplay path calls. In vanilla
Minecraft the classic Bad Omen source is killing the captain of a wandering
pillager patrol. Without patrols the raid loop has no organic entry point.

## Goals

- Deterministic (world-seeded), rate-limited **pillager patrol** spawning near
  the player under explicit Minecraft-like rules: minimum accumulated world
  play time, daytime only, loaded top-of-column (sky-exposed) surface 24–47
  blocks away on each axis, not while near a detected village, not during an
  ACTIVE raid, at most one live patrol, a cooldown of 6000–6599 fixed ticks
  between attempts and a 1-in-5 success roll.
- Each patrol is a small group of **2–4 pillagers with exactly one captain**.
- Patrol entities reuse the existing raider backend
  (`createEntityManagerRaidBackend`, 284) and pillager combat
  (`RaiderCombatSystem`, 288) over a dedicated patrol `EntityManager`.
- Killing the patrol **captain** grants Bad Omen through the existing Game
  `grantBadOmen` seam (285): +1 level, capped at 5.
- **Raid isolation:** patrol deaths never read or write `RaidState`; raid-wave
  deaths never grant Bad Omen.
- Pause/dispose/pagehide/reload safety; unit + browser E2E; 258 stays BLOCKED.

## Non-goals

- No pillager outposts, banners (item or visual), ominous banners/bottles, or
  villagers.
- No patrol/raider rendering (raid-wave entities are also unrendered today —
  documented limitation, candidate for a later change).
- No persistence of patrols, patrol cooldown, or Bad Omen (Bad Omen stays
  ephemeral per 285 — documented; persistence is a 292 candidate).
- No change to the 285 omen→raid trigger, the 288 combat profiles, or raid
  wave composition.
- No GPU/FPS work; Change 258 stays BLOCKED; no fake evidence.
- Change 292 is not authored or implemented here.

## Preconditions

- Changes 282–290 VERIFIED and published on `origin/main` (tip `bc777e1`).
- `Game.grantBadOmen` / `BadOmenRules.grantBadOmen` (cap 5) exist (285).
- `RaidEntityBackend` + `RaiderCombatSystem` exist (284/288); `pillager` is a
  registered entity type.
- Live village query (287), statistics `time_played` (271, persisted), day
  tick (274) and difficulty/gamerules (188/261) exist.
- Change 258 remains BLOCKED; Changes 259–290 remain VERIFIED.

## Dependencies

- `src/simulation/BadOmenRules.ts`, `RaidEntityBackend.ts`,
  `RaiderCombatBehavior.ts`, `SeedRng.ts`, `SleepFramework.ts` (`isNight`)
- `src/engine/Game.ts` (fixed tick, raid start, dispose, pagehide, seams)
- `src/data/EntityType.ts` (`pillager`)

## Proposed change

1. Author this OpenSpec package; add CHANGE_SEQUENCE row + overrides addendum;
   make 291 the sole ACTIVE change.
2. New `src/simulation/PillagerPatrol.ts`: pure `decidePatrolAttempt` planner
   (gates, seeded position/group plan), `nextPatrolCooldown`, and a
   `PillagerPatrolSystem` owning cooldown, the patrol roster, the reused
   backend + combat system, captain-death detection and despawn.
3. Game wiring: patrol tick after the 285 omen evaluate in the fixed tick;
   captain death → `grantBadOmen(1)` + toast; raid start dismisses any live
   patrol; dispose/pagehide clear; debug seams for E2E.
4. Unit + browser E2E; full baseline gates; VERIFIED 100%; publish.

## Compatibility and migration

No new persistence namespace; no stored-data change. Existing saves load
unchanged. Behavioral change: after ≥60000 accumulated play ticks, daytime
patrols may appear near the player and fight; killing the captain raises
Bad Omen (still ephemeral).

## Risks

- Patrol spam → hard rate limit (cooldown ≥6000 ticks, one live patrol max,
  1-in-5 roll); reload restarts the cooldown (never shortens it below 6000).
- Omen from patrols replacing an active raid via the 285 trigger → patrols
  never spawn during an ACTIVE raid and a raid start dismisses any live patrol.
- Double player melee with raid combat → patrol combat receives the player
  melee request only when no raid is ACTIVE.
- Determinism drift → draw order is normative; gate skips consume no draws.
- Unloaded terrain → only canonical (loaded) columns are candidate surfaces.

## Rollback strategy

Revert the 291 commits together. Nothing new is persisted, so no migration or
repair is needed; Bad Omen returns to seam-only acquisition.

## Definition of Done

- Package passes the SPEC_AUTHORING_PROTOCOL quality gate.
- Implementation + unit + E2E green; baseline gates green (visual:176
  SwiftShader drift documented honestly, goldens untouched; enchanting:227
  green).
- C291 exact; VERIFIED 100%; published to `origin/main`; 258 still BLOCKED.
- `nextExactAction` points at authoring a spec-first 292 package with 3–5
  candidate topics.

## Advancement gate

Target 100% task completion with all mandatory requirements and tests passing.
Absolute floor 90% only via explicit Advancement Exception (not planned).
