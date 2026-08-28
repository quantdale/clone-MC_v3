# Proposal: 200-sound-event-system

## Problem
Gameplay has no sound representation: nothing defines sound events, categories, positions,
volumes, or attenuation. 201's ambience and the audio output layer need a pure sound-event model
to build on.

## Goals
- `src/simulation/SoundEventFramework.ts` (NEW), pure and headless-safe (no audio context, no
  mutation):
  - **Categories**: the fixed vanilla-inspired set `SOUND_CATEGORIES` (master, music, weather,
    blocks, hostile, neutral, players, ambient).
  - **Event table**: `SOUND_EVENTS` — 18 original data-driven definitions (id, category, default
    volume, default pitch, attenuation range); `soundEvent(id)` lookup.
  - **Emission**: `emitSound(event, position, options?)` — a `SoundEmission { event, category, x,
    y, z, volume, pitch, range }`, `null` for unknown events; option volumes (>= 0) override the
    default, pitches clamp to [0.5, 2].
  - **Attenuation**: `audibleVolume(emission, listener)` — `volume * (1 - dist/range)` clamped to
    [0, volume], 0 beyond the range (positional sound).
  - **Mix**: immutable `SoundMixState` of per-category volumes (all 1 by default);
    `setCategoryVolume` (values outside [0, 1] or the same value identity-no-op);
    `effectiveVolume(mix, emission, listener)` — audible volume scaled by the emission's category volume.
  - **Persistence**: `serializeSoundMix` / `deserializeSoundMix` — version 1, validate-before-
    accept (known categories only, volumes in [0, 1], exact key set; descriptive throws).

## Non-goals
- **No audio playback/output** (the audio layer consumes emissions), **no asset files** (original
  synthesis belongs to the audio layer), **no music scheduling** (201), **no `Game.ts` edit**,
  **no save-format change**.

## Preconditions
- Change 199 (`particle-system`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library (199's event-hook shape is mirrored, not imported).

## Proposed change
1. `src/simulation/SoundEventFramework.ts` (NEW): the categories, event table, emission,
   attenuation, mix state, and versioned persistence.

## Compatibility and migration
- One new simulation file; zero registry changes (module-local tables, gamerule-style), zero
  characterization updates, no `Game.ts` edit, no schema/save-format change.

## Risks
- **Volume semantics drift** (vanilla allows volumes > 1, e.g. explosion 4.0). Mitigation: event
  volumes are unclamped positive numbers; only the option pitch clamps and category volumes
  validate to [0, 1]; all pinned by tests.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: categories; the event table (18 events, field validity, lookup incl. unknown);
  emission (defaults, overrides, pitch clamp, unknown event -> null); attenuation (at listener,
  mid-range, at/over range, 0 range); mix (defaults, set with validation/identity no-op,
  effective volume scaling); persistence round-trip and every rejection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
