# Proposal: 177-nether-portal-blocks

## Problem
176 generates Nether terrain but there is no way to *enter* it: no portal block, no frame
validation. Vanilla's Nether portal is a vertical rectangle of obsidian (1 block thick, **corners
required** since 1.16) whose interior fills with `nether_portal` blocks when lit. The frame rule is
the first *frame-validation* logic in the codebase, and the portal block (axis x|z) is the first
Nether block. Without it, 178's linking/teleport has no validated destination geometry.

## Goals
- `src/simulation/NetherPortal.ts` (NEW):
  - `validatePortalFrame(world, x, y, z)` — pure frame validation over a caller-supplied seam
    (`isAir`/`isFire`/`isObsidian`): from an interior cell (typically where fire sits while
    lighting), probe both axes deterministically ('x' first, then 'z') and return the first valid
    `PortalShape` (`axis`, `x0/y0/z0`, `width`, `height`), or `null`:
    - interior **width 2..21**, **height 3..21** (vanilla bounds; `MAX_PORTAL_SIZE = 21`);
    - the entire 1-thick ring — bottom/top bars and left/right columns, **corners included** —
      must be obsidian;
    - the interior must be air or fire (the lighting fire lives inside the opening);
  - `portalBlockPositions(shape)` — the interior cells a wiring change fills with portal blocks;
  - `portalStateProperties(axis)` — the `{ axis }` state projection.
- A `nether_portal` block: `PORTAL_SCHEMA` (`axis` 'x'|'z', default 'x', 2 states), unbreakable and
  with **no item** (portals cannot be obtained), `BlockId.NetherPortal = 55`.

## Non-goals
- **No teleportation/linking/cooldown** (178), **no fire-ignition wiring, no obsidian block** (the
  seam supplies obsidian identity), **no frame-building** — validation and lifecycle data only.
- **No `Game`/`World` wiring** — same discipline as the section so far.

## Preconditions
- Change 176 (`nether-world-generation`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/world/BlockRegistry.ts`, `src/world/BlockPropertySchema.ts` (006), 174's `DimensionManager`
  (unchanged, portal consumers come later).

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `BlockId.NetherPortal = 55`, `PORTAL_SCHEMA`, the unbreakable
   no-drop def.
2. `src/simulation/NetherPortal.ts` (NEW): `PortalAxis`, `PortalShape`, `PortalFrameWorld`,
   `MIN_PORTAL_WIDTH`/`MIN_PORTAL_HEIGHT`/`MAX_PORTAL_SIZE`, `validatePortalFrame`,
   `portalBlockPositions`, `portalStateProperties`.

## Compatibility and migration
- One additive block id (no item) plus one new simulation file. Requires the documented three
  characterization updates (nether_portal is the 21st multi-state block, 2 states). No `Game.ts`
  edit; no schema/save-format change.

## Risks
- **Corners being optional** (a 1.15-era reader might skip them). Mitigation: the design and tests
  pin vanilla 1.16+ semantics — removing any single ring cell (corner or bar) invalidates the frame.
- **The greedy axis probe wandering into terrain** for the wrong orientation. Mitigation: probes are
  bounded by `MAX_PORTAL_SIZE`, require the far walls to be obsidian, and the full ring + interior
  validation rejects any false positive.
- **The portal block being obtainable** (an item that places it). Mitigation: no item entry and
  `breakable: false` (matching the cross-reference validator's unbreakable-no-drop rule).

## Rollback strategy
One new simulation file plus one additive registry entry and test updates; reverting removes the
feature cleanly.

## Definition of Done
- All listed functions implemented per design.md/spec.md.
- Unit tests cover: block registration (2 states, default axis x, no item, cross-refs pass); minimal
  4×5 frame (interior 2×3, axis x); Z-oriented frame (axis z); fire-in-interior acceptance; missing
  corner/top-bar rejection; too-narrow/too-short rejection; non-air ignition rejection; empty-world
  rejection; `portalBlockPositions` (column-major order); state projection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
