# Proposal: 195-spectator-mode

## Problem
192 granted flight to spectator and 194 made it unable to break/place, but the distinctive
spectator semantics are missing: noclip (passing through blocks), no gravity/collision, no
interaction of any kind, invulnerability to attack, and the free spectator camera. The game-modes
arc (192-195) needs those rules to be complete.

## Goals
- `src/simulation/SpectatorFramework.ts` (NEW), pure and headless-safe (no world access, no
  mutation):
  - **Noclip**: `noclip(mode)` — true ONLY for spectator (passes through blocks and entities).
  - **Physics override**: `hasGravity(mode)` and `hasCollision(mode)` — false ONLY for spectator
    (free flight without falling or solid collision).
  - **No interaction**: `canInteract(mode)` — false ONLY for spectator (no blocks, entities, or
    items; complements 194's break/place rules).
  - **Invulnerability**: `isAttackable(mode)` — false ONLY for spectator (mobs neither target nor
    damage spectators).
  - **Camera semantics**: `spectatorCameraAvailable(mode)` — true ONLY for spectator (the free
    camera with entity attachment).

## Non-goals
- **No camera implementation / physics wiring** (later changes apply the rules), **no mob
  targeting integration**, **no `Game.ts` edit**, **no save-format change**.

## Preconditions
- Change 194 (`adventure-mode`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 192's `GameMode` (type only).

## Proposed change
1. `src/simulation/SpectatorFramework.ts` (NEW): the five pure spectator predicates.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Predicate drift from vanilla**. Mitigation: every predicate is pinned per mode in a test table
  with the vanilla rationale documented in design.md.
- **Overlap with 192/194 predicates**. Mitigation: the module covers only spectator-specific
  semantics; the integration test composes it with `canFly` (192) and `canBreakBlock`/`canPlaceBlock`
  (194) to pin the full spectator profile.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: every predicate's 4-mode table; the composed spectator profile (fly + noclip +
  no gravity + no collision + no interaction + not attackable + camera available + no
  break/place); non-spectator modes never gain spectator privileges.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
