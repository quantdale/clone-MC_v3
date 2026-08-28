# Design: 197-weather-rendering

## Context/current state
- 196 provides the deterministic `WeatherState` (weather kind + timers) — the simulation truth.
  Nothing presents it to the rendering/audio layers. 197 adds the pure presentation mapping.

## Target state
- `src/rendering/WeatherPresentation.ts` holding the presentation constants, the per-kind table,
  and `presentWeather(state)` returning an immutable `WeatherPresentation` descriptor.

## Invariants
- Pure and headless-safe: no scene access, no mutation, no randomness.
- The presentation depends ONLY on `state.weather` — timers never influence it.
- The input `WeatherState` is never mutated (pure function contract, pinned by a test).
- The table is fixed: clear -> (0, 0, 0, 0, 0); rain -> (1, 0, 0.25, 1, 0); thunder ->
  (1, 1, 0.5, 1, 1) for (rainIntensity, thunderIntensity, skyDarkness, rainSoundLevel,
  thunderSoundLevel).

## API and data model
```ts
// src/rendering/WeatherPresentation.ts (new)
export const RAIN_SKY_DARKNESS = 0.25;
export const THUNDER_SKY_DARKNESS = 0.5;

export interface WeatherPresentation {
  rainIntensity: number;      // 0 = none, 1 = full rain (rain and thunder)
  thunderIntensity: number;   // 0 = none, 1 = thunderstorm
  skyDarkness: number;        // 0 = clear, 0.25 = rain, 0.5 = thunder
  rainSoundLevel: number;     // 0 or 1
  thunderSoundLevel: number;  // 0 or 1
}

export function presentWeather(state: WeatherState): WeatherPresentation;
```

## Control/data flow
1. The rendering/audio composition reads 196's current `WeatherState` each frame.
2. `presentWeather(state)` maps it to a descriptor; the composition applies intensities/sound
   levels. Lightning flash timing stays with the wiring (RNG-owned), using `thunderIntensity` as
   the gate.

## Detailed behavior
- clear: `{ rainIntensity: 0, thunderIntensity: 0, skyDarkness: 0, rainSoundLevel: 0,
  thunderSoundLevel: 0 }`.
- rain: `{ rainIntensity: 1, thunderIntensity: 0, skyDarkness: RAIN_SKY_DARKNESS, rainSoundLevel:
  1, thunderSoundLevel: 0 }`.
- thunder: `{ rainIntensity: 1, thunderIntensity: 1, skyDarkness: THUNDER_SKY_DARKNESS,
  rainSoundLevel: 1, thunderSoundLevel: 1 }`.

## Failure modes
- None — a total function over the three weather kinds.

## Compatibility/migration
- One new rendering file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- O(1); a single frozen descriptor object per call.

## Testing seams
- Tests construct `WeatherState`s with varied timers for the same weather kind and assert the
  descriptor is identical (timers irrelevant); a non-mutation check deep-equals the input after
  the call.

## Observability/debugging
- The descriptor is a plain immutable object; every field is inspectable.

## Affected files/symbols
- `src/rendering/WeatherPresentation.ts` (new).
- Tests: `tests/unit/WeatherPresentation.test.ts` (new). No other files.

## Rejected alternatives
- **Interpolated intensities (smooth fade-in)**: rejected — 197 pins the deterministic mapping;
  smooth transitions are the composition's concern (it can lerp between descriptors).
- **Embedding flash timing**: rejected — randomness stays with the wiring, mirroring 196's
  injected-rolls pattern.

## Downstream dependencies
- The rendering composition applies the descriptor (particles, sky, audio); 198+ continue the
  "Dimensions and major progression" section; 242's e2e asserts weather visuals through this
  presentation.
