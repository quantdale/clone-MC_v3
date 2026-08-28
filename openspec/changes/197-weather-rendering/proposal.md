# Proposal: 197-weather-rendering

## Problem
196 owns the weather simulation truth but nothing presents it: no rain intensity, no sky
darkening, no thunder indicators, no sound levels for a rendering layer to consume. The visuals
and audio must derive from the simulation without changing it.

## Goals
- `src/rendering/WeatherPresentation.ts` (NEW), pure and headless-safe (no scene access, no
  mutation — the simulation truth is READ ONLY):
  - **Bundle**: `presentWeather(state)` — takes 196's `WeatherState` and returns a single
    immutable `WeatherPresentation` descriptor:
    - `rainIntensity` — 0 for clear, 1 for rain and thunder.
    - `thunderIntensity` — 0 for clear/rain, 1 for thunder.
    - `skyDarkness` — 0 for clear, 0.25 for rain, 0.5 for thunder (vanilla-inspired constants
      `RAIN_SKY_DARKNESS` / `THUNDER_SKY_DARKNESS`).
    - `rainSoundLevel` / `thunderSoundLevel` — 0/1 per the same table.
  - **Read-only contract**: presentation is a pure function of the weather kind; the input state
    is never mutated and timers never influence the presentation (only `weather` matters).

## Non-goals
- **No Three.js scene wiring / shaders / particle emitters** (the rendering composition owns
  them), **no audio playback** (the audio system consumes the levels), **no lightning flash
  timing/RNG** (the wiring owns randomness), **no `Game.ts` edit**, **no simulation changes**.

## Preconditions
- Change 196 (`weather-state`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 196's `WeatherState` type (imported type only) and 191's `WeatherKind`.

## Proposed change
1. `src/rendering/WeatherPresentation.ts` (NEW): the constants, the per-kind table, and
   `presentWeather`.

## Compatibility and migration
- One new rendering file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Presentation/simulation drift**. Mitigation: the table is pinned per weather kind in tests
  with the constants exported and asserted.
- **Accidental mutation of simulation truth**. Mitigation: a test deep-equals the input
  `WeatherState` after `presentWeather` (pure function contract).

## Rollback strategy
One new rendering file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: the full presentation table for all three weather kinds; the exported
  darkness constants; input non-mutation; timers having no influence on the presentation.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
