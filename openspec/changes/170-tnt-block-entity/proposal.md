# Proposal: 170-tnt-block-entity

## Problem
169 built the explosion core but nothing in the codebase can *be* an explosive. Vanilla's TNT is the
canonical primed-explosive: a stateless block that, when powered or touched by fire, disappears and
becomes a primed entity with a fuse that counts down on the fixed 20 TPS clock; at zero it detonates
with strength 4. Without it, 169's core has no first consumer and the redstone/automation arc's
destruction story is incomplete (creeper, bed misfire, respawn-anchor later reuse the same shape).

## Goals
- A stateless `tnt` block (`BlockId/ItemId.Tnt = 53`, one state — vanilla TNT has no blockstate
  properties) and a placing item.
- `tntShouldPrime(powered, fireAdjacent)`: the block-level trigger — a **162-style powered consumer**
  (`powered || fireAdjacent`), deliberately NOT the inverted 166-168 lockout.
- `tntFuseTicks(cause)`: 80 ticks for `'redstone'` (vanilla's 4 s), 20 for `'fire'` (deterministic
  stand-in for vanilla's random 10-30, consistent with 169's no-random-roll stance).
- `primeTnt(x, y, z, cause)`: the block disappears and a `PrimedTnt` descriptor appears (vanilla's
  PrimedTnt entity modeled as pure data, exactly as 167 modeled `DroppedItem`).
- `tickPrimedTnt(primed, elapsedTicks)` (fuse clamps at 0; non-finite/negative elapsed ignored) and
  `primedTntIsDue(primed)`.
- `explodePrimedTnt(primed, world)`: the first consumer of 169's `computeExplosion` — strength 4
  centered on the primed block center. The caller applies destroyed/drops (164-style write-back).

## Non-goals
- **No real entity spawn** (a live 129-style PrimedTnt), **no real block break**, **no knockback
  vector**, **no explosion fire spawning** — the module returns descriptors/positions; applying them
  is a future wiring change.
- **No chain-priming through other TNT** and **no player-lit priming** (right-click) — those are
  wiring behaviors, not core semantics.
- **No `Game`/`World` wiring** — same discipline as 166-169.

## Preconditions
- Change 169 (`explosion-core`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/ExplosionCore.ts` (169, `computeExplosion`/`ExplosionWorld`).

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `BlockId.Tnt = 53` — stateless def (no `propertySchema`).
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.Tnt = 53` placing it.
3. `src/simulation/TntPriming.ts` (NEW): `TntPrimingCause`, `PrimedTnt`, `TNT_STRENGTH`,
   `TNT_FUSE_TICKS_REDSTONE`/`FIRE`, `tntShouldPrime`, `tntFuseTicks`, `primeTnt`, `tickPrimedTnt`,
   `primedTntIsDue`, `explodePrimedTnt`.

## Compatibility and migration
- One additive stateless block id and one additive item id plus one new simulation file (reusing 169's
  `computeExplosion`). One characterization update (`BlockRegistry` `all()` 41→42) — the stateful-block
  tests need no change because TNT is single-state. No `Game.ts` edit; no schema/save-format change.

## Risks
- **The priming rule is easy to copy-paste backwards** from 166-168 (using `!powered`). Mitigation:
  the design doc explicitly calls out that TNT is a *powered* consumer, and `tntShouldPrime` is tested
  at all four input combinations.
- **The fire fuse (random 10-30 in vanilla) tempts a non-deterministic implementation.** Mitigation:
  fixed 20, documented as the deterministic stand-in.
- **The fuse could go negative** if elapsed > fuse. Mitigation: `tickPrimedTnt` clamps at 0 and
  `primedTntIsDue` is `fuseTicks <= 0`; non-finite/negative elapsed are ignored.

## Rollback strategy
One new file plus two additive registry entries and their test updates; reverting removes the feature
cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: stateless block registration + single-state enumeration; item places the block +
  cross-references; fuse ticks (80/20); all four `tntShouldPrime` combinations; `primeTnt` descriptor
  shape; fuse decrement/clamp/non-finite handling; `primedTntIsDue`; `explodePrimedTnt` reaching a
  stone block one block east, empty-world none, block-center resolution, and determinism.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
