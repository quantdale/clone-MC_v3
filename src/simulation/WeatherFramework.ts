/**
 * Weather framework (196): the deterministic weather state machine. Holds the current weather
 * (`clear|rain|thunder`, 191's WeatherKind) plus two tick timers, provides the `/weather` command
 * entry, the per-tick advance gated by 189's `doWeatherCycle` with injected durations, queries,
 * and versioned persistence.
 *
 * Model (vanilla-inspired):
 * - `rainTime`: ticks until the next weather transition (the clear period before rain starts, or
 *   the remaining rain).
 * - `thunderTime`: ticks until thunder starts (during plain rain) or until thunder ends (during
 *   thunder). Rain starts with a rolled pending thunderTime; when it expires, thunder begins
 *   within the storm (the rain's own timer is preserved). When thunder expires, plain rain
 *   resumes with a fresh pending thunder roll. Rain expiry always ends the storm to clear.
 * - `tickWeather(state, doWeatherCycle, rolls)`: with the gamerule false the IDENTICAL state is
 *   returned (timers frozen — no natural transition). Otherwise timers count down and, when a
 *   timer reaches 0, the transition happens on that SAME tick (a period of `d` ticks transitions
 *   on the d-th tick) using the caller-supplied rolls (the wiring owns the RNG, so this module
 *   is fully deterministic).
 *
 * Determinism rules:
 * - `setWeather` identity-no-ops on an unknown weather or a non-integer/negative duration.
 * - Deserialization validates the whole payload (version, weather, integer non-negative timers,
 *   exact key set) before accepting anything; violations throw descriptive errors.
 */
import { WEATHERS, type WeatherKind } from './CoreCommands';

/** Immutable weather state. */
export interface WeatherState {
  readonly weather: WeatherKind;
  /** Ticks until the next weather transition. */
  readonly rainTime: number;
  /** Ticks until thunder ends (counts during rain and thunder). */
  readonly thunderTime: number;
}

/** Caller-supplied transition durations in ticks (the wiring's RNG output). */
export interface WeatherRolls {
  /** Ticks of clear before rain starts (vanilla 12000-24000). */
  readonly clearDuration: number;
  /** Ticks of rain before it ends (vanilla 12000-24000). */
  readonly rainDuration: number;
  /** Ticks of thunder before plain rain resumes (vanilla 3600-15600). */
  readonly thunderDuration: number;
}

/** A fresh state: clear, no pending transition. */
export function createDefaultWeatherState(): WeatherState {
  return { weather: 'clear', rainTime: 0, thunderTime: 0 };
}

function isWeatherKind(value: unknown): value is WeatherKind {
  return typeof value === 'string' && (WEATHERS as readonly string[]).includes(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Set the weather for `duration` ticks (vanilla `/weather <w> <duration>`): clear -> { clear, d,
 * 0 }, rain -> { rain, d, 0 }, thunder -> { thunder, d, d }. Invalid weather or a
 * non-integer/negative duration returns the IDENTICAL state (identity no-op).
 */
export function setWeather(state: WeatherState, weather: WeatherKind, duration: number): WeatherState {
  if (!isWeatherKind(weather) || !isNonNegativeInteger(duration)) return state;
  if (weather === 'clear') return { weather, rainTime: duration, thunderTime: 0 };
  if (weather === 'thunder') return { weather, rainTime: duration, thunderTime: duration };
  return { weather, rainTime: duration, thunderTime: 0 };
}

/**
 * Advance weather by one tick. With `doWeatherCycle` false the IDENTICAL state is returned
 * (timers frozen, no natural transition). Otherwise `rainTime` counts down and, when it reaches 0,
 * the period ends and the next weather starts (rolled) on that same tick. During rain,
 * `thunderTime` counts down too; when it reaches 0, thunder starts within rain (the rain's own
 * timer is preserved and keeps counting). During thunder, `thunderTime` reaching 0 returns to
 * plain rain while `rainTime` reaching 0 ends the rain. Rain expiry takes precedence over a
 * same-tick thunder start. Timers never go negative.
 */
export function tickWeather(
  state: WeatherState,
  doWeatherCycle: boolean,
  rolls: WeatherRolls,
): WeatherState {
  if (!doWeatherCycle) return state;

  if (state.rainTime === 0) {
    // The current period already expired: transition now (one per tick).
    if (state.weather === 'clear') {
      return {
        weather: 'rain',
        rainTime: rolls.rainDuration,
        thunderTime: rolls.thunderDuration,
      };
    }
    return { weather: 'clear', rainTime: rolls.clearDuration, thunderTime: 0 };
  }

  const rainLeft = state.rainTime - 1;

  if (state.weather === 'clear') {
    if (rainLeft === 0) {
      return {
        weather: 'rain',
        rainTime: rolls.rainDuration,
        thunderTime: rolls.thunderDuration,
      };
    }
    return { weather: 'clear', rainTime: rainLeft, thunderTime: 0 };
  }

  if (state.weather === 'rain') {
    if (rainLeft === 0) {
      return { weather: 'clear', rainTime: rolls.clearDuration, thunderTime: 0 };
    }
    if (state.thunderTime <= 1) {
      return { weather: 'thunder', rainTime: rainLeft, thunderTime: rolls.thunderDuration };
    }
    return { weather: 'rain', rainTime: rainLeft, thunderTime: state.thunderTime - 1 };
  }

  // thunder
  if (rainLeft === 0) {
    return { weather: 'clear', rainTime: rolls.clearDuration, thunderTime: 0 };
  }
  if (state.thunderTime <= 1) {
    // Thunder ends: plain rain resumes with a fresh pending thunder roll (the storm continues).
    return { weather: 'rain', rainTime: rainLeft, thunderTime: rolls.thunderDuration };
  }
  return { weather: 'thunder', rainTime: rainLeft, thunderTime: state.thunderTime - 1 };
}

/** Whether the weather is rain or thunder. */
export function isRaining(state: WeatherState): boolean {
  return state.weather !== 'clear';
}

/** Whether the weather is thunder. */
export function isThundering(state: WeatherState): boolean {
  return state.weather === 'thunder';
}

/** Versioned serialized weather state. */
export interface SerializedWeatherState {
  version: 1;
  weather: WeatherKind;
  rainTime: number;
  thunderTime: number;
}

/** Serialize the state (identity-shaped; validation happens on deserialize). */
export function serializeWeatherState(state: WeatherState): SerializedWeatherState {
  return { version: 1, weather: state.weather, rainTime: state.rainTime, thunderTime: state.thunderTime };
}

/**
 * Validate and restore a serialized state. The whole payload is validated first: object shape,
 * version, weather membership, integer non-negative timers, and the exact key set. Any violation
 * throws a descriptive `Error`; nothing is partially accepted.
 */
export function deserializeWeatherState(input: unknown): WeatherState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('WeatherFramework: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== 1) {
    throw new Error(`WeatherFramework: unsupported version ${String(r.version)}`);
  }
  if (!isWeatherKind(r.weather)) {
    throw new Error(`WeatherFramework: unknown weather ${String(r.weather)}`);
  }
  if (!isNonNegativeInteger(r.rainTime)) {
    throw new Error('WeatherFramework: rainTime must be a non-negative integer');
  }
  if (!isNonNegativeInteger(r.thunderTime)) {
    throw new Error('WeatherFramework: thunderTime must be a non-negative integer');
  }
  for (const key of Object.keys(r)) {
    if (key !== 'version' && key !== 'weather' && key !== 'rainTime' && key !== 'thunderTime') {
      throw new Error(`WeatherFramework: unknown key ${key}`);
    }
  }
  return { weather: r.weather, rainTime: r.rainTime, thunderTime: r.thunderTime };
}
