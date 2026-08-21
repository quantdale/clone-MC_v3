/**
 * Weather presentation (197): the pure read-only mapping from 196's weather simulation truth to
 * rendering/audio parameters. Never touches the simulation — `presentWeather(state)` derives a
 * fixed descriptor from the weather kind only (timers are irrelevant) and returns it as a new
 * immutable object.
 *
 * Table (vanilla-inspired):
 *   clear   -> rain 0, thunder 0, darkness 0,      rainSound 0, thunderSound 0
 *   rain    -> rain 1, thunder 0, darkness 0.25,   rainSound 1, thunderSound 0
 *   thunder -> rain 1, thunder 1, darkness 0.5,    rainSound 1, thunderSound 1
 *
 * Lightning flash timing and smooth intensity transitions stay with the rendering composition
 * (which owns randomness), mirroring 196's injected-rolls pattern.
 */
import type { WeatherState } from '../simulation/WeatherFramework';
import type { EnvironmentState } from './Environment';

/** Sky darkening during plain rain (vanilla-inspired). */
export const RAIN_SKY_DARKNESS = 0.25;

/** Sky darkening during a thunderstorm (vanilla-inspired). */
export const THUNDER_SKY_DARKNESS = 0.5;

/** Rendering/audio parameters derived from the weather. */
export interface WeatherPresentation {
  /** 0 = none, 1 = full rain (rain and thunder). */
  readonly rainIntensity: number;
  /** 0 = none, 1 = thunderstorm. */
  readonly thunderIntensity: number;
  /** 0 = clear, 0.25 = rain, 0.5 = thunder. */
  readonly skyDarkness: number;
  /** 0 or 1. */
  readonly rainSoundLevel: number;
  /** 0 or 1. */
  readonly thunderSoundLevel: number;
}

/**
 * Present the weather for rendering/audio. A total, read-only function of `state.weather`; the
 * input state is never modified and its timers never influence the result.
 */
export function presentWeather(state: WeatherState): WeatherPresentation {
  switch (state.weather) {
    case 'clear':
      return {
        rainIntensity: 0,
        thunderIntensity: 0,
        skyDarkness: 0,
        rainSoundLevel: 0,
        thunderSoundLevel: 0,
      };
    case 'rain':
      return {
        rainIntensity: 1,
        thunderIntensity: 0,
        skyDarkness: RAIN_SKY_DARKNESS,
        rainSoundLevel: 1,
        thunderSoundLevel: 0,
      };
    case 'thunder':
      return {
        rainIntensity: 1,
        thunderIntensity: 1,
        skyDarkness: THUNDER_SKY_DARKNESS,
        rainSoundLevel: 1,
        thunderSoundLevel: 1,
      };
  }
}

/** Discrete precipitation intensity tiers for rendering/particle budgets. */
export type PrecipitationTier = 'clear' | 'light' | 'moderate' | 'storm';

/** Tier thresholds (module constants instead of CONFIG edits). */
const TIER_LIGHT_MIN = 0.001;
const TIER_MODERATE_MIN = 0.34;
const TIER_STORM_MIN = 0.67;

/** Map a continuous `rainIntensity` (e.g. from an interpolated transition) to its tier. */
export function precipitationTier(rainIntensity: number): PrecipitationTier {
  if (!Number.isFinite(rainIntensity) || rainIntensity < TIER_LIGHT_MIN) return 'clear';
  if (rainIntensity < TIER_MODERATE_MIN) return 'light';
  if (rainIntensity < TIER_STORM_MIN) return 'moderate';
  return 'storm';
}

/**
 * Fold a weather presentation into the shared {@link EnvironmentState}: precipitation/thunder
 * intensities are set and sky/fog colors are darkened coherently by the same `skyDarkness` factor
 * so fog never disagrees with the sky. Writes into `out` (or a fresh state) — no allocation when
 * `out` is the live environment state object.
 */
export function applyWeatherToEnvironment(
  state: EnvironmentState,
  presentation: WeatherPresentation,
  out?: EnvironmentState,
): EnvironmentState {
  const target = out ?? state;
  target.precipitationIntensity = presentation.rainIntensity;
  target.thunderIntensity = presentation.thunderIntensity;
  if (target !== state) {
    // Copy time/day fields so a fresh out does not inherit zeros silently.
    target.timeOfDayHours = state.timeOfDayHours;
    target.sunDirection.x = state.sunDirection.x;
    target.sunDirection.y = state.sunDirection.y;
    target.sunDirection.z = state.sunDirection.z;
    target.daylightFactor = state.daylightFactor;
    target.exposure = state.exposure;
  }
  const darken = 1 - presentation.skyDarkness;
  target.skyZenith.r = state.skyZenith.r * darken;
  target.skyZenith.g = state.skyZenith.g * darken;
  target.skyZenith.b = state.skyZenith.b * darken;
  target.skyHorizon.r = state.skyHorizon.r * darken;
  target.skyHorizon.g = state.skyHorizon.g * darken;
  target.skyHorizon.b = state.skyHorizon.b * darken;
  target.fogColor.r = state.fogColor.r * darken;
  target.fogColor.g = state.fogColor.g * darken;
  target.fogColor.b = state.fogColor.b * darken;
  target.exposure = Math.max(0, target.exposure * (1 - presentation.skyDarkness * 0.5));
  return target;
}
