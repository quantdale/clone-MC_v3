# Tasks: 197-weather-rendering

## Implementation
- [x] `src/rendering/WeatherPresentation.ts`: `RAIN_SKY_DARKNESS` / `THUNDER_SKY_DARKNESS`
      constants and the `WeatherPresentation` interface.
- [x] `presentWeather(state)` — the fixed per-kind table, O(1), read-only.

## Tests
- [x] `tests/unit/WeatherPresentation.test.ts`: exact descriptors for clear/rain/thunder.
- [x] Timer independence (same weather, different timers -> deep-equal descriptors).
- [x] Read-only contract (input state deep-equals its original after the call).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2592/2592 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 198-sleep-and-time-skip).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
