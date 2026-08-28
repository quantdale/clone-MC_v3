# Proposal: 178-nether-portal-linking

## Problem
177 validates portal frames but nothing links them across dimensions: no coordinate scaling, no
destination search or creation, no teleport cooldown, no safe-spawn rule. Without it, a validated
portal is decoration — the first teleportation logic is the missing step between "a portal exists"
and "a player can travel".

## Goals
- `src/simulation/NetherPortalLinking.ts` (NEW), pure and deterministic:
  - **Coordinate scale**: `scalePortalPosition(x, z, direction)` — overworld↔nether is 1:8
    (`NETHER_PORTAL_SCALE = 8`); toward the nether floors (`floor(x/8)`, vanilla), toward the
    overworld multiplies (`x*8`).
  - **Destination search**: `findNearestPortal(world, cx, cy, cz, radius)` — deterministic
    box scan (y ascending, then x, then z) for an existing portal block; radii per direction:
    `PORTAL_SEARCH_RADIUS_NETHER = 16`, `PORTAL_SEARCH_RADIUS_OVERWORLD = 128` (vanilla).
  - **Creation**: `portalCreationSite(world, x, y, z)` — deterministic search (downward up to 64,
    then outward ±8) for a minimal 4×5 frame site (bottom bar resting on solid support, ring and
    interior clear), returning the `PortalShape` to build; `portalFrameCells(shape)` lists the
    14 ring cells and 6 interior cells a wiring change places.
  - **Cooldown**: `portalCooldownRemaining(lastTeleportTick, nowTick)` —
    `PORTAL_TELEPORT_COOLDOWN_TICKS = 300` (vanilla), clamped at 0.
  - **Safe placement**: `portalSpawnPoint(shape)` (bottom-center interior cell, centered along the
    axis) and `portalSpawnIsSafe(world, x, y, z)` (two blocks of clearance: the spawn cell and the
    cell above are non-solid).

## Non-goals
- **No entity teleportation/state change, no chunk loading at destinations, no frame auto-lighting**
  — the wiring change applies these results; this module computes them.
- **No obsidian/portal-block registry changes** (the seam supplies identity).
- **No `Game`/`World` wiring.**

## Preconditions
- Change 177 (`nether-portal-blocks`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/NetherPortal.ts` (177, `PortalShape`).

## Proposed change
1. `src/simulation/NetherPortalLinking.ts` (NEW): `PortalTravelDirection`, `PortalLinkingWorld`,
   the constants, and the six functions above.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Scale direction inversion** (multiplying toward the nether would scatter portals 8× apart).
  Mitigation: both directions pinned by tests, including negative coordinates (floor division).
- **The creation-site search being non-deterministic or unbounded**. Mitigation: fixed downward
  then outward order, bounded (64 down, ±8 around), first fit wins — pinned by a ground-supported
  site test and a no-site test.
- **Spawn points inside solid blocks**. Mitigation: `portalSpawnIsSafe` requires two blocks of
  clearance; both blocked-below and blocked-above cases are tested.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All six functions implemented per design.md/spec.md.
- Unit tests cover: scale both directions + negatives; radii per direction; portal search found/
  scan-order/out-of-radius/empty; spawn point for x- and z-axis shapes; safety both ways; cooldown
  boundaries; frame cells (14 ring + 6 interior for 2×3); creation site found on supported ground
  with the ring/interior clear; no-site rejection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
