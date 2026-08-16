import { describe, it, expect } from 'vitest';
import {
  createDefaultWeatherState,
  deserializeWeatherState,
  isRaining,
  isThundering,
  serializeWeatherState,
  setWeather,
  tickWeather,
  type WeatherState,
} from '../../src/simulation/WeatherFramework';
import type { WeatherKind } from '../../src/simulation/CoreCommands';

const ROLLS = { clearDuration: 15000, rainDuration: 12000, thunderDuration: 3600 };

describe('default and setWeather', () => {
  it('defaults to clear with no pending transition', () => {
    expect(createDefaultWeatherState()).toEqual({ weather: 'clear', rainTime: 0, thunderTime: 0 });
  });

  it('sets clear, rain, and thunder with durations', () => {
    const state = createDefaultWeatherState();
    expect(setWeather(state, 'rain', 6000)).toEqual({
      weather: 'rain',
      rainTime: 6000,
      thunderTime: 0,
    });
    expect(setWeather(state, 'thunder', 6000)).toEqual({
      weather: 'thunder',
      rainTime: 6000,
      thunderTime: 6000,
    });
    expect(setWeather(state, 'clear', 6000)).toEqual({
      weather: 'clear',
      rainTime: 6000,
      thunderTime: 0,
    });
  });

  it('identity-no-ops on invalid weather or duration', () => {
    const state = createDefaultWeatherState();
    expect(setWeather(state, 'rain', -1)).toBe(state);
    expect(setWeather(state, 'rain', 1.5)).toBe(state);
    expect(setWeather(state, 'rain', NaN)).toBe(state);
    expect(setWeather(state, 'sunny' as WeatherKind, 6000)).toBe(state);
  });
});

describe('tickWeather gate', () => {
  it('freezes weather and timers when doWeatherCycle is false', () => {
    const state: WeatherState = { weather: 'rain', rainTime: 1, thunderTime: 0 };
    expect(tickWeather(state, false, ROLLS)).toBe(state);
    const expired: WeatherState = { weather: 'clear', rainTime: 0, thunderTime: 0 };
    expect(tickWeather(expired, false, ROLLS)).toBe(expired);
  });
});

describe('transitions', () => {
  it('clear counts down then becomes rain with a pending thunder roll', () => {
    const clear: WeatherState = { weather: 'clear', rainTime: 2, thunderTime: 0 };
    expect(tickWeather(clear, true, ROLLS)).toEqual({ weather: 'clear', rainTime: 1, thunderTime: 0 });
    expect(tickWeather({ weather: 'clear', rainTime: 1, thunderTime: 0 }, true, ROLLS)).toEqual({
      weather: 'rain',
      rainTime: ROLLS.rainDuration,
      thunderTime: ROLLS.thunderDuration,
    });
  });

  it('rain ends to clear', () => {
    const rain: WeatherState = { weather: 'rain', rainTime: 1, thunderTime: 0 };
    expect(tickWeather(rain, true, ROLLS)).toEqual({
      weather: 'clear',
      rainTime: ROLLS.clearDuration,
      thunderTime: 0,
    });
  });

  it('thunder starts within rain and preserves the rain timer', () => {
    const rain: WeatherState = { weather: 'rain', rainTime: 5, thunderTime: 0 };
    expect(tickWeather(rain, true, ROLLS)).toEqual({
      weather: 'thunder',
      rainTime: 4,
      thunderTime: ROLLS.thunderDuration,
    });
  });

  it('thunder ends back to plain rain with a fresh pending thunder roll', () => {
    const thunder: WeatherState = { weather: 'thunder', rainTime: 3, thunderTime: 1 };
    expect(tickWeather(thunder, true, ROLLS)).toEqual({
      weather: 'rain',
      rainTime: 2,
      thunderTime: ROLLS.thunderDuration,
    });
  });

  it('rain ends during thunder to clear', () => {
    const thunder: WeatherState = { weather: 'thunder', rainTime: 1, thunderTime: 100 };
    expect(tickWeather(thunder, true, ROLLS)).toEqual({
      weather: 'clear',
      rainTime: ROLLS.clearDuration,
      thunderTime: 0,
    });
  });

  it('rain expiry takes precedence over a same-tick thunder start', () => {
    const rain: WeatherState = { weather: 'rain', rainTime: 0, thunderTime: 0 };
    expect(tickWeather(rain, true, ROLLS)).toEqual({
      weather: 'clear',
      rainTime: ROLLS.clearDuration,
      thunderTime: 0,
    });
  });

  it('keeps timers non-negative across a full deterministic cycle', () => {
    let state = createDefaultWeatherState();
    // tick 1 rolls clear -> rain; the cycle back to rain is 1 + rain 12000 + clear 15000 ticks
    for (let i = 0; i < 1 + 12000 + 15000; i += 1) {
      state = tickWeather(state, true, ROLLS);
      expect(state.rainTime).toBeGreaterThanOrEqual(0);
      expect(state.thunderTime).toBeGreaterThanOrEqual(0);
    }
    expect(state.weather).toBe('rain');
    expect(state.rainTime).toBe(ROLLS.rainDuration);
    expect(state.thunderTime).toBe(ROLLS.thunderDuration);
  });
});

describe('queries', () => {
  it('reports rain and thunder correctly', () => {
    const clear: WeatherState = { weather: 'clear', rainTime: 0, thunderTime: 0 };
    const rain: WeatherState = { weather: 'rain', rainTime: 10, thunderTime: 0 };
    const thunder: WeatherState = { weather: 'thunder', rainTime: 10, thunderTime: 10 };
    expect(isRaining(clear)).toBe(false);
    expect(isRaining(rain)).toBe(true);
    expect(isRaining(thunder)).toBe(true);
    expect(isThundering(clear)).toBe(false);
    expect(isThundering(rain)).toBe(false);
    expect(isThundering(thunder)).toBe(true);
  });
});

describe('persistence', () => {
  it('round-trips every weather', () => {
    const states: readonly WeatherState[] = [
      { weather: 'clear', rainTime: 0, thunderTime: 0 },
      { weather: 'rain', rainTime: 1234, thunderTime: 0 },
      { weather: 'thunder', rainTime: 4321, thunderTime: 56 },
    ];
    for (const state of states) {
      expect(deserializeWeatherState(serializeWeatherState(state))).toEqual(state);
    }
  });

  it('rejects a non-object payload', () => {
    expect(() => deserializeWeatherState('rain')).toThrow('WeatherFramework: expected an object');
    expect(() => deserializeWeatherState(null)).toThrow('WeatherFramework: expected an object');
  });

  it('rejects an unsupported version', () => {
    expect(() =>
      deserializeWeatherState({ version: 0, weather: 'rain', rainTime: 0, thunderTime: 0 }),
    ).toThrow('WeatherFramework: unsupported version 0');
  });

  it('rejects an unknown weather', () => {
    expect(() =>
      deserializeWeatherState({ version: 1, weather: 'sunny', rainTime: 0, thunderTime: 0 }),
    ).toThrow('WeatherFramework: unknown weather sunny');
  });

  it('rejects non-integer or negative timers', () => {
    expect(() =>
      deserializeWeatherState({ version: 1, weather: 'rain', rainTime: -1, thunderTime: 0 }),
    ).toThrow('WeatherFramework: rainTime must be a non-negative integer');
    expect(() =>
      deserializeWeatherState({ version: 1, weather: 'rain', rainTime: 1.5, thunderTime: 0 }),
    ).toThrow('WeatherFramework: rainTime must be a non-negative integer');
    expect(() =>
      deserializeWeatherState({ version: 1, weather: 'rain', rainTime: 0, thunderTime: -1 }),
    ).toThrow('WeatherFramework: thunderTime must be a non-negative integer');
  });

  it('rejects unknown keys', () => {
    expect(() =>
      deserializeWeatherState({ version: 1, weather: 'rain', rainTime: 0, thunderTime: 0, extra: true }),
    ).toThrow('WeatherFramework: unknown key extra');
  });
});
