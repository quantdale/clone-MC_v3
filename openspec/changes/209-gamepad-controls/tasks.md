# Tasks: 209-gamepad-controls

## Implementation
- [x] `src/simulation/GamepadFramework.ts`: `GAMEPAD_DEADZONE` (0.15) + `applyDeadzone`.
- [x] `GamepadAxisPair` / `movementVector` / `lookVector`.
- [x] `GAMEPAD_BUTTON_MAP` (standard mapping) + `pressedActions` (action order, short arrays,
      custom map override).
- [x] `UiNavState` / `uiNav` (dpad + face buttons).

## Tests
- [x] `tests/unit/GamepadFramework.test.ts`: deadzone (0, ±0.15 boundary, above, custom
      threshold).
- [x] Stick vectors (clean, deadzoned, partial axes).
- [x] Button map constants; pressedActions (none/single/multiple, short arrays, custom map,
      order).
- [x] uiNav (dpad directions, confirm/cancel, absent buttons).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2743/2743 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 210-touch-controls).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
