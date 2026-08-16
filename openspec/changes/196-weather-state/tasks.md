# Tasks: 196-weather-state

## Implementation
- [x] `src/simulation/WeatherFramework.ts`: `WeatherState` + `WeatherRolls` + `createDefaultWeatherState`.
- [x] `setWeather` (clear/rain/thunder shapes; identity no-op on invalid weather or duration).
- [x] `tickWeather` state machine (doWeatherCycle gate; decrement then at most one transition:
      clear->rain, rain->clear, thunder start/end within rain).
- [x] `isRaining` / `isThundering` queries.
- [x] `serializeWeatherState` / `deserializeWeatherState` (version 1, validate-before-accept,
      descriptive throws).

## Tests
- [x] `tests/unit/WeatherFramework.test.ts`: default state; setWeather shapes and identity no-ops.
- [x] doWeatherCycle false -> identical state (frozen).
- [x] Transitions: clear->rain (decrement then roll); rain->clear; thunder start within rain
      (rain timer continues); thunder->rain; rain ends during thunder.
- [x] Queries for all three weathers.
- [x] Persistence: round-trip; rejections (non-object, bad version, unknown weather, non-integer/
      negative timers, unknown key) each named.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2574/2574 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 197-weather-rendering).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
