# Tasks: 182-end-portal-progression

## Implementation
- [x] `src/simulation/EndPortalProgression.ts`: `END_OBSIDIAN_PLATFORM_Y` (49) /
      `END_OBSIDIAN_PLATFORM_HALF_SIZE` (2) / `END_PORTAL_FRAME_COUNT` (12) / `END_PORTAL_RING_SIZE` (5).
- [x] `endObsidianPlatformPositions` (25 cells, y=49, x/z −2..2); `endSpawnPosition` ([0.5, 50, 0.5]).
- [x] `endPortalFrameCells` (16 ring) / `endPortalInteriorCells` (9 hole) / `endPortalEyeCells`
      (12 edge middles, corners excluded).
- [x] `endPortalIsActivated` (`>= 12`).
- [x] `endPortalDestination` (platform spawn); `endTeleportIsReady` (178 cooldown at 0).
- [x] `endReturnGatewayAllowed` (exactly `dragonDefeated`).

## Tests
- [x] `tests/unit/EndPortalProgression.test.ts`: platform exactly 25 cells at y=49 covering −2..2;
      spawn at [0.5, 50, 0.5].
- [x] Frame ring 16 + interior 9, no overlap, union 25, corners in ring.
- [x] Eye slots exactly 12, corners excluded.
- [x] Activation false at 0/11, true at 12/13.
- [x] Destination equals spawn; cooldown gating (100 remaining false, expired true).
- [x] Return gateway false/true.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2436/2436 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 183-ender-dragon-boss).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
