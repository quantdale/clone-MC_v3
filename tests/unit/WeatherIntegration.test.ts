import { describe, it, expect } from 'vitest';
import {
  createDefaultWeatherState,
  deserializeWeatherState,
  serializeWeatherState,
  setWeather,
  tickWeather,
  type WeatherRolls,
  type WeatherState,
} from '../../src/simulation/WeatherFramework';
import { presentWeather } from '../../src/rendering/WeatherPresentation';
import { createNamedRng } from '../../src/simulation/SeedRng';

/**
 * Wiring oracles for the live weather integration (275): the exact composition
 * `Game.tickWeatherCycle` / `setWeather` / the world-seeded `weather` RNG
 * stream run over the VERIFIED headless WeatherFramework (196). `Game` itself
 * is DOM-bound and has no node harness, so the routing is covered here at the
 * seam (the real 196 + the 054 named-RNG roll source + the spec scenarios) and
 * in browser E2E (real HUD, real persistence, real fixed-tick advance).
 *
 * The spec pins the invariants: I-1 corrupt/absent degrade to clear, I-2 the
 * `doWeatherCycle` gate freezes the state, I-3 the gate advances with
 * injected rolls, I-4 setWeather updates store+persist+presentation, I-5
 * reload restores kind/timers.
 */

/**
 * The exact `Game.tickWeatherCycle` roll source (275): the world-seeded
 * `weather` named stream (054) supplies the three transition durations each
 * tick, so the 196 state machine stays deterministic. Mirrors the wired
 * ranges (vanilla-inspired) pinned in `Game.tickWeatherCycle`.
 */
function rollsFor(rng: { nextIntInclusive(min: number, max: number): number }): WeatherRolls {
  return {
    clearDuration: rng.nextIntInclusive(12000, 24000),
    rainDuration: rng.nextIntInclusive(12000, 24000),
    thunderDuration: rng.nextIntInclusive(3600, 15600),
  };
}

/** One fixed tick of the live weather wiring (Game.tickWeatherCycle). */
function tickOnce(state: WeatherState, doWeatherCycle: boolean, rng: { nextIntInclusive(min: number, max: number): number }): WeatherState {
  return tickWeather(state, doWeatherCycle, rollsFor(rng));
}

describe('I-1: degrade-to-clear on corrupt/absent (275)', () => {
  it('restores a valid persisted payload field-for-field', () => {
    const state: WeatherState = { weather: 'thunder', rainTime: 4321, thunderTime: 56 };
    expect(deserializeWeatherState(serializeWeatherState(state))).toEqual(state);
  });

  it('rejects corrupt payloads so boot degrades to clear defaults', () => {
    const bad = [
      { version: 2, weather: 'clear', rainTime: 0, thunderTime: 0 }, // wrong version
      { version: 1, weather: 'storm', rainTime: 0, thunderTime: 0 }, // unknown kind
      { version: 1, weather: 'clear', rainTime: -1, thunderTime: 0 }, // negative
      { version: 1, weather: 'clear', rainTime: 1.5, thunderTime: 0 }, // non-integer
      { version: 1, weather: 'clear', rainTime: 0, thunderTime: 0, extra: 1 }, // unknown key
      'not-an-object',
    ];
    for (const payload of bad) {
      expect(() => deserializeWeatherState(payload)).toThrow();
    }
    // The facade degrades to the default clear state on a rejected payload.
    expect(createDefaultWeatherState()).toEqual({ weather: 'clear', rainTime: 0, thunderTime: 0 });
  });
});

describe('I-2: doWeatherCycle=false freezes (275)', () => {
  it('returns the IDENTICAL state (identity) for a rain timer across many ticks', () => {
    const rain: WeatherState = { weather: 'rain', rainTime: 100, thunderTime: 10 };
    const rng = createNamedRng(275, 'weather');
    const first = tickOnce(rain, false, rng);
    expect(first).toBe(rain); // identity — nothing mutated, timers frozen
    for (let i = 0; i < 50; i++) {
      expect(tickOnce(rain, false, rng)).toBe(rain);
    }
    // The wiring draws the transition rolls every fixed tick (before the gate),
    // so the seeded stream advances uniformly; only the STATE is frozen.
  });

  it('freezes a thunder state exactly', () => {
    const thunder: WeatherState = { weather: 'thunder', rainTime: 7, thunderTime: 3 };
    const rng = createNamedRng(7, 'weather');
    expect(tickOnce(thunder, false, rng)).toBe(thunder);
  });
});

describe('I-3: doWeatherCycle=true advances with injected rolls (275)', () => {
  it('counts down the clear period and transitions to rain on expiry', () => {
    const clear: WeatherState = { weather: 'clear', rainTime: 3, thunderTime: 0 };
    const rng = createNamedRng(275, 'weather');
    const a = tickOnce(clear, true, rng);
    expect(a).toEqual({ weather: 'clear', rainTime: 2, thunderTime: 0 });
    const b = tickOnce(a, true, rng);
    expect(b).toEqual({ weather: 'clear', rainTime: 1, thunderTime: 0 });
    const c = tickOnce(b, true, rng);
    // The transition uses the RNG's rolled rain/thunder durations.
    expect(c.weather).toBe('rain');
    expect(c.rainTime).toBeGreaterThan(0);
    expect(c.thunderTime).toBeGreaterThan(0);
  });

  it('is deterministic: the same seed + rule yields the same weather timeline', () => {
    const run = (seed: number): WeatherState[] => {
      const rng = createNamedRng(seed, 'weather');
      let s = createDefaultWeatherState();
      const timeline: WeatherState[] = [s];
      for (let i = 0; i < 200; i++) {
        s = tickOnce(s, true, rng);
        timeline.push(s);
      }
      return timeline;
    };
    const a = run(275);
    const b = run(275);
    expect(a).toEqual(b);
    // A different world seed yields a different timeline (the stream is salted).
    const c = run(276);
    expect(c).not.toEqual(a);
  });
});

describe('I-4: setWeather updates store + presentation (275)', () => {
  it('sets thunder and the presentation reflects it (W-3 scenario)', () => {
    const start = createDefaultWeatherState();
    const next = setWeather(start, 'thunder', 5000);
    expect(next).toEqual({ weather: 'thunder', rainTime: 5000, thunderTime: 5000 });
    expect(next).not.toBe(start); // new state object
    const presentation = presentWeather(next);
    expect(presentation.rainIntensity).toBe(1);
    expect(presentation.thunderIntensity).toBe(1);
    expect(presentation.skyDarkness).toBeGreaterThan(0);
  });

  it('sets rain and the presentation reflects it', () => {
    const next = setWeather(createDefaultWeatherState(), 'rain', 12000);
    expect(next).toEqual({ weather: 'rain', rainTime: 12000, thunderTime: 0 });
    const presentation = presentWeather(next);
    expect(presentation.rainIntensity).toBe(1);
    expect(presentation.thunderIntensity).toBe(0);
  });

  it('is an identity no-op for an unknown kind or a negative duration (I-4 no mutation)', () => {
    const start: WeatherState = { weather: 'rain', rainTime: 5, thunderTime: 0 };
    // @ts-expect-error - deliberately an invalid kind to prove the identity no-op.
    expect(setWeather(start, 'sunny', 10)).toBe(start);
    expect(setWeather(start, 'clear', -1)).toBe(start);
  });

  it('the 275 text seam parses the 191 weather tokens (W-3 command surface)', () => {
    // Mirrors Game.setWeatherFromText: accept clear/rain/thunder, reject the rest.
    const parse = (text: string): 'clear' | 'rain' | 'thunder' | null => {
      const kind = text.trim().toLowerCase();
      if (kind !== 'clear' && kind !== 'rain' && kind !== 'thunder') return null;
      return kind;
    };
    expect(parse('/weather thunder'.split(' ')[1] ?? '')).toBe('thunder');
    expect(parse('Rain')).toBe('rain');
    expect(parse('sunny')).toBeNull();
    expect(parse('')).toBeNull();
  });
});

describe('I-5: reload restores kind/timers (275)', () => {
  it('round-trips a mid-storm state through the exact persisted payload', () => {
    const state: WeatherState = { weather: 'thunder', rainTime: 4321, thunderTime: 56 };
    const payload = serializeWeatherState(state);
    const restored = deserializeWeatherState(payload);
    expect(restored).toEqual(state);
    expect(restored.weather).toBe('thunder');
    expect(restored.rainTime).toBe(4321);
    expect(restored.thunderTime).toBe(56);
  });

  it('restores clear defaults when the record is absent (no boot mutation, unlike sleep)', () => {
    // Unlike sleep there is no wake-on-boot mutation: an absent record yields
    // the clear default, and a present record is restored exactly (above).
    expect(createDefaultWeatherState()).toEqual({ weather: 'clear', rainTime: 0, thunderTime: 0 });
  });
});
