# Proposal: 142-projectile-core

## Problem
Nothing in the codebase models a free-flying projectile: gravity/drag motion, block collision
(embedding), entity collision (hitting a target), or firer/owner tracking so a projectile doesn't
immediately hit whoever fired it. 143 (`bow-and-arrow`) needs exactly this as its motion/collision
substrate.

## Goals
- `ProjectileState`: `{x, y, z, vx, vy, vz, ownerId, ageTicks}`.
- `stepProjectile(world, resolver, state, targets, options?)`: one discrete tick of vanilla-style
  arrow physics — gravity subtracted from `vy`, position integrated, then velocity drag applied for
  the next tick — that checks entity collision (against a caller-supplied candidate list) before
  block collision (via 057's `CollisionResolver`, treating the projectile as a small cube), stopping
  and reporting whichever fires first. The firer (`ownerId`) is immune to being hit for the first
  `ownerImmunityTicks` of the projectile's life (vanilla-like: an arrow can eventually hit its own
  shooter once it's traveled away).
- Age-based expiration: past `maxAgeTicks`, the step returns `expired: true` without computing
  further physics for that tick.
- Damage/event hooks are exposed as *return values* (`hitBlock`/`hitEntityId`), not applied by this
  module — a caller (a future ranged-attack change) decides what damage/effects to apply.

## Non-goals
- **No damage-amount computation.** `stepProjectile` reports *that* a hit occurred, not how much
  damage to deal; 143 (`bow-and-arrow`) will compute arrow damage and apply it (potentially reusing
  141's `resolveMeleeAttack`-adjacent primitives, or its own formula).
- **No item/entity representation for the projectile itself** (no `EntityInstance`/`ItemEntity`
  wiring). `ProjectileState` is a plain, standalone data shape; attaching it to 129's `EntityManager`
  is a future wiring step.
- **No continuous swept-sphere entity collision.** Entity-hit detection checks the destination point
  against each target's sphere for this tick, not a full swept-segment intersection; a documented
  simplification acceptable at typical arrow speeds and this program's current scope.
- **No `Game`/spawning wiring.** Nothing yet constructs/ticks a live projectile in a game loop.

## Preconditions
- Change 141 (`melee-combat-cooldown`) is VERIFIED.
- Change 056 (`voxel-shape-core`) and change 057 (`shape-aware-player-collision`, source of
  `CollisionResolver`) are VERIFIED and unchanged.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/world/CollisionResolver.ts` (057) — `CollisionResolver.move`, `ShapeWorld`, `CollisionBox`.
- `src/world/VoxelShape.ts` (056) — used indirectly through the `ShapeWorld` contract.

## Proposed change
1. `src/simulation/ProjectileCore.ts` (NEW):
   - `ProjectileState`, `ProjectileOptions`, `ProjectileTarget`, `ProjectileStepResult`.
   - `stepProjectile(world, resolver, state, targets, options?)`.
2. No other file is edited.

## Compatibility and migration
- One new, additive file with no consumer yet. No schema/save-format change, no migration.

## Risks
- **Point-based entity-hit detection missing a fast-moving target mid-tick.** Mitigation: documented
  simplification (see Non-goals); typical arrow/target speeds at 20 TPS keep this acceptable for this
  program's current scope. A future refinement could add a swept check without changing the
  function's external contract.
- **Owner-immunity window feeling arbitrary.** Mitigation: `ownerImmunityTicks` is a named, tunable,
  documented option (default 5) matching vanilla's own "arrow can hit its shooter after leaving their
  hitbox" behavior, not a silent hardcoded rule.
- **Gravity/drag order producing unexpected numbers for a consumer expecting a different convention.**
  Mitigation: the exact order (gravity → integrate position → drag) is documented explicitly in
  design.md and tested directly.

## Rollback strategy
One additive file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- `stepProjectile` implemented per design.md/spec.md.
- Unit tests cover: gravity/drag applied in the documented order over a free-fall step; block
  collision (embeds, velocity zeroed, `hitBlock` reported); entity collision (destination-point
  sphere test, velocity zeroed, `hitEntityId` reported) taking priority when both would otherwise
  fire the same tick; owner immunity (owner not hit within the window, hit afterward); age-based
  expiration (physics not advanced past `maxAgeTicks`, `expired: true`).
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no consumer wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
