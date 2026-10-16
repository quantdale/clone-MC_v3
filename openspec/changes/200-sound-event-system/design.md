# Design: 200-sound-event-system

## Context/current state
- No sound model exists. 200 adds the pure sound-event framework (categories, event table,
  emissions, attenuation, per-category mix); 201 schedules ambience/music on top, and the audio
  output layer plays emissions.

## Target state
- `src/simulation/SoundEventFramework.ts` holding the fixed category set, the 18-event table,
  emission/attenuation functions, the immutable mix state, and versioned persistence.

## Invariants
- Pure and headless-safe: no audio context, no mutation of inputs, no randomness.
- Event volumes are positive numbers (vanilla allows > 1, e.g. explosion 4.0); option pitch clamps
  to [0.5, 2]; option volume must be >= 0.
- `emitSound` returns `null` for unknown events; `audibleVolume` is `volume * max(0, 1 - dist /
  range)` and 0 at/over range; `range` must be > 0 in the table.
- `setCategoryVolume` identity-no-ops on values outside [0, 1] and on the same value.
- `effectiveVolume(mix, emission, listener)` = audible volume * the emission category's mix volume.

- Deserialization validates the whole payload before accepting anything (missing categories default to
  full volume); violations throw
  descriptive errors.

## API and data model
```ts
// src/simulation/SoundEventFramework.ts (new)
export type SoundCategory = 'master' | 'music' | 'weather' | 'blocks' | 'hostile' | 'neutral' |
  'players' | 'ambient';
export const SOUND_CATEGORIES: readonly SoundCategory[];

export interface SoundEventDef {
  id: string;            // e.g. 'block_break'
  category: SoundCategory;
  volume: number;        // default volume (positive; may exceed 1)
  pitch: number;         // default pitch
  range: number;         // attenuation distance in blocks (> 0)
}
export const SOUND_EVENTS: readonly SoundEventDef[];
export function soundEvent(id: string): SoundEventDef | undefined;

export type Vec3 = readonly [number, number, number];
export interface SoundEmission {
  event: string;
  category: SoundCategory;
  x: number; y: number; z: number;
  volume: number;
  pitch: number;
  range: number;
}
export function emitSound(event: string, position: Vec3, options?: { volume?: number; pitch?: number }): SoundEmission | null;

export interface SoundMixState { readonly volumes: Readonly<Record<SoundCategory, number>>; }
export function createDefaultSoundMix(): SoundMixState;
export function setCategoryVolume(mix: SoundMixState, category: SoundCategory, value: number): SoundMixState;
export function categoryVolume(mix: SoundMixState, category: SoundCategory): number;

export function audibleVolume(emission: SoundEmission, listener: Vec3): number;
export function effectiveVolume(mix: SoundMixState, emission: SoundEmission): number;

export interface SerializedSoundMix { version: 1; volumes: Record<string, number>; }
export function serializeSoundMix(mix: SoundMixState): SerializedSoundMix;
export function deserializeSoundMix(input: unknown): SoundMixState;
```

## Control/data flow
1. Gameplay systems call `emitSound('block_break', pos)` etc.; the descriptor is pushed to the
   audio layer.
2. The audio layer scales by `audibleVolume` (player position) and `effectiveVolume` (category
   mix) before playback.

## Detailed behavior
- Event table (18 original entries): block_break (blocks, 1.0, 1.0, 16); block_place (blocks, 1.0,
  1.0, 16); block_step (blocks, 0.3, 1.0, 12); chest_open (blocks, 0.6, 1.0, 16); piston_move
  (blocks, 0.6, 1.0, 16); fire_crackle (blocks, 0.5, 1.0, 16); explosion (blocks, 4.0, 1.0, 24);
  rain (weather, 0.5, 1.0, 24); thunder (weather, 10.0, 1.0, 64); bow_shoot (players, 0.5, 1.0,
  16); player_hurt (players, 1.0, 1.0, 16); player_death (players, 1.0, 1.0, 16); eat (players,
  0.7, 1.0, 16); mob_hurt (hostile, 1.0, 1.0, 16); mob_ambient (hostile, 0.5, 1.0, 16); ui_click
  (master, 1.0, 1.0, 8); portal (ambient, 0.8, 1.0, 32); level_up (master, 1.0, 1.0, 16).
- `emitSound`: unknown event -> `null`; `volume = max(0, options.volume ?? def.volume)`;
  `pitch = clamp(options.pitch ?? def.pitch, 0.5, 2)`; carries the event's category and range.
- `audibleVolume`: `dist >= range` -> 0; else `volume * (1 - dist / range)`.
- `setCategoryVolume`: `value` outside [0, 1], unknown category, or equal to the current value ->
  IDENTICAL state; otherwise a new state.
- `deserializeSoundMix` rejections: non-object -> `SoundFramework: expected an object`; bad
  version -> `unsupported version <v>`; unknown category -> `unknown category <c>`; volume out of
  range -> `category <c> volume must be in [0, 1], got <v>`; unknown keys -> `unknown key <k>`.
  Missing categories default to full volume (1).

## Failure modes
- No throws in the event/emission/mix APIs; `emitSound` returns `null` for unknown events.
- Only `deserializeSoundMix` throws (invalid persisted data must not be silently accepted).

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- All operations O(1); table lookups are linear scans over 18/8 entries.

## Testing seams
- Tests drive the framework directly: fixed distances for attenuation, invalid inputs for
  identity no-ops, and every persistence rejection.

## Observability/debugging
- Emissions and the mix are plain immutable objects; the table is introspectable.

## Affected files/symbols
- `src/simulation/SoundEventFramework.ts` (new).
- Tests: `tests/unit/SoundEventFramework.test.ts` (new). No other files.

## Rejected alternatives
- **A shared registry for events**: rejected — a module-local fixed table (gamerule/particle
  style) keeps zero registry changes while staying data-driven.

## Downstream dependencies
- 201 (`ambient-audio`) schedules ambience/music using categories; the audio layer plays
  emissions; 242's e2e asserts emissions after gameplay events.
