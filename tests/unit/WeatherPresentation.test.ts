import { describe, it, expect } from 'vitest';
import type { WeatherState } from '../../src/simulation/WeatherFramework';
import {
  RAIN_SKY_DARKNESS,
  THUNDER_SKY_DARKNESS,
  presentWeather,
} from '../../src/rendering/WeatherPresentation';

describe('presentation table', () => {
  it('presents clear as no weather', () => {
    const state: WeatherState = { weather: 'clear', rainTime: 0, thunderTime: 0 };
    expect(presentWeather(state)).toEqual({
      rainIntensity: 0,
      thunderIntensity: 0,
      skyDarkness: 0,
      rainSoundLevel: 0,
      thunderSoundLevel: 0,
    });
  });

  it('presents rain with full rain intensity and darkening', () => {
    const state: WeatherState = { weather: 'rain', rainTime: 6000, thunderTime: 0 };
    expect(presentWeather(state)).toEqual({
      rainIntensity: 1,
      thunderIntensity: 0,
      skyDarkness: RAIN_SKY_DARKNESS,
      rainSoundLevel: 1,
      thunderSoundLevel: 0,
    });
    expect(RAIN_SKY_DARKNESS).toBe(0.25);
  });

  it('presents thunder with full storm parameters', () => {
    const state: WeatherState = { weather: 'thunder', rainTime: 6000, thunderTime: 6000 };
    expect(presentWeather(state)).toEqual({
      rainIntensity: 1,
      thunderIntensity: 1,
      skyDarkness: THUNDER_SKY_DARKNESS,
      rainSoundLevel: 1,
      thunderSoundLevel: 1,
    });
    expect(THUNDER_SKY_DARKNESS).toBe(0.5);
  });
});

describe('timer independence', () => {
  it('produces identical descriptors for the same weather with different timers', () => {
    const a: WeatherState = { weather: 'rain', rainTime: 0, thunderTime: 0 };
    const b: WeatherState = { weather: 'rain', rainTime: 43210, thunderTime: 12345 };
    expect(presentWeather(a)).toEqual(presentWeather(b));
    const c: WeatherState = { weather: 'thunder', rainTime: 0, thunderTime: 0 };
    const d: WeatherState = { weather: 'thunder', rainTime: 9999, thunderTime: 9999 };
    expect(presentWeather(c)).toEqual(presentWeather(d));
  });
});

describe('simulation truth is never mutated', () => {
  it('leaves the input state unchanged', () => {
    const state: WeatherState = { weather: 'thunder', rainTime: 4321, thunderTime: 56 };
    const original = { ...state };
    presentWeather(state);
    expect(state).toEqual(original);
  });
});
