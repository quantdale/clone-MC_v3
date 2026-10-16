# Proposal: 172-minecart-physics

## Problem
171 added rail shapes but nothing can *move along* them. Vanilla minecarts are the rail consumers:
entities whose position/velocity are constrained by the rail shape in their cell — straights hold
them at rail height on one axis, ascents raise/lower them with the slope, corners turn them, and
solid blocks stop them. Without this core, the rail block is decoration and the redstone/automation
arc's transport story (and 173's regression suite) has nothing to simulate.

## Goals
- `tickMinecart(state, world)`: advances a `MinecartState` (position + velocity) exactly one fixed
  20 TPS tick through a caller-supplied `MinecartWorld` seam (`getRailShapeAt`/`isBlocking`):
  - **straights** (`north_south`/`east_west`): hold rail height (`vy = 0`), zero the cross-axis, slide
    along the rail's axis;
  - **ascents**: `vy` equals the horizontal speed toward the ascent (`vy = vx` on `ascending_east`,
    symmetric for the other three) — one block up per block horizontal;
  - **corners**: a cart arriving along one of the corner's two directions (pure incoming axis) turns
    onto the other; any other arrival stops at the corner;
  - **speed clamp**: `MINECART_MAX_SPEED = 0.4` blocks/tick (vanilla's 8 m/s) on rails;
  - **off rails**: gravity `MINECART_GRAVITY = 0.04`/tick² and horizontal decay
    `MINECART_OFFRAIL_DECAY = 0.98`/tick;
  - **collisions**: if the next cell is blocking, the cart stops dead (velocity zeroed, position
    unchanged) — also the landing rule for a falling cart on solid ground.
- `minecartOnRails(state, world)`: whether the cart's cell contains a rail.

## Non-goals
- **No minecart entity/block/item** (vanilla carts are entities; the registry change belongs to a
  later content/wiring change), no boosters/furnace carts, no derailing, no rider attachment.
- **No `Game`/`World` wiring** — same discipline as 166-171; the caller owns the world seam and
  applies the returned states.
- **No interaction with 169's TNT** (a cart hitting TNT is a wiring concern).

## Preconditions
- Change 171 (`rail-block-states`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/RailBlockStates.ts` (171, `RailShape`).

## Proposed change
1. `src/simulation/MinecartPhysics.ts` (NEW): `MinecartState`, `MinecartWorld`,
   `MINECART_MAX_SPEED`/`MINECART_GRAVITY`/`MINECART_OFFRAIL_DECAY`, `minecartOnRails`,
   `tickMinecart`. **Zero registry changes** (a pure core, like 169).

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization-test updates, no `Game.ts`
  edit, no schema/save-format change.

## Risks
- **The ascent sign conventions are easy to flip** (north = −z, west = −x). Mitigation: all eight
  ascent cases (up and down, all four directions) are pinned by table-driven tests with
  hand-computed expected velocities.
- **Corner turning on a diagonal arrival is easy to over-apply** (turning a cart that isn't moving
  along the corner's axis). Mitigation: turns require a *pure* incoming axis (other component exactly
  0) — documented and tested with a diagonal-arrival stop case.
- **The collision rule's cell semantics are easy to test wrong** (a cart mid-cell doesn't enter the
  next cell in one tick). Mitigation: the blocking tests position the cart one tick from the wall and
  assert the stop at the pre-wall position.

## Rollback strategy
One new file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: `minecartOnRails` both ways; both straights; all eight ascent cases; all eight
  corner turns + the diagonal-arrival stop; speed clamping; off-rail gravity + decay; the wall-stop
  collision; the falling-cart landing collision.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
