/**
 * Ambient-audio framework (201): the deterministic ambient scheduler. Environment cue
 * definitions (six original entries), day/night music timing, an immutable scheduler state, and
 * a per-tick advance producing at most one cue (environment/weather ambience or music).
 * Headless-safe: no audio context, no side effects, no randomness inside the module (rng
 * injected, mirroring 196/199/200).
 *
 * Determinism rules:
 * - A delay of 1 fires on that tick (decrement-then-fire); music takes precedence when both
 *   delays hit 0 in the same tick (exactly one cue per tick).
 * - Cue selection: rain -> 'rain' (0.5), thunder -> 'thunder' (1.0), clear -> the environment's
 *   cue at its volume.
 * - A changed environment re-rolls `cueDelay` immediately (before the decrement); `musicDelay`
 *   is untouched by environment changes.
 * - Rolls: `min + floor(rng() * (max - min + 1))`.
 */
import type { WeatherKind } from './CoreCommands';

export type AmbientEnvironment = 'cave' | 'forest' | 'plains' | 'ocean' | 'nether' | 'end';

/** A data-driven environment ambience definition. */
export interface AmbientEnvironmentDef {
  readonly id: AmbientEnvironment;
  readonly soundEvent: string;
  /** Cue interval range in ticks, inclusive. */
  readonly intervalMin: number;
  readonly intervalMax: number;
  /** Volume (0..1). */
  readonly volume: number;
}

const ENVIRONMENTS: readonly AmbientEnvironmentDef[] = [
  { id: 'cave', soundEvent: 'ambient_cave', intervalMin: 200, intervalMax: 600, volume: 0.5 },
  { id: 'forest', soundEvent: 'ambient_forest', intervalMin: 300, intervalMax: 900, volume: 0.4 },
  { id: 'plains', soundEvent: 'ambient_plains', intervalMin: 400, intervalMax: 1000, volume: 0.3 },
  { id: 'ocean', soundEvent: 'ambient_ocean', intervalMin: 300, intervalMax: 800, volume: 0.35 },
  { id: 'nether', soundEvent: 'ambient_nether', intervalMin: 150, intervalMax: 500, volume: 0.5 },
  { id: 'end', soundEvent: 'ambient_end', intervalMin: 250, intervalMax: 700, volume: 0.45 },
];

/** The fixed environment table. */
export const AMBIENT_ENVIRONMENTS: readonly AmbientEnvironmentDef[] = ENVIRONMENTS;

/** Look up an environment by id, or `undefined`. */
export function ambientEnvironment(id: string): AmbientEnvironmentDef | undefined {
  return ENVIRONMENTS.find((e) => e.id === id);
}

export const MUSIC_INTERVAL_MIN = 12000;
export const MUSIC_INTERVAL_MAX = 24000;
export const MUSIC_EVENT_DAY = 'music_day';
export const MUSIC_EVENT_NIGHT = 'music_night';

/** Immutable ambient scheduler state. */
export interface AmbientState {
  readonly environment: AmbientEnvironment;
  /** Ticks until the next music track. */
  readonly musicDelay: number;
  /** Ticks until the next environment/weather cue. */
  readonly cueDelay: number;
}

function roll(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** A fresh state: plains ambience, both delays rolled by the caller-supplied rng. */
export function createDefaultAmbientState(rng: () => number): AmbientState {
  return {
    environment: 'plains',
    musicDelay: roll(MUSIC_INTERVAL_MIN, MUSIC_INTERVAL_MAX, rng),
    cueDelay: roll(400, 1000, rng),
  };
}

/** A scheduled ambient cue for the audio layer to play. */
export interface AmbientCue {
  readonly kind: 'music' | 'cue';
  readonly soundEvent: string;
  readonly volume: number;
}

export interface TickAmbientOptions {
  readonly environment: AmbientEnvironment;
  readonly weather: WeatherKind;
  readonly isDay: boolean;
  readonly rng: () => number;
}

/**
 * Advance the scheduler one tick: at most one cue. Music fires when `musicDelay` reaches 0
 * (precedence over a same-tick cue); environment/weather cues fire when `cueDelay` reaches 0;
 * both delays re-roll with the injected rng. An environment change re-rolls `cueDelay` before
 * the decrement. The input state is never mutated.
 */
export function tickAmbient(
  state: AmbientState,
  options: TickAmbientOptions,
): { state: AmbientState; cue: AmbientCue | null } {
  const musicDef = ambientEnvironment(options.environment) ?? ENVIRONMENTS[2]!;
  const changed = options.environment !== state.environment;
  let cueDelay = state.cueDelay;
  if (changed) {
    // The ambience changes immediately: a fresh cue delay, not decremented on this tick.
    cueDelay = roll(musicDef.intervalMin, musicDef.intervalMax, options.rng);
  } else {
    cueDelay -= 1;
  }

  const musicDelay = state.musicDelay - 1;

  if (musicDelay === 0) {
    return {
      state: {
        environment: options.environment,
        musicDelay: roll(MUSIC_INTERVAL_MIN, MUSIC_INTERVAL_MAX, options.rng),
        cueDelay: cueDelay === 0 ? roll(musicDef.intervalMin, musicDef.intervalMax, options.rng) : cueDelay,
      },
      cue: {
        kind: 'music',
        soundEvent: options.isDay ? MUSIC_EVENT_DAY : MUSIC_EVENT_NIGHT,
        volume: 1,
      },
    };
  }

  if (cueDelay === 0) {
    const cue: AmbientCue =
      options.weather === 'rain'
        ? { kind: 'cue', soundEvent: 'rain', volume: 0.5 }
        : options.weather === 'thunder'
          ? { kind: 'cue', soundEvent: 'thunder', volume: 1.0 }
          : { kind: 'cue', soundEvent: musicDef.soundEvent, volume: musicDef.volume };
    return {
      state: {
        environment: options.environment,
        musicDelay,
        cueDelay: roll(musicDef.intervalMin, musicDef.intervalMax, options.rng),
      },
      cue,
    };
  }

  return {
    state: { environment: options.environment, musicDelay, cueDelay },
    cue: null,
  };
}
