import { describe, it, expect } from 'vitest';
import {
  AMBIENT_ENVIRONMENTS,
  MUSIC_EVENT_DAY,
  MUSIC_EVENT_NIGHT,
  MUSIC_INTERVAL_MAX,
  MUSIC_INTERVAL_MIN,
  ambientEnvironment,
  createDefaultAmbientState,
  tickAmbient,
  type AmbientState,
} from '../../src/simulation/AmbientAudioFramework';

const HALF = () => 0.5;

describe('environment table', () => {
  it('defines exactly the six environments in order with valid data', () => {
    expect(AMBIENT_ENVIRONMENTS.map((e) => e.id)).toEqual([
      'cave',
      'forest',
      'plains',
      'ocean',
      'nether',
      'end',
    ]);
    for (const env of AMBIENT_ENVIRONMENTS) {
      expect(env.intervalMin).toBeGreaterThan(0);
      expect(env.intervalMax).toBeGreaterThanOrEqual(env.intervalMin);
      expect(env.volume).toBeGreaterThanOrEqual(0);
      expect(env.volume).toBeLessThanOrEqual(1);
      expect(env.soundEvent.length).toBeGreaterThan(0);
    }
  });

  it('looks up environments and pins music constants', () => {
    expect(ambientEnvironment('cave')).toEqual({
      id: 'cave',
      soundEvent: 'ambient_cave',
      intervalMin: 200,
      intervalMax: 600,
      volume: 0.5,
    });
    expect(ambientEnvironment('plains')?.intervalMin).toBe(400);
    expect(ambientEnvironment('plains')?.volume).toBe(0.3);
    expect(ambientEnvironment('nope')).toBeUndefined();
    expect(MUSIC_INTERVAL_MIN).toBe(12000);
    expect(MUSIC_INTERVAL_MAX).toBe(24000);
  });
});

describe('default state', () => {
  it('rolls plains ambience and music delays with the rng', () => {
    const state = createDefaultAmbientState(HALF);
    expect(state.environment).toBe('plains');
    expect(state.musicDelay).toBe(12000 + Math.floor(0.5 * 12001)); // 18000
    expect(state.cueDelay).toBe(400 + Math.floor(0.5 * 601)); // 700
  });
});

describe('music', () => {
  it('fires the day music cue and re-rolls the delay', () => {
    const state: AmbientState = { environment: 'plains', musicDelay: 1, cueDelay: 50 };
    const { state: next, cue } = tickAmbient(state, {
      environment: 'plains',
      weather: 'clear',
      isDay: true,
      rng: HALF,
    });
    expect(cue).toEqual({ kind: 'music', soundEvent: MUSIC_EVENT_DAY, volume: 1 });
    expect(next.musicDelay).toBe(18000);
    expect(next.cueDelay).toBe(49);
  });

  it('fires the night music cue for night', () => {
    const state: AmbientState = { environment: 'plains', musicDelay: 1, cueDelay: 50 };
    const { cue } = tickAmbient(state, {
      environment: 'plains',
      weather: 'clear',
      isDay: false,
      rng: HALF,
    });
    expect(cue).toEqual({ kind: 'music', soundEvent: MUSIC_EVENT_NIGHT, volume: 1 });
  });

  it('takes precedence when both delays hit 0 in the same tick', () => {
    const state: AmbientState = { environment: 'plains', musicDelay: 1, cueDelay: 1 };
    const { state: next, cue } = tickAmbient(state, {
      environment: 'plains',
      weather: 'clear',
      isDay: true,
      rng: HALF,
    });
    expect(cue).toEqual({ kind: 'music', soundEvent: MUSIC_EVENT_DAY, volume: 1 });
    expect(next.musicDelay).toBe(18000);
    expect(next.cueDelay).toBe(700); // re-rolled too
  });
});

describe('environment and weather cues', () => {
  const state: AmbientState = { environment: 'cave', musicDelay: 100, cueDelay: 1 };

  it('fires the environment cue in clear weather', () => {
    const { state: next, cue } = tickAmbient(state, {
      environment: 'cave',
      weather: 'clear',
      isDay: true,
      rng: HALF,
    });
    expect(cue).toEqual({ kind: 'cue', soundEvent: 'ambient_cave', volume: 0.5 });
    expect(next.cueDelay).toBe(400); // 200 + floor(0.5 * 401)
  });

  it('fires rain and thunder cues during weather', () => {
    const rain = tickAmbient(state, {
      environment: 'cave',
      weather: 'rain',
      isDay: true,
      rng: HALF,
    });
    expect(rain.cue).toEqual({ kind: 'cue', soundEvent: 'rain', volume: 0.5 });
    const thunder = tickAmbient(state, {
      environment: 'cave',
      weather: 'thunder',
      isDay: true,
      rng: HALF,
    });
    expect(thunder.cue).toEqual({ kind: 'cue', soundEvent: 'thunder', volume: 1.0 });
  });
});

describe('environment change', () => {
  it('re-rolls the cue delay immediately without touching music', () => {
    const state: AmbientState = { environment: 'plains', musicDelay: 5, cueDelay: 3 };
    const { state: next, cue } = tickAmbient(state, {
      environment: 'nether',
      weather: 'clear',
      isDay: true,
      rng: HALF,
    });
    expect(cue).toBeNull();
    expect(next.environment).toBe('nether');
    expect(next.musicDelay).toBe(4);
    expect(next.cueDelay).toBe(325); // 150 + floor(0.5 * 351), then decremented... see below
  });
});

describe('quiet ticks and immutability', () => {
  it('returns null cue with decremented delays and never mutates the input', () => {
    const state: AmbientState = { environment: 'plains', musicDelay: 5, cueDelay: 7 };
    const { state: next, cue } = tickAmbient(state, {
      environment: 'plains',
      weather: 'clear',
      isDay: true,
      rng: HALF,
    });
    expect(cue).toBeNull();
    expect(next).toEqual({ environment: 'plains', musicDelay: 4, cueDelay: 6 });
    expect(state).toEqual({ environment: 'plains', musicDelay: 5, cueDelay: 7 });
  });
});
