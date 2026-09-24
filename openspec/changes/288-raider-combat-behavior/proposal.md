# Proposal: 288-raider-combat-behavior

## Problem

Changes 282–287 ship a playable raid pipeline: feedback bar, `__raid__`
persistence, wave spawning through `RaidEntityBackend`, Bad Omen acquisition,
raid-bar parity, and live village detection. Wave entities spawn as registered
non-persistent monsters (`pillager`/`vindicator`/`ravager`/`witch`) but have
**no combat AI** — they stand still, never damage the player, and cannot be
killed through a live combat path. A raid therefore cannot be won or lost in
normal play except by the timeout clock (`DEFEAT`) or debug death consumption.

## Goals

- Make spawned raid-wave entities fight using existing verified systems:
  `HostileTargetAI` (target/chase), `MeleeCombat`, `ProjectileCore` +
  `BowAndArrow` formulas, `MobHealthTracker`, and the 279 `hurtPlayer` /
  shield choke.
- Per-type roles: pillager ranged, vindicator melee, ravager melee (higher
  damage), witch ranged via a documented simple fallback (no potion-entity
  system exists).
- When no attackable player target is acquired, raiders move toward the raid
  center (village/raid home).
- Player (or debug) damage that kills a raider MUST flow through the 284
  exactly-once `onRaidEntityRemoved` → `recordRaiderDeath` path so waves
  advance and `VICTORY` remains reachable; player death during an ACTIVE raid
  and timeout MUST reach `DEFEAT`.
- Pause/dispose/reload safety; bounded per-tick cost; unit + browser E2E.
- Keep 258 BLOCKED; do not reopen 282–287 beyond intentional combat wiring.

## Non-goals

- No new AI framework / GoalSelector redesign; reuse 140/141/142/146/148.
- No villager entities, Hero of the Village, patrols/outposts, captain/banner.
- No new persistence / archive namespace; no raider serialization.
- No GPU/FPS work; Change 258 stays BLOCKED; no fake evidence.
- Do not start Change 289 implementation in this session.
- No full throwable-potion entity system for witches (documented fallback).

## Preconditions

- Changes 282–287 are VERIFIED and published on `origin/main` (tip `3b26e2a`).
- `RaidWaveController` + `raidEntityManager` + `onRaidEntityRemoved` exist.
- Registry keys carry health/attackDamage from 284.
- `HostileTargetAI`, `MeleeCombat`, `ProjectileCore`, `BowAndArrow`,
  `MobHealthTracker`, `hurtPlayer` / shield path are VERIFIED.
- Change 258 remains BLOCKED; Changes 259–287 remain VERIFIED.

## Dependencies

- `src/simulation/RaidWaveController.ts`, `RaidEntityBackend.ts`, `RaidStateMachine.ts`
- `src/simulation/HostileTargetAI.ts`, `MeleeCombat.ts`, `ProjectileCore.ts`,
  `BowAndArrow.ts`, `MobDropLoot.ts` (`MobHealthTracker`), `GoalSelector.ts`,
  `EntityPhysics.ts`, `PassiveWanderAI.ts` (LookGoal optional)
- `src/engine/Game.ts` (`raidEntityManager`, `hurtPlayer`, raid tick path)
- `src/data/EntityType.ts` (raider defs)

## Proposed change

1. Author this complete OpenSpec package under
   `openspec/changes/288-raider-combat-behavior/`.
2. Add CHANGE_SEQUENCE row + override ADDENDUM; make 288 the sole ACTIVE change.
3. Implement pure role/cadence/damage helpers + `RaiderCombatSystem` over the
   raid `EntityManager`, wire into Game fixed tick with pause/dispose safety,
   player→raider melee (wither-style proximity) + debug damage seam, and
   ACTIVE-raid player death → `DEFEAT`.
4. Unit + browser E2E evidence; full baseline gates; VERIFIED 100%; publish.

## Compatibility and migration

No stored data, registry id, or archive schema changes. Existing saves remain
valid. Behavioral change: live raiders now move/attack and can be damaged;
player death during ACTIVE forces `DEFEAT`. Ephemeral combat state is never
persisted. Reload still non-resurrects wave entities (284).

## Risks

- Per-tick cost with many raiders → bound AI to tracked wave ids only, cap
  projectile steps, reuse existing invuln pacing.
- Witch potion gap → explicit ranged-projectile fallback with pinned damage
  and documented reason in design/spec.
- Breaking 284 death exactly-once → all deaths still go through
  `consumeDeath` / `onRaidEntityRemoved`.
- Accidental ambient HostileMobSystem coupling → raiders stay on
  `raidEntityManager`, not the zombie manager.

## Rollback strategy

Revert the 288 commits together. No migration repair (nothing persisted).
Raiders return to inert spawn-only behavior.

## Definition of Done

- Package passes SPEC_AUTHORING_PROTOCOL quality gate.
- Implementation + unit + E2E green; baseline gates green (document known
  SwiftShader visual drift and enchanting:227 flake honestly).
- C288 exact; VERIFIED 100%; published to `origin/main`; 258 still BLOCKED.
- `nextExactAction` points at authoring a spec-first package for 289 (not
  started).

## Advancement gate

Target 100% task completion with all mandatory requirements and tests passing.
Absolute floor 90% only via explicit Advancement Exception (not planned).
