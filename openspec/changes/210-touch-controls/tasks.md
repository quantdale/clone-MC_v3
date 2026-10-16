# Tasks: 210-touch-controls

## Implementation
- [x] `src/simulation/TouchFramework.ts`: `TouchZoneId` / `TouchZone` / `TOUCH_ZONES` (7 zones
      with rects and actions) + `zoneAt` (first match, inclusive edges).
- [x] `TouchPoint` / `TouchDrag` / `dragVector` (scale 4, clamp [-1, 1], 209 deadzone) /
      `dragDelta` (raw offset).
- [x] `TouchInput` / `TouchInputState` / `resolveTouches` (action dedupe, last move/look touch
      wins, previous-less touches zero).

## Tests
- [x] `tests/unit/TouchFramework.test.ts`: zone table (7 zones, rects, actions); zoneAt
      (inside/edge/outside/overlap precedence).
- [x] Drag math: scale (0.1 -> 0.4); clamp (0.3 -> 1); deadzone (0.0125 -> 0); dragDelta raw.
- [x] Resolution: button dedupe; move/look last-wins; out-of-zone and empty lists; zero drags
      without previous.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2753/2753 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      211-internal-resource-pack-format).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
