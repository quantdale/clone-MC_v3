# Tasks: 195-spectator-mode

## Implementation
- [x] `src/simulation/SpectatorFramework.ts`: `noclip(mode)` — true only for spectator.
- [x] `hasGravity(mode)` / `hasCollision(mode)` — false only for spectator.
- [x] `canInteract(mode)` / `isAttackable(mode)` — false only for spectator.
- [x] `spectatorCameraAvailable(mode)` — true only for spectator.

## Tests
- [x] `tests/unit/SpectatorFramework.test.ts`: noclip table (all four modes).
- [x] Gravity/collision tables (all four modes).
- [x] Interaction/attackable tables (all four modes).
- [x] Camera table (all four modes).
- [x] Composed spectator profile: fly (192) + noclip + no gravity/collision + no interaction +
      not attackable + camera + no break/place (194); non-spectator modes gain no privileges.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2566/2566 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 196-weather-state).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
