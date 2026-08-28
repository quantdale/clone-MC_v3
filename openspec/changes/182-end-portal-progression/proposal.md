# Proposal: 182-end-portal-progression

## Problem
181 generates the End, but nothing lets the player *reach* it: no obsidian spawn platform, no End
portal activation rule, no teleport semantics, no return-gateway baseline. The End's entry/exit
flow — the progression capstone — is entirely unwired.

## Goals
- `src/simulation/EndPortalProgression.ts` (NEW), pure and deterministic:
  - **Obsidian platform**: `endObsidianPlatformPositions()` — the 25 cells of the 5×5 pad at
    `END_OBSIDIAN_PLATFORM_Y = 49` (x/z −2..2, vanilla); `endSpawnPosition()` = `[0.5, 50, 0.5]`
    (standing on the platform center).
  - **Portal activation**: `endPortalFrameCells` (16 ring cells of the 5×5 frame), `endPortalEyeCells`
    (the 12 edge-middle eye slots; corners take no eyes), `endPortalInteriorCells` (the 3×3 hole),
    and `endPortalIsActivated(insertedEyeCount)` — true iff all `END_PORTAL_FRAME_COUNT = 12` eyes
    are inserted (an item requirement, per 179's documented eyes-of-ender deferral: the eyes are
    items; the blaze that makes them is 218's scope).
  - **Teleport**: `endPortalDestination()` = the platform spawn (every End portal entry arrives
    there); `endTeleportIsReady(lastTeleportTick, nowTick)` gates re-entry via 178's
    `portalCooldownRemaining` (300 ticks).
  - **Return gateway**: `endReturnGatewayAllowed(dragonDefeated)` = exactly `dragonDefeated` — the
    exit portal only exists once the dragon is dead; before 183/184 no defeat state exists, so the
    baseline answer is `false`.

## Non-goals
- **No end_portal/end_portal_frame/obsidian registry entries** (215's content expansion), **no
  actual teleportation/entity moves** (wiring), **no dragon defeat state** (183/184 own it — this
  module only consumes the boolean), **no `Game`/`World` wiring**.

## Preconditions
- Change 181 (`end-world-generation`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/NetherPortalLinking.ts` (178, `portalCooldownRemaining`).

## Proposed change
1. `src/simulation/EndPortalProgression.ts` (NEW): the constants and seven functions above.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Frame geometry errors** (wrong ring/interior split). Mitigation: the geometry test asserts 16
  ring + 9 interior cells, no overlap, 25 total, corners-in-ring, and exactly 12 eye slots with
  corners excluded.
- **Return-gateway inversion** (allowing return before the dragon dies). Mitigation:
  `endReturnGatewayAllowed` is pinned at both values with the baseline documented as `false`.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All seven functions implemented per design.md/spec.md.
- Unit tests cover: platform cells (exactly 25, y=49, −2..2) + spawn; frame ring/interior/eye-slot
  geometry; activation at 11/12/13 eyes; destination; cooldown gating (100 remaining vs expired);
  return-gateway both values.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
