/**
 * World difficulty (188): the first difficulty system — typed difficulty levels with vanilla-ish
 * knobs applied to spawn/damage/survival. A `DifficultyDefinition` carries the four knobs
 * 138/141/124-style systems consult:
 * - `hostileSpawns` — peaceful disables hostile spawns entirely (138's spawn rules query this);
 * - `hostileDamageMultiplier` — vanilla's 0.5/1/1.5 (easy/normal/hard) on mob→player damage
 *   (141/116-style damage resolution);
 * - `hungerDepletionMultiplier` — vanilla's 0.5/1/1.5 on food/hunger depletion (124);
 * - `canStarve` — peaceful cannot starve (no starvation damage).
 *
 * `parseDifficultyLevel` is the case-insensitive text→level entry point (commands/config);
 * serialize/deserialize are the versioned, validated persistence pair.
 */
export const DIFFICULTY_LEVELS = ['peaceful', 'easy', 'normal', 'hard'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/** The default difficulty for a new world (vanilla). */
export const DEFAULT_DIFFICULTY: DifficultyLevel = 'normal';

/** The per-level knobs. */
export interface DifficultyDefinition {
  readonly level: DifficultyLevel;
  /** Whether hostile mobs can spawn at all (peaceful: false). */
  readonly hostileSpawns: boolean;
  /** Mob→player damage multiplier (vanilla: 0.5 / 1 / 1.5; peaceful 0). */
  readonly hostileDamageMultiplier: number;
  /** Hunger/food depletion multiplier (vanilla: 0.5 / 1 / 1.5; peaceful 0). */
  readonly hungerDepletionMultiplier: number;
  /** Whether starvation damage can occur (peaceful: false). */
  readonly canStarve: boolean;
}

const DIFFICULTY_TABLE: Readonly<Record<DifficultyLevel, DifficultyDefinition>> = Object.freeze({
  peaceful: Object.freeze({
    level: 'peaceful',
    hostileSpawns: false,
    hostileDamageMultiplier: 0,
    hungerDepletionMultiplier: 0,
    canStarve: false,
  }),
  easy: Object.freeze({
    level: 'easy',
    hostileSpawns: true,
    hostileDamageMultiplier: 0.5,
    hungerDepletionMultiplier: 0.5,
    canStarve: true,
  }),
  normal: Object.freeze({
    level: 'normal',
    hostileSpawns: true,
    hostileDamageMultiplier: 1,
    hungerDepletionMultiplier: 1,
    canStarve: true,
  }),
  hard: Object.freeze({
    level: 'hard',
    hostileSpawns: true,
    hostileDamageMultiplier: 1.5,
    hungerDepletionMultiplier: 1.5,
    canStarve: true,
  }),
});

/** The frozen definition for a level. */
export function difficultyDefinition(level: DifficultyLevel): DifficultyDefinition {
  return DIFFICULTY_TABLE[level];
}

/** Whether hostile mobs may spawn at this difficulty. */
export function difficultyAllowsHostileSpawns(level: DifficultyLevel): boolean {
  return DIFFICULTY_TABLE[level].hostileSpawns;
}

/** The mob→player damage multiplier at this difficulty. */
export function difficultyHostileDamageMultiplier(level: DifficultyLevel): number {
  return DIFFICULTY_TABLE[level].hostileDamageMultiplier;
}

/** The hunger/food depletion multiplier at this difficulty. */
export function difficultyHungerDepletionMultiplier(level: DifficultyLevel): number {
  return DIFFICULTY_TABLE[level].hungerDepletionMultiplier;
}

/** Whether starvation damage can occur at this difficulty. */
export function difficultyCanStarve(level: DifficultyLevel): boolean {
  return DIFFICULTY_TABLE[level].canStarve;
}

/**
 * Parse a difficulty from text: trimmed, case-insensitive; `null` for anything not in the level
 * set (including null input) — the caller decides the fallback.
 */
export function parseDifficultyLevel(input: string | null): DifficultyLevel | null {
  if (input === null) return null;
  const normalized = input.trim().toLowerCase();
  return (DIFFICULTY_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as DifficultyLevel)
    : null;
}

/** Versioned serialized difficulty. */
export interface SerializedDifficulty {
  version: 1;
  level: DifficultyLevel;
}

export const DIFFICULTY_VERSION = 1;

/** Serialize a difficulty level. */
export function serializeDifficulty(level: DifficultyLevel): SerializedDifficulty {
  return { version: DIFFICULTY_VERSION as 1, level };
}

/**
 * Validate and restore a serialized difficulty. Wrong version or an unknown level string throws a
 * descriptive `Error`; nothing is partially accepted.
 */
export function deserializeDifficulty(input: unknown): DifficultyLevel {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Difficulty: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== DIFFICULTY_VERSION) {
    throw new Error(`Difficulty: unsupported version ${String(r.version)}`);
  }
  const level = parseDifficultyLevel(typeof r.level === 'string' ? r.level : null);
  if (level === null) {
    throw new Error(`Difficulty: unknown level ${String(r.level)}`);
  }
  return level;
}
