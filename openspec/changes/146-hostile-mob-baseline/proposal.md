# Proposal: 146-hostile-mob-baseline

## Problem
145 wired the first real, live, spawned, physics-collided passive mob (pig) into `Game`. The
hostile side of the same stack — `HostileTargetAI` (140), `MeleeCombat` (141) — is still dormant:
nothing spawns a monster, nothing lets one detect/chase/attack the player, and the player has no
way to take damage from a mob at all.

## Goals
- A real, live zombie (`data/EntityType.ts`'s existing `MONSTER` definition) spawned via
  `MobSpawnRules`/`MobSpawnCycle` in genuinely dark places (reusing 145's `PassiveMobWorldAdapter`/
  `PassiveMobWorld` unchanged), ticked via `EntityManager` + `EntityPhysics`, wandering when idle
  (139's `WanderGoal`/`LookGoal`) and, once the player is within detection range, switching to
  140's `TargetAcquisitionGoal`/`ChaseGoal` to close in.
- Once in range, the zombie actually hurts the player: 141's `resolveMeleeAttack` (with a single
  shared `InvulnerabilityTracker` keyed by a sentinel "player" id, mirroring vanilla's one global
  hurt-cooldown regardless of which mob lands the hit) computes damage, applied to the player via
  the existing `SurvivalSystem.damage`.
- A minimal `HostileMobRenderer` giving each live zombie a visible mesh, mirroring 145's renderer
  pattern.
- `Game` wiring: construct once, tick every frame alongside the passive mob system, feed real
  player damage through.

## Non-goals
- **No player-initiated attack on a mob.** Research into the existing interaction/input pipeline
  (`PlayerInteraction.ts`'s `InteractionAction` is `'break'|'place'|'blocked'|'empty'|'use'` only;
  raycasting is block-grid-only via `raycastVoxel`/`ShapeRaycast`) confirms there is no entity-hit
  raycast, no "attack" action, and no entity-health/death pathway anywhere today. Adding all of that
  (a new interaction action, an entity-AABB raycast, health/death wiring) is a substantial,
  separate scope not covered by any titled change in `CHANGE_SEQUENCE.md` between here and 153 — **a
  future change must add player→mob combat explicitly; this gap is flagged, not silently dropped.**
  Until then, a zombie cannot be killed or even damaged by the player.
- **No `EntityDataTracker` health/death for the zombie itself** — with no way to damage it yet,
  tracking its health has no consumer (mirrors 145's identical reasoning for skipping it on pig).
- **No knockback applied to the player.** `resolveMeleeAttack`'s knockback vector is computed but
  not applied to `Player`'s own velocity/physics state — `Player` and `EntityVelocity` are separate
  representations, and wiring one into the other correctly (without fighting `PlayerController`'s
  own velocity ownership) is out of scope for this baseline. Only damage is applied.
- **No line-of-sight/obstacle-aware pathing** (140's own stated non-goal, inherited unchanged) — a
  zombie can chase in a straight line even through a wall its physics step then blocks it on.
  **No breeding/loot/despawn/persistence** (mirrors 145's identical non-goals).
- **No new monster types** — zombie only, exactly as pig was the only passive mob in 145.
- **Separate `EntityManager` instance from 145's pig system** (own id-space) — unifying passive and
  hostile entities into one shared manager is deferred; this baseline does not touch
  `PassiveMobBaseline.ts` at all.

## Preconditions
- Change 145 (`passive-mob-baseline`) is VERIFIED.
- Changes 140 (`hostile-target-ai`) and 141 (`melee-combat-cooldown`) are VERIFIED and unchanged.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/PassiveMobBaseline.ts` (145, `PassiveMobWorldAdapter`/`PassiveMobWorld` reused
  unmodified), `EntityManager.ts` (129), `EntityPhysics.ts` (130), `EntityChunkTracking.ts` (132),
  `GoalSelector.ts` (136), `MobSpawnRules.ts`/`MobSpawnCycle.ts` (137/138), `PassiveWanderAI.ts`
  (139), `HostileTargetAI.ts` (140), `MeleeCombat.ts` (141), `SeedRng.ts` (054).
- `src/data/EntityType.ts` (017, existing `zombie` definition), `src/player/SurvivalSystem.ts`
  (existing `damage(amount, reason)`), `src/player/Player.ts` (read-only, player position).

## Proposed change
1. `src/simulation/HostileMobBaseline.ts` (NEW):
   - `ZOMBIE_BOUNDING_BOX`, `HOSTILE_SPAWN_CAP`, `HOSTILE_SPAWN_ATTEMPTS_PER_CHUNK`,
     `HOSTILE_SPAWN_CYCLE_INTERVAL_TICKS`, `HOSTILE_DETECTION_RADIUS`, `HOSTILE_FORGET_RADIUS`,
     `HOSTILE_ATTACK_RANGE`, `HOSTILE_CHASE_SPEED`, `HOSTILE_KNOCKBACK_STRENGTH` constants.
   - `PlayerTarget` interface (`x`/`y`/`z`, optional `vx`/`vy`/`vz`).
   - `HostileMobSystem` — owns its own `EntityManager` (constructed with
     `createDefaultEntityRegistry()`), a `CollisionResolver`, a shared player-facing
     `InvulnerabilityTracker`, and per-entity goal state; `spawnCycle` runs `runSpawnCycleForChunk`
     for zombie only; `tick` composes goal AI (target-acquire → chase-or-wander, plus look) with
     `EntityPhysics`, and resolves a melee attack against the player when a zombie is within
     `HOSTILE_ATTACK_RANGE` of its acquired target, invoking a caller-supplied `onPlayerDamaged`
     callback; `getActiveZombies()`.
2. `src/rendering/HostileMobRenderer.ts` (NEW): per-entity-id mesh pool, mirroring
   `PassiveMobRenderer`'s pattern with a distinct (darker/green) material.
3. `src/engine/Game.ts` (EDIT):
   - Construct `HostileMobSystem`/`HostileMobRenderer` (reusing the existing `passiveMobWorld`
     adapter instance — it is stateless and interface-shaped identically for both systems).
   - Throttled spawn-cycle sweep + per-frame `tick`/`sync`, alongside the existing passive-mob
     calls; `onPlayerDamaged` wired to `this.survival.damage(amount, 'mob')`.

## Compatibility and migration
- Two new, additive files. One `Game.ts` edit adding construction + calls; no existing method
  signature changes; `PassiveMobBaseline.ts` is not modified. No schema/save-format change (mobs
  are not persisted, matching 145); no migration.

## Risks
- **A zombie could realistically only spawn in caves/underground given the light gate**, since
  daylight overworld columns are never dark per 145's simplified open-sky scan. Mitigation:
  documented as intended (matches vanilla's "monsters need darkness" rule); a player will see
  zombies near cave entrances/underground, not in open daylight — acceptable for a baseline.
- **Reusing `resolveMeleeAttack`'s attacker-cooldown-charge scaling (a 1.9-era player-attack
  mechanic) for a mob's attack** would under-deal damage on a mob's first swing. Mitigation: the
  mob always supplies cooldown inputs that saturate `attackCooldownProgress` to `1.0` (full
  damage), documented in design.md; the *target's* 10-tick invulnerability window (not an
  attacker-side cooldown) is what actually paces how often a zombie can land a hit.
- **Multiple zombies attacking simultaneously**: the shared `InvulnerabilityTracker` keyed by one
  sentinel "player" id ensures only one hit lands per invulnerability window regardless of how many
  zombies attempt it that tick — matches vanilla's single global player hurt-cooldown.

## Rollback strategy
Two additive files plus a small, easily-revertible `Game.ts` edit; reverting fully removes the
feature with no other impact, and does not touch 145's files.

## Definition of Done
- All listed classes/functions implemented per design.md/spec.md.
- Unit tests cover: `HostileMobSystem` spawn-cap enforcement; ticking-set gating; idle-wander vs.
  target-acquired-chase goal switching; melee-attack composition (in-range hit applies damage via
  the callback and registers the shared invulnerability window; out-of-range or already-invulnerable
  attempts do not).
- `HostileMobRenderer` sync/dispose scene-graph bookkeeping (mirrors 145's renderer tests).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected — no
  regression). A natural zombie spawn is **not** asserted in e2e: `MONSTER` spawning requires
  darkness, and whether a dark (e.g. cave) column exists within the reachable/loaded area near the
  fixed e2e seed's spawn point within a short test window is not guaranteed by anything this change
  controls — asserting it would be an unreliable, potentially flaky test standing in for a
  guarantee this change cannot actually make. The mob→player combat path itself (target-acquire,
  chase, melee-attack composition, invulnerability gating) is fully covered by deterministic unit
  tests instead, matching how 137/138's own spawn-rule tests avoid depending on real terrain.

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
