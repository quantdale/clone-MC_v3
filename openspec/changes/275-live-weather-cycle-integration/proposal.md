# Proposal: 275-live-weather-cycle-integration

## Problem
Verified WeatherFramework (196) and WeatherPresentation (197) are not wired into the live Game. Players cannot see/control weather; `doWeatherCycle` does not drive a live store.

## Goals
- Live Game owns one world-scoped WeatherState; hydrate/serialize through GamePersistence (`__weather__`, versioned; degrade-to-default; reset/archive passthrough).
- Fixed-tick `tickWeather` gated by `doWeatherCycle`; deterministic duration rolls from world RNG.
- `/weather` / setWeather seam + HUD `#weather-indicator` + `environment.applyWeather(presentWeather(...))`.
- Unit + browser E2E: set weather → HUD → reload persists → rule ON advances / rule OFF freezes.
- 258 stays BLOCKED; no unrelated refactors.

## Non-goals
Multiplayer weather sync; particle systems beyond existing presentation; redesigning WeatherFramework API.
