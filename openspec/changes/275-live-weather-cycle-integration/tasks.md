# Tasks: 275-live-weather-cycle-integration

## A. Control plane
- [x] T1. Sequence + overrides + PROGRAM_STATE ACTIVE (lastCompleted=274, 258 BLOCKED, session head f872c88).
- [x] T2. Package quality gate (SPEC_AUTHORING_PROTOCOL).

## B. Persistence
- [x] T3. `__weather__` put/get + GamePersistence hydrate/save/degrade/reset + WeatherPersistence unit suite.
- [x] T4. Archive passthrough (WorldArchive/WorldArchiver) + unit cases.

## C. Live store
- [x] T5. Game weather field, boot hydration, tickWeather(doWeatherCycle), setWeather/setWeatherFromText/getWeatherState, saveWeather at autosave/dispose/pagehide.
- [x] T6. Presentation wiring (presentWeather → applyWeather) + HUD `#weather-indicator`.

## D. Tests + gate
- [x] T7. Unit WeatherIntegration seams.
- [x] T8. E2E weather-cycle.spec.ts.
- [x] T9. Full gates + PARITY C275 + VERIFIED + publish.
