# Proposal: 171-rail-block-states

## Problem
170 finished the explosive block but nothing in the codebase can carry a *vehicle*: rails — the first
transport block — don't exist. Vanilla's rail is the first multi-shape block whose geometry depends
on its *neighbors*: 10 shapes (2 flat straights, 4 ascents, 4 corners) chosen from the presence and
height of adjacent rails, plus a placement rule (solid support below) and neighbor-driven shape
updates. Without it, 172's minecart physics has nothing to constrain movement to.

## Goals
- `RailShape`: the ten vanilla rail shapes; `RAIL_SHAPES` stable enumeration.
- `resolveRailShape(neighbors)`: the deterministic connection rule with documented precedence —
  straight pairs first (ascending toward an elevated side), then corners (perpendicular same-level
  pairs), then single-neighbor ascents/flats, else `north_south`.
- `railNeighborInfo(world, x, y, z, direction)`: samples a same-height rail (level 0) or a one-higher
  rail (level 1) in a horizontal direction, via a caller-supplied `RailNeighborWorld<S>` seam.
- `railHasSupport(world, x, y, z)`: the placement rule — a solid-supporting block directly below.
- `railShapeConnections(shape)`: the connected directions per shape (test surface + future
  rendering/collision).
- `railStateProperties(shape)`: the `{ shape }` state projection.
- A `rail` block with the 10-state `RAIL_SCHEMA` (default `north_south`) and a placing item.

## Non-goals
- **No powered rail / detector rail / activator rail** (they are content expansions, not shape
  semantics; the shape machinery is shared).
- **No real shape *updates* applied to a world** (removing a neighbor and re-resolving is a wiring
  change: the resolver is the computation, the caller applies the new state).
- **No minecart movement or collision** (that is 172), no rail breaking on support removal (a wiring
  concern).
- **No `Game`/`World` wiring** — same discipline as 166-170.

## Preconditions
- Change 170 (`tnt-block-entity`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/RedstoneSignal.ts` (154, `DIRECTION_OFFSETS` for horizontal neighbor offsets).

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `RAIL_SCHEMA` (`shape` named, 10 values from `RAIL_SHAPES`);
   `BlockId.Rail = 54`.
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.Rail = 54` placing it.
3. `src/simulation/RailBlockStates.ts` (NEW): `RailShape`, `RAIL_SHAPES`, `HorizontalDirection`,
   `RailLevel`, `RailNeighbor`, `resolveRailShape`, `railNeighborInfo`, `railHasSupport`,
   `railShapeConnections`, `railStateProperties`.

## Compatibility and migration
- One additive block id and one additive item id plus one new simulation file (shared `RAIL_SHAPES`
  constant with the registry schema). Requires the documented three characterization-test updates
  (rail is the 20th multi-state block: 10 states). No `Game.ts` edit; no schema/save-format change.

## Risks
- **The connection precedence is easy to get wrong** (corners beating straights, or elevated corners).
  Mitigation: the precedence is documented and each branch has a dedicated test (straight-over-corner
  with three neighbors, elevated neighbor never corners).
- **The level convention (0 = same height, 1 = higher) is easy to invert.** Mitigation: both
  `railNeighborInfo` levels are pinned by dedicated world tests.
- **10 shape values in two places (module + schema) could drift.** Mitigation: the schema's values
  spread `RAIL_SHAPES` — a single source of truth, and a test asserts the schema legal values match.

## Rollback strategy
One new file plus two additive registry entries and their test updates; reverting removes the feature
cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: block/item registration + exact 10-state enumeration; all resolver branches
  (no-neighbor default, both straights, all four ascents on straight pairs, all four corners,
  no-corner-with-elevated, straight-precedence over corner, single-neighbor cases); `railNeighborInfo`
  at both levels and absent; support rule both ways; connections for all 10 shapes; state projection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
