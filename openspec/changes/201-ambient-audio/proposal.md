# Proposal: 201-ambient-audio

## Problem
200 defined sound events but nothing schedules continuous ambience or music: no environment cues,
no weather ambience, no music timing. The audio layer needs a deterministic scheduler to decide
WHEN and HOW LOUD ambient sound plays.

## Goals
- `src/simulation/AmbientAudioFramework.ts` (NEW), pure and headless-safe (no audio context, no
  mutation, no randomness inside the module):
  - **Environments**: the fixed table `AMBIENT_ENVIRONMENTS` of six original definitions
    (`cave`, `forest`, `plains`, `ocean`, `nether`, `end`), each with a sound event id, cue
    interval range in ticks, and volume; `ambientEnvironment(id)` lookup.
  - **Music**: `MUSIC_INTERVAL_MIN` (12000) / `MUSIC_INTERVAL_MAX` (24000) ticks; day vs night
    music events (`music_day` / `music_night`).
  - **Scheduler**: immutable `AmbientState { environment, musicDelay, cueDelay }`;
    `createDefaultAmbientState()` (plains, delays rolled by the caller-supplied rng);
    `tickAmbient(state, { environment, weather, isDay, rng })` — decrements both delays and, when
    one reaches 0, returns a cue plus a NEW state with the delay re-rolled; the music cue takes
    precedence when both hit 0 in the same tick (one cue per tick). Cues: during rain/thunder the
    weather events (`rain` 0.5 / `thunder` 1.0) fire; in clear weather the environment's cue
    fires. A changed environment re-rolls the cue delay immediately.

## Non-goals
- **No audio playback/synthesis** (the audio layer plays cues), **no music track assets** (201
  defines scheduling only), **no persistence** (delays are transient), **no `Game.ts` edit**, **no
  save-format change**.

## Preconditions
- Change 200 (`sound-event-system`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 200's category model (referenced conceptually; not imported) and 196's `WeatherKind` (imported
  type only).

## Proposed change
1. `src/simulation/AmbientAudioFramework.ts` (NEW): the environment table, music constants, the
   scheduler state, and `tickAmbient`.

## Compatibility and migration
- One new simulation file; zero registry changes (module-local table), zero characterization
  updates, no `Game.ts` edit, no schema/save-format change.

## Risks
- **Scheduling drift (tick semantics)**. Mitigation: the decrement-then-fire semantics (a delay
  of 1 fires on that tick) and the music-precedence rule are pinned tick-by-tick in tests.
- **RNG coupling**. Mitigation: the rng is injected; tests use fixed sequences to pin roll math.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: the environment table (6 entries, validity, lookup); music constants; default
  state; cue firing for music (day/night), environment cues, and weather cues; music precedence;
  environment-change re-roll; rng roll math; null-cue ticks; input immutability.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
