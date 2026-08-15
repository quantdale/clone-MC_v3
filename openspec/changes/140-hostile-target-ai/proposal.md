# Proposal: 140-hostile-target-ai

## Problem
139 gave passive baseline behaviors; nothing yet lets a hostile mob notice, chase, or get within
striking range of a target. This is the hostile analog to 139's wander/look baseline.

## Goals
- `TargetAcquisitionGoal` (`Target`-flagged): finds and tracks the nearest valid target via an
  injected `findNearestTarget` callback (decoupled from any specific "who is targetable" query
  mechanism, mirroring 137/138's callback-injection style). Acquires a target within
  `detectionRadius`; keeps re-resolving the target's live position each tick while it stays within
  `forgetRadius`; drops it (and becomes ineligible) once the callback returns nothing or the target
  strays beyond `forgetRadius`.
- `ChaseGoal` (`Move`-flagged): depends on a `TargetAcquisitionGoal`'s current target. Steers
  straight-line horizontal velocity toward the target while farther than `attackRange`; once within
  `attackRange`, stops steering (zeroes horizontal velocity) and hands off to a future attack goal
  (141's scope) rather than dealing any damage itself.
- Both goals are deterministic (no `Math.random`/wall-clock) — `findNearestTarget` is the caller's
  own deterministic query.

## Non-goals
- **No obstacle-aware pathfinding.** `ChaseGoal` steers straight-line toward the target, the same
  documented simplification 139's `WanderGoal` uses; 135's `findPath` remains available for a future
  refinement without changing this change's `Goal` contract.
- **No line-of-sight/visibility checks.** `findNearestTarget` is the caller's own query; whether it
  accounts for walls/obstruction is entirely up to that callback, out of scope here.
- **No actual attack/damage.** Reaching `attackRange` only stops the chase; dealing damage on a
  cooldown is 141 (`melee-combat-cooldown`).
- **No target-priority rules beyond "nearest."** Real Minecraft has aggro/threat systems for some
  mobs; 140 models the simplest "nearest valid target" rule.
- **No `Game`/mob-spawning wiring.** Nothing yet constructs a `GoalSelector` with these goals for a
  live spawned hostile mob; that begins at 146 (`hostile-mob-baseline`).

## Preconditions
- Change 139 (`passive-wander-ai`) is VERIFIED.
- Change 136 (`mob-goal-selector`) and change 129 (`entity-core`) are VERIFIED and unchanged.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/GoalSelector.ts` (136) — `Goal`, `GoalFlag`.
- `src/simulation/EntityManager.ts` (129) — `get`, `setVelocity`.

## Proposed change
1. `src/simulation/HostileTargetAI.ts` (NEW):
   - `TargetAcquisitionGoal` (class implementing `Goal`) with constructor options (`manager`,
     `entityId`, `findNearestTarget`, `detectionRadius`, `forgetRadius`) and a `getTarget()` accessor.
   - `ChaseGoal` (class implementing `Goal`) with constructor options (`manager`, `entityId`,
     `targetSource: TargetAcquisitionGoal`, `speed`, `attackRange`).
2. No other file is edited.

## Compatibility and migration
- One new, additive file with no consumer yet. No schema/save-format change, no migration.

## Risks
- **`ChaseGoal` walking into an obstacle without pathfinding.** Mitigation: documented, deliberate
  baseline simplification (see Non-goals), matching 139's precedent exactly.
- **`ChaseGoal` running without an acquired target.** Mitigation: `ChaseGoal.canUse()` delegates
  directly to `targetSource.getTarget() !== null`, so it can never start chasing nothing; verified
  directly by a test.
- **Target flapping (acquire/drop every tick) causing jittery movement.** Mitigation: `forgetRadius`
  is deliberately larger than `detectionRadius` (hysteresis), so a target at the boundary doesn't
  immediately re-trigger acquisition/drop each tick; documented in design.md.

## Rollback strategy
One additive file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- `TargetAcquisitionGoal`/`ChaseGoal` implemented per design.md/spec.md.
- Unit tests cover: acquisition within/outside detection radius; continued tracking while within
  forget radius (including a moving target); dropping a target beyond forget radius or when the
  callback returns nothing; `ChaseGoal` requiring an acquired target to start; steering toward the
  target; stopping (zeroed horizontal velocity) within attack range; determinism (a deterministic
  callback drives identical outcomes across repeated runs).
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no consumer wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
