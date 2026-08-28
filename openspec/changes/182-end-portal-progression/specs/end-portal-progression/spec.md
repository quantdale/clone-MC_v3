# Spec: end-portal-progression

## Contract
This capability adds the End's entry/exit baseline: the 5×5 obsidian spawn platform (y=49) and its
spawn point, the End portal's 5×5 frame geometry (16 ring cells, 12 eye slots, 3×3 hole), the
activation rule (all 12 eyes), the teleport destination and cooldown gate (178), and the
return-gateway rule (exists iff the dragon is defeated).

## Definitions
- **Platform**: 25 obsidian cells at y=49, x/z −2..2.
- **Spawn**: `[0.5, 50, 0.5]` (standing on the platform center).
- **Eyes**: 12 (vanilla); the eye slots are the ring's edge-middle cells.

## Invariants
- The platform is exactly 25 cells; the frame ring exactly 16; the interior exactly 9; no overlap;
  the 12 eye slots exclude the 4 corners.
- `endPortalIsActivated(n)` is `n >= 12`.
- `endPortalDestination` is the spawn; `endTeleportIsReady` is 178's cooldown at 0.
- `endReturnGatewayAllowed(dragonDefeated)` is exactly `dragonDefeated`.

## Requirements

### Requirement: the platform and spawn are exact
`endObsidianPlatformPositions()` MUST return exactly 25 distinct cells at y=49 covering x/z −2..2,
and `endSpawnPosition()` MUST be `[0.5, 50, 0.5]`.

#### Scenario: platform cells and spawn
- **GIVEN** the default constants (HALF_SIZE 2, Y 49)
- **THEN** the 25 cells cover every (dx, dz) in −2..2 at y=49 and nothing else; the spawn is
  `[0.5, 50, 0.5]`

### Requirement: the frame geometry is a 5×5 ring with 12 eye slots
`endPortalFrameCells` MUST return the 16 ring cells, `endPortalInteriorCells` the 9 hole cells (no
overlap, union 25), and `endPortalEyeCells` exactly the 12 edge-middle cells (corners excluded).

#### Scenario: geometry
- **GIVEN** a frame centered at (0, 64, 0)
- **THEN** the ring has 16 cells including the four corners, the interior has 9 cells, the sets are
  disjoint, and the eye slots are the 12 edge middles (e.g. (−1, 64, −2), (0, 64, −2), (1, 64, −2))
  with (−2, 64, −2) excluded

### Requirement: activation requires all 12 eyes
`endPortalIsActivated(insertedEyeCount)` MUST be true iff `insertedEyeCount >= 12`.

#### Scenario: activation boundary
- **GIVEN** counts 0, 11, 12, 13
- **THEN** the results are false, false, true, true

### Requirement: teleport semantics are deterministic
`endPortalDestination()` MUST equal `endSpawnPosition()`; `endTeleportIsReady(lastTeleportTick,
nowTick)` MUST be true exactly when 178's `portalCooldownRemaining` is 0.

#### Scenario: destination and cooldown gate
- **GIVEN** last teleport at tick 1000
- **THEN** the destination is `[0.5, 50, 0.5]`; at tick 1200 re-entry is not ready (100 remaining);
  at tick 1300 it is

### Requirement: the return gateway is dragon-gated
`endReturnGatewayAllowed(dragonDefeated)` MUST be exactly `dragonDefeated` (the baseline: before
183/184 no defeat state exists, so it is `false`).

#### Scenario: both values
- **GIVEN** `false` and `true`
- **THEN** the results are `false` and `true`

## Error and failure behavior
- No function throws for well-formed inputs; geometry functions are total.

## Performance and resource bounds
- All functions O(≤ 25).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- Geometry sets are enumerable; activation/gate booleans are explicit.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 platform + spawn | `tests/unit/EndPortalProgression.test.ts` › platform |
| REQ-2 frame geometry | › frame geometry |
| REQ-3 activation | › activation |
| REQ-4 teleport flow | › teleport flow |
| REQ-5 return gateway | › return gateway |
