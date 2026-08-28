# Proposal: 169-explosion-core

## Problem
166-168 built the item-moving redstone consumers, but nothing in the codebase can *destroy* blocks in
the world — the first destruction path in the redstone/automation arc. Vanilla explosions are the
canonical deterministic destruction model: rays from a center, strength decaying through block
resistance, destroyed blocks dropping items, and entities taking distance-scaled damage. Without a
core, 170's TNT has nothing to execute, and no other destruction-based behavior (creeper, bed
misfire, respawn-anchor) can follow.

## Goals
- `computeExplosion({ center, strength, world })` → `{ destroyed, drops }`:
  - vanilla ray model — 1352 unit rays sampled from the surface of a 16×16×16 lattice
    (`EXPLOSION_RAY_COUNT = 1352`), marching in `EXPLOSION_RAY_STEP = 0.3` steps while power decays
    `EXPLOSION_RAY_DECAY = 0.225` per step plus `(resistance + 0.3) * 0.3` per non-air block;
  - a block position is destroyed when a ray's power is still positive there and the block is
    destroyable (caller decides via the `ExplosionWorld` seam, so fluids absorb rays like vanilla's
    water without being destroyed);
  - **fully deterministic**: destroyed positions sorted lexicographically by (x, y, z); drops
    resolved through the caller's `dropFor` in that same order;
  - non-finite strength/center inputs yield an empty result (never an unbounded march).
- `explosionEntityDamage(center, strength, positions)` → per-entity damage, mirroring vanilla's
  `damageEntities` with exposure = 1: `f = strength * 2`, `d = distance / f`,
  damage = `floor(((1-d)^2 + (1-d)) / 2 * 7 * f + 1)` for `d <= 1`; input order preserved; entities
  at or beyond `f` omitted.
- `explosionRays()` → the deterministic 1352-ray unit-direction sequence (exported for tests and
  future consumers).

## Non-goals
- **No random exposure roll.** Vanilla rolls a per-block chance based on ray exposure; this core's
  rule is deterministic (any positive-power ray destroys). The roll is a wiring concern for a real
  world — documented, not silently approximated.
- **No real block breaking / drop spawning / entity hurting.** The core returns positions and
  descriptors; applying them to a real world (163/164-style write-back) is a future wiring change.
- **No TNT block/entity** (that is 170), no creeper damage, no knockback vector, no fire spawning
  from explosions.
- **No `Game`/`World` wiring, no registry changes** — the first redstone-arc module since 163 with
  zero `BlockRegistry`/`ItemRegistry` footprint; resistances and drops are caller-supplied data.

## Preconditions
- Change 168 (`dispenser`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library and the module's own types (a genuinely standalone core).

## Proposed change
1. `src/simulation/ExplosionCore.ts` (NEW): `ExplosionWorld<S>` seam, `ExplosionInput`/
   `ExplosionResult`/`EntityDamage` types, `EXPLOSION_RAY_*` constants, `explosionRays()`,
   `computeExplosion()`, `explosionEntityDamage()`.

## Compatibility and migration
- One new simulation file; **zero** registry changes, zero characterization-test updates, no
  `Game.ts` edit, no schema/save-format change.

## Risks
- **An unbounded march for non-finite inputs** would hang the simulation. Mitigation: non-finite
  strength/center short-circuits to an empty result, and the per-ray loop decays by a strictly
  positive constant each iteration, so it always terminates in `ceil(strength / 0.225)` steps.
- **The destroyable/air distinction is easy to conflate** (fluids must absorb rays but never be
  destroyed). Mitigation: the world seam has separate `isAir` (resistance penalty) and
  `isDestroyable` (destruction filter) predicates, and a dedicated water test pins both halves.
- **The entity-damage formula is easy to mis-derive.** Mitigation: boundary tests at d=0 (57), d=0.5
  (22), and d=1 (1) for TNT strength, matching vanilla's exposure=1 values.

## Rollback strategy
One new file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: ray count/unit-length/determinism; all-air world destroys nothing; non-finite
  input short-circuit; a reached low-resistance block is destroyed and dropped; a second stone layer
  behind the first is NOT destroyed; water absorbs but is never destroyed (and shields behind);
  obsidian blocks everything; drops follow sorted destroyed order; cross-call determinism; entity
  damage at the center/mid/edge and beyond; input-order preservation; non-finite entity inputs.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
