# Tasks: 178-nether-portal-linking

## Implementation
- [x] `src/simulation/NetherPortalLinking.ts`: `PortalTravelDirection`; `PortalLinkingWorld` seam.
- [x] `NETHER_PORTAL_SCALE` (8); `PORTAL_SEARCH_RADIUS_NETHER` (16) / `OVERWORLD` (128);
      `PORTAL_TELEPORT_COOLDOWN_TICKS` (300).
- [x] `scalePortalPosition` (floor toward the nether, multiply toward the overworld).
- [x] `portalSearchRadius` (16 | 128).
- [x] `findNearestPortal` (deterministic y→x→z box scan).
- [x] `portalSpawnPoint` (bottom-center interior, centered along the axis).
- [x] `portalSpawnIsSafe` (two blocks of clearance).
- [x] `portalCooldownRemaining` (clamped; non-finite → full cooldown).
- [x] `portalCreationSite` (downward-then-outward bounded search; support + clear ring/interior).
- [x] `portalFrameCells` (14 ring + width×height interior cells).

## Tests
- [x] `tests/unit/NetherPortalLinking.test.ts`: scale both directions + negative floor division.
- [x] Radii per direction.
- [x] Search: found in radius; scan order (y ascending wins); out-of-radius null; empty null.
- [x] Spawn point for x-axis (width 2) and z-axis (width 3) shapes.
- [x] Safety: clear; blocked below; blocked above.
- [x] Cooldown: at teleport (300), mid (100), expired (0), far future (0).
- [x] Frame cells: 14 ring + 6 interior for 2×3; corners and column cells present.
- [x] Creation site: found on supported ground (site above the bar, ring/interior clear);
      null in a fully solid world.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2407/2407 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      179-nether-content-baseline).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
