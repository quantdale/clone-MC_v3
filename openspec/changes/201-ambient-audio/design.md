# Design: 201-ambient-audio

## Context/current state
- 200 provides sound events/categories but no scheduling. 201 adds the deterministic ambient
  scheduler: environment cues, weather ambience, and day/night music timing. The audio layer
  plays the resulting cues.

## Target state
- `src/simulation/AmbientAudioFramework.ts` holding the environment table, music constants, the
  immutable scheduler state, and `tickAmbient`.

## Invariants
- Pure and headless-safe: no audio context, no mutation of inputs, no randomness inside the
  module (rng injected).
- `AmbientState` timers are non-negative integers; exactly one cue per tick at most.
- A delay of 1 fires on that tick (decrement-then-fire); music takes precedence when both delays
  hit 0 in the same tick.
- Cue selection: rain -> `rain` (0.5), thunder -> `thunder` (1.0), clear -> the environment's
  cue at its volume.
- A changed environment re-rolls `cueDelay` immediately (music delay untouched).

## API and data model
```ts
// src/simulation/AmbientAudioFramework.ts (new)
export type AmbientEnvironment = 'cave' | 'forest' | 'plains' | 'ocean' | 'nether' | 'end';
export interface AmbientEnvironmentDef {
  id: AmbientEnvironment;
  soundEvent: string;
  intervalMin: number;   // ticks, inclusive
  intervalMax: number;   // ticks, inclusive
  volume: number;        // 0..1
}
export const AMBIENT_ENVIRONMENTS: readonly AmbientEnvironmentDef[];
export function ambientEnvironment(id: string): AmbientEnvironmentDef | undefined;

export const MUSIC_INTERVAL_MIN = 12000;
export const MUSIC_INTERVAL_MAX = 24000;
export const MUSIC_EVENT_DAY = 'music_day';
export const MUSIC_EVENT_NIGHT = 'music_night';

export interface AmbientState {
  environment: AmbientEnvironment;
  musicDelay: number;   // ticks until the next music track
  cueDelay: number;     // ticks until the next environment/weather cue
}
export function createDefaultAmbientState(rng: () => number): AmbientState;

export interface AmbientCue {
  kind: 'music' | 'cue';
  soundEvent: string;
  volume: number;
}
export interface TickAmbientOptions {
  environment: AmbientEnvironment;
  weather: WeatherKind;
  isDay: boolean;
  rng: () => number;
}
export function tickAmbient(state: AmbientState, options: TickAmbientOptions):
  { state: AmbientState; cue: AmbientCue | null };
```

## Control/data flow
1. The wiring calls `tickAmbient` each tick with the current environment (biome), weather (196),
   day/night (time), and an rng; it stores the returned state and plays the returned cue.

## Detailed behavior
- Environment table (six original entries):
  cave -> `ambient_cave` [200, 600] 0.5; forest -> `ambient_forest` [300, 900] 0.4; plains ->
  `ambient_plains` [400, 1000] 0.3; ocean -> `ambient_ocean` [300, 800] 0.35; nether ->
  `ambient_nether` [150, 500] 0.5; end -> `ambient_end` [250, 700] 0.45.
- `createDefaultAmbientState(rng)`: environment `plains`, `musicDelay = roll(MUSIC_INTERVAL_MIN,
  MUSIC_INTERVAL_MAX)`, `cueDelay = roll(plains.intervalMin, plains.intervalMax)`, where `roll(min,
  max) = min + floor(rng() * (max - min + 1))`.
- `tickAmbient`: musicDelay = musicDelay - 1; cueDelay = cueDelay - 1.
  - musicDelay == 0 -> music cue (`music_day`/`music_night` by `isDay`, volume 1), musicDelay =
    re-rolled; if cueDelay also == 0, cueDelay = re-rolled too (music precedence, one cue).
  - else cueDelay == 0 -> cue: rain -> `rain` 0.5; thunder -> `thunder` 1.0; clear -> the
    environment's `soundEvent` at its volume; cueDelay = re-rolled.
  - else no cue.
  - An environment different from `state.environment` re-rolls `cueDelay` BEFORE the decrement
    (the ambience changes immediately).

## Failure modes
- None — total functions; unknown environments are impossible by typing.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- O(1) per tick; linear scans over the 6-entry environment table.

## Testing seams
- Tests use fixed rng values and hand-built states with small delays to pin every firing path.

## Observability/debugging
- The state and cues are plain immutable objects; a tick's result fully determines the next.

## Affected files/symbols
- `src/simulation/AmbientAudioFramework.ts` (new).
- Tests: `tests/unit/AmbientAudioFramework.test.ts` (new). No other files.

## Rejected alternatives
- **Embedding rng/state in a class**: rejected — the pure function + immutable state pattern
  (196/199/200) keeps the scheduler deterministic and testable.

## Downstream dependencies
- The audio layer plays cues; 202 continues the section (inventory-screen parity).
