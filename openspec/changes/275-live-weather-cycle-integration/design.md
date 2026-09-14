# Design: 275-live-weather-cycle-integration

## Context
Mirror 274 sleep integration patterns: WorldMetadataRepository raw `__weather__` key, GamePersistence hydrate/save/reset/archive, Game field + boot hydration + autosave/dispose flush, HUD chip, E2E via `__voxelGame`.

## Decisions
- Duration rolls: world-seeded PRNG salt `"weather"` injected into `tickWeather` rolls (wiring owns RNG; framework stays pure).
- No wake-on-boot mutation beyond deserialize degrade-to-default (unlike sleep's sleeping→false).
- Presentation: call `presentWeather` then `environment.applyWeather` each fixed tick after weather advance.
- Text seam: `setWeatherFromText` mirroring game-mode/gamerule text setters for `/weather`.
