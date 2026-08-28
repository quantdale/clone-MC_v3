# Proposal: 139-passive-wander-ai

## Problem
136 gave a generic goal scheduler and 129/130 gave entity state/physics, but no concrete `Goal`
exists yet. Nothing lets a mob actually wander around or look about — the first real behaviors a
baseline passive mob needs.

## Goals
- `WanderGoal`: a `Move`-flagged `Goal` that, at a random per-tick chance, picks a nearby walkable,
  non-water target column (via 134's `canStandAt`/`classifyNode`) around the entity's current
  position, then steers the entity's horizontal velocity (129's `EntityManager.setVelocity`) toward
  it each tick until arrival or a maximum duration, at which point it stops (zeroing horizontal
  velocity) and becomes eligible to pick a new target later.
- `LookGoal`: a `Look`-flagged `Goal` that, at a random per-tick chance, picks a new random yaw and
  applies it directly to the entity's transform (129's `EntityManager.setTransform`) — a stateless
  filler behavior, always eligible.
- Both goals are deterministic given an injected `SeedRng` (054) — no `Math.random`, no wall-clock.

## Non-goals
- **No pathfinding through obstacles.** `WanderGoal` picks a target validated as standable and
  non-water, then steers straight toward it (documented simplification for a "baseline" open-area
  wander); 135's `findPath` remains available for a future goal that needs obstacle-aware routing
  (e.g. 140's hostile chase).
- **No terrain-following target search.** The wander-target search stays at the entity's current
  (rounded) Y level rather than sampling a heightmap; a mob wandering across uneven terrain without
  a height sampler is out of this baseline's scope.
- **No `Game`/mob-spawning wiring.** Nothing yet constructs a `GoalSelector` with these goals for a
  live spawned mob; that begins at 145 (`passive-mob-baseline`, "first fully interactive passive mob
  end-to-end").
- **No physics integration in this change.** These goals only set velocity/transform; turning that
  velocity into actual collision-resolved movement is 130's `tickEntityPhysics`, already built and
  unmodified — a future consumer calls both per tick.

## Preconditions
- Change 138 (`mob-spawn-cycle`) is VERIFIED.
- Change 136 (`mob-goal-selector`), change 134 (`navigation-grid-query`), and change 054
  (`deterministic-rng-streams`) are VERIFIED and unchanged.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/GoalSelector.ts` (136) — `Goal`, `GoalFlag`.
- `src/simulation/EntityManager.ts` (129) — `get`, `setVelocity`, `setTransform`.
- `src/simulation/NavigationGridQuery.ts` (134) — `canStandAt`, `classifyNode`, `PathNodeType`,
  `NavigationWorld`.
- `src/simulation/SeedRng.ts` (054) — `SeedRng.nextFloat`.

## Proposed change
1. `src/simulation/PassiveWanderAI.ts` (NEW):
   - `WanderGoal` (class implementing `Goal`) with constructor options (`manager`, `entityId`,
     `world`, `rng`, and tunables: `speed`, `radius`, `startChance`, `maxDurationTicks`,
     `arrivalRadius`, `height`).
   - `LookGoal` (class implementing `Goal`) with constructor options (`manager`, `entityId`, `rng`,
     `changeChance`).
2. No other file is edited.

## Compatibility and migration
- One new, additive file with no consumer yet. No schema/save-format change, no migration.

## Risks
- **Straight-line steering walking through an obstacle the target-pick check didn't anticipate.**
  Mitigation: documented as a baseline-scope simplification (see Non-goals); a future refinement
  could route `WanderGoal` through 135's `findPath` without changing this change's own contract.
- **Non-determinism from `SeedRng` misuse.** Mitigation: both goals only ever call the injected
  `rng`'s methods, never `Math.random`; verified directly by a determinism-style test running two
  goal instances with independently-seeded (but identical-seed) `SeedRng`s and identical world/entity
  state, asserting identical outcomes.

## Rollback strategy
One additive file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- `WanderGoal`/`LookGoal` implemented per design.md/spec.md.
- Unit tests cover: `WanderGoal` picking a valid non-water target and steering toward it;
  arrival stopping the goal (velocity zeroed, `canContinueToUse` false); a `maxDurationTicks` timeout
  stopping the goal; `canUse` failing when no valid target is found nearby (e.g. surrounded by
  water/obstructions) or the entity no longer exists; `LookGoal` applying a new yaw at its change
  chance and leaving other transform fields untouched; determinism of both goals given identical
  seeded `SeedRng`s and world state.
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no consumer wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
