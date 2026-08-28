/**
 * Sound-event framework (200): the pure sound-event model — fixed categories, an 18-entry
 * data-driven event table (original definitions; the audio layer synthesizes/owns any assets),
 * positional emissions, distance attenuation, an immutable per-category mix, and versioned
 * persistence. Headless-safe: no audio context, no side effects.
 *
 * Determinism rules:
 * - `emitSound` returns `null` for unknown events; option volume must be >= 0; option pitch
 *   clamps to [0.5, 2]; event default volumes may exceed 1 (vanilla: explosion 4.0).
 * - `audibleVolume` = volume * max(0, 1 - dist/range); 0 at/over the range.
 * - `setCategoryVolume` identity-no-ops on out-of-[0,1] values and same-value sets.
 * - Deserialization validates the whole payload (version, known categories, volumes in [0, 1],
 *   exact key set) before accepting anything; violations throw descriptive errors.
 */
export type SoundCategory =
  | 'master'
  | 'music'
  | 'weather'
  | 'blocks'
  | 'hostile'
  | 'neutral'
  | 'players'
  | 'ambient';

export const SOUND_CATEGORIES: readonly SoundCategory[] = [
  'master',
  'music',
  'weather',
  'blocks',
  'hostile',
  'neutral',
  'players',
  'ambient',
];

/** A data-driven sound event definition. */
export interface SoundEventDef {
  readonly id: string;
  readonly category: SoundCategory;
  /** Default volume (positive; may exceed 1, vanilla-style). */
  readonly volume: number;
  /** Default pitch. */
  readonly pitch: number;
  /** Attenuation distance in blocks (> 0). */
  readonly range: number;
}

const EVENTS: readonly SoundEventDef[] = [
  { id: 'block_break', category: 'blocks', volume: 1.0, pitch: 1.0, range: 16 },
  { id: 'block_place', category: 'blocks', volume: 1.0, pitch: 1.0, range: 16 },
  { id: 'block_step', category: 'blocks', volume: 0.3, pitch: 1.0, range: 12 },
  { id: 'chest_open', category: 'blocks', volume: 0.6, pitch: 1.0, range: 16 },
  { id: 'piston_move', category: 'blocks', volume: 0.6, pitch: 1.0, range: 16 },
  { id: 'fire_crackle', category: 'blocks', volume: 0.5, pitch: 1.0, range: 16 },
  { id: 'explosion', category: 'blocks', volume: 4.0, pitch: 1.0, range: 24 },
  { id: 'rain', category: 'weather', volume: 0.5, pitch: 1.0, range: 24 },
  { id: 'thunder', category: 'weather', volume: 10.0, pitch: 1.0, range: 64 },
  { id: 'bow_shoot', category: 'players', volume: 0.5, pitch: 1.0, range: 16 },
  { id: 'player_hurt', category: 'players', volume: 1.0, pitch: 1.0, range: 16 },
  { id: 'player_death', category: 'players', volume: 1.0, pitch: 1.0, range: 16 },
  { id: 'eat', category: 'players', volume: 0.7, pitch: 1.0, range: 16 },
  { id: 'mob_hurt', category: 'hostile', volume: 1.0, pitch: 1.0, range: 16 },
  { id: 'mob_ambient', category: 'hostile', volume: 0.5, pitch: 1.0, range: 16 },
  { id: 'ui_click', category: 'master', volume: 1.0, pitch: 1.0, range: 8 },
  { id: 'portal', category: 'ambient', volume: 0.8, pitch: 1.0, range: 32 },
  { id: 'level_up', category: 'master', volume: 1.0, pitch: 1.0, range: 16 },
];

/** The fixed sound-event table (18 original entries). */
export const SOUND_EVENTS: readonly SoundEventDef[] = EVENTS;

/** Look up a sound event by id, or `undefined`. */
export function soundEvent(id: string): SoundEventDef | undefined {
  return EVENTS.find((e) => e.id === id);
}

export type Vec3 = readonly [number, number, number];

/** A positional sound emission descriptor (the audio layer plays it). */
export interface SoundEmission {
  readonly event: string;
  readonly category: SoundCategory;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly volume: number;
  readonly pitch: number;
  readonly range: number;
}

/**
 * Emit a sound at a position. Unknown events return `null`; option volume must be >= 0 (default
 * from the event); option pitch clamps to [0.5, 2]. The emission carries the event's category
 * and range.
 */
export function emitSound(
  event: string,
  position: Vec3,
  options?: { volume?: number; pitch?: number },
): SoundEmission | null {
  const def = soundEvent(event);
  if (def === undefined) return null;
  const volume = Math.max(0, options?.volume ?? def.volume);
  const pitch = Math.min(2, Math.max(0.5, options?.pitch ?? def.pitch));
  return {
    event,
    category: def.category,
    x: position[0],
    y: position[1],
    z: position[2],
    volume,
    pitch,
    range: def.range,
  };
}

/** Immutable per-category volume mix (all 1 by default). */
export interface SoundMixState {
  readonly volumes: Readonly<Record<SoundCategory, number>>;
}

/** A fresh mix with every category at full volume. */
export function createDefaultSoundMix(): SoundMixState {
  const volumes: Record<string, number> = {};
  for (const category of SOUND_CATEGORIES) {
    volumes[category] = 1;
  }
  return { volumes: volumes as Record<SoundCategory, number> };
}

function isSoundCategory(value: unknown): value is SoundCategory {
  return typeof value === 'string' && (SOUND_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Set one category's volume. Values outside [0, 1], unknown categories, and same-value sets
 * return the IDENTICAL state; a valid change returns a NEW state.
 */
export function setCategoryVolume(
  mix: SoundMixState,
  category: SoundCategory,
  value: number,
): SoundMixState {
  if (!isSoundCategory(category)) return mix;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return mix;
  if (mix.volumes[category] === value) return mix;
  return { volumes: { ...mix.volumes, [category]: value } };
}

/** Read one category's volume. */
export function categoryVolume(mix: SoundMixState, category: SoundCategory): number {
  return mix.volumes[category];
}

function distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** The audible volume at `listener`: `volume * max(0, 1 - dist/range)`. */
export function audibleVolume(emission: SoundEmission, listener: Vec3): number {
  const dist = distance([emission.x, emission.y, emission.z], listener);
  if (dist >= emission.range) return 0;
  return emission.volume * (1 - dist / emission.range);
}

/** The audible volume at `listener` scaled by the emission category's mix volume. */
export function effectiveVolume(mix: SoundMixState, emission: SoundEmission, listener: Vec3): number {
  return audibleVolume(emission, listener) * mix.volumes[emission.category];
}

/** Versioned serialized mix. */
export interface SerializedSoundMix {
  version: 1;
  volumes: Record<string, number>;
}

/** Serialize the mix (identity-shaped; validation happens on deserialize). */
export function serializeSoundMix(mix: SoundMixState): SerializedSoundMix {
  return { version: 1, volumes: { ...mix.volumes } };
}

/**
 * Validate and restore a serialized mix. The whole payload is validated first: object shape,
 * version, known categories only, and any present volume in [0, 1] (missing categories default
 * to full volume 1). Any violation throws a descriptive `Error`; nothing is partially accepted.
 */
export function deserializeSoundMix(input: unknown): SoundMixState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('SoundFramework: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== 1) {
    throw new Error(`SoundFramework: unsupported version ${String(r.version)}`);
  }
  if (typeof r.volumes !== 'object' || r.volumes === null || Array.isArray(r.volumes)) {
    throw new Error('SoundFramework: volumes must be an object');
  }
  const volumes = r.volumes as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const category of SOUND_CATEGORIES) {
    const value = volumes[category];
    if (value === undefined) {
      out[category] = 1; // missing categories default to full volume
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`SoundFramework: category ${category} volume must be in [0, 1], got ${String(value)}`);
    }
    out[category] = value;
  }
  for (const key of Object.keys(volumes)) {
    if (!isSoundCategory(key)) {
      throw new Error(`SoundFramework: unknown category ${key}`);
    }
  }
  for (const key of Object.keys(r)) {
    if (key !== 'version' && key !== 'volumes') {
      throw new Error(`SoundFramework: unknown key ${key}`);
    }
  }
  return { volumes: out as Record<SoundCategory, number> };
}
