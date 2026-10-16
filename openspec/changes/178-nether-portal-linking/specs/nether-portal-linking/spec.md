# Spec: nether-portal-linking

## Contract
This capability adds the first teleportation logic as pure functions over a `PortalLinkingWorld`
seam: the 1:8 coordinate scale, the destination portal search (deterministic, vanilla radii), the
creation-site search + frame/interior cell plan, the 300-tick cooldown, and safe-spawn placement.

## Definitions
- **Direction**: `overworld-to-nether` (scale = floor(x/8)) or `nether-to-overworld` (scale = x*8).
- **Search radius**: 16 toward the nether, 128 toward the overworld.
- **Spawn point**: the bottom-center interior cell of a shape, centered along its axis.

## Invariants
- `scalePortalPosition` floors toward the nether (negative coordinates included) and multiplies
  toward the overworld.
- `findNearestPortal` scans y ascending (0 then ±dy), then x, then z, all within ±radius; first hit
  wins; `null` when none.
- `portalSpawnIsSafe` requires the spawn cell and the cell above to be non-solid.
- `portalCooldownRemaining` = `max(0, last + 300 − now)`; non-finite inputs yield 300.
- `portalCreationSite` returns the first minimal site (downward 0..64, outward ±8) whose below-bar
  support is solid and whose ring + interior are all air.
- `portalFrameCells` returns 14 ring cells and `width×height` interior cells.

## Requirements

### Requirement: the coordinate scale is vanilla's 1:8
`scalePortalPosition(x, z, direction)` MUST return `[floor(x/8), floor(z/8)]` toward the nether and
`[x*8, z*8]` toward the overworld.

#### Scenario: both directions and negative coordinates
- **GIVEN** `(100, 80)` and `(-100, -80)`
- **THEN** toward the nether they become `[12, 10]` and `[-13, -10]`; toward the overworld `(12, 10)`
  becomes `[96, 80]`

### Requirement: the search radius is per direction
`portalSearchRadius` MUST return 16 for `overworld-to-nether` and 128 for `nether-to-overworld`.

#### Scenario: radii
- **GIVEN** both directions
- **THEN** the radii are 16 and 128

### Requirement: findNearestPortal finds an existing portal deterministically
`findNearestPortal` MUST return the first portal block found scanning y ascending (then x, then z)
within `±radius` of the center, or `null`.

#### Scenario: found, scan order, out-of-radius, empty
- **GIVEN** portal blocks inside and outside the radius, and an empty world
- **THEN** an in-radius block is returned; the y-lowest in-radius block wins; out-of-radius and
  empty worlds yield `null`

### Requirement: the spawn point and safety rule are correct
`portalSpawnPoint(shape)` MUST return the bottom-center interior cell centered along the axis;
`portalSpawnIsSafe` MUST be true only when the spawn cell and the cell above are non-solid.

#### Scenario: x- and z-axis spawns; blocked below and above
- **GIVEN** an x-axis 2×3 shape and a z-axis 3×3 shape
- **THEN** the spawn points are `[x0, y0, z0]` and `[x0, y0, z0+1]`; a clear world is safe, and a
  world with either the spawn cell or the cell above solid is not

### Requirement: the cooldown counts down from 300 ticks
`portalCooldownRemaining(lastTeleportTick, nowTick)` MUST return `max(0, last + 300 − now)`.

#### Scenario: cooldown boundaries
- **GIVEN** `last = 1000` and `now` of `1000`, `1200`, `1300`, and `5000`
- **THEN** the remainders are `300`, `100`, `0`, `0`

### Requirement: portalFrameCells plans the build
`portalFrameCells(shape)` MUST return exactly 14 distinct ring cells (both bars and both columns,
corners included) and `width×height` interior cells, deterministically.

#### Scenario: 2×3 frame
- **GIVEN** `{ axis: 'x', x0: 10, y0: 5, z0: 20, width: 2, height: 3 }`
- **THEN** the frame has 14 cells (including `[9, 4, 20]` and `[12, 8, 20]` corners), and the
  interior is the 6 cells `[10..11, 5..7, 20]`

### Requirement: portalCreationSite finds a buildable minimal site
`portalCreationSite(world, x, y, z)` MUST return a minimal 2×3 shape whose four below-bar cells are
solid and whose ring + interior are all air, searching downward (0..64) then outward (±8); `null`
when no such site exists.

#### Scenario: supported ground and no-site
- **GIVEN** a world with solid ground at y=0 and clear air above, and a fully solid world
- **THEN** a site is returned whose cells are all clear and whose support is solid; the solid world
  yields `null`

## Error and failure behavior
- No function throws for well-formed inputs; search/site misses yield `null`; non-finite cooldown
  inputs yield the full cooldown.

## Performance and resource bounds
- Search O((2r+1)²·(2r+1)); site search ≤ 65·17²·O(ring+interior).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- All results are plain values; `portalFrameCells` exposes the build plan.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 scale | `tests/unit/NetherPortalLinking.test.ts` › `scalePortalPosition` |
| REQ-2 radii | › `portalSearchRadius` |
| REQ-3 search | › `findNearestPortal` |
| REQ-4 spawn/safety | › `portalSpawnPoint and safety` |
| REQ-5 cooldown | › `portalCooldownRemaining` |
| REQ-6 frame cells | › `portalFrameCells` |
| REQ-7 creation site | › `portalCreationSite` |
