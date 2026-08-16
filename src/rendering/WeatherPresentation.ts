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
