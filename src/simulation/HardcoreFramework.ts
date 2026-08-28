/**
 * Hardcore framework (193): the hardcore world setting for the game-modes arc (192-195). A pure,
 * headless-safe module holding the immutable hardcore flag plus the vanilla rules it implies:
 * a difficulty lock (the effective difficulty is always 'hard' when enabled) and death-world
 * semantics (death is permanent; the post-death mode is always 'spectator' when enabled).
 *
 * Determinism rules:
 * - `setHardcore` returns a NEW state on change and the IDENTICAL state for the same boolean.
 * - `effectiveDifficulty` and `respawnModeAfterDeath` pass their inputs through verbatim when
 *   hardcore is disabled; the lock/spectator result wins unconditionally when enabled.
 * - Deserialization validates the whole payload (version, boolean flag, unknown keys) before
 *   accepting anything; violations throw descriptive errors — no partial acceptance.
 */
import type { DifficultyLevel } from './WorldDifficulty';
import type { GameMode } from './GameModeFramework';

/** Immutable hardcore state (a world-level setting, independent of the player's mode). */
export interface HardcoreState {
  readonly hardcore: boolean;
}

/** A fresh state with hardcore disabled (the default for normal worlds). */
export function createDefaultHardcoreState(): HardcoreState {
  return { hardcore: false };
}

/**
 * Set the hardcore flag. A changed value returns a NEW state; the same value returns the IDENTICAL
 * state (identity no-op).
 */
export function setHardcore(state: HardcoreState, enabled: boolean): HardcoreState {
  if (state.hardcore === enabled) return state;
  return { hardcore: enabled };
}

/** Whether the world locks its difficulty (true exactly when hardcore is enabled). */
export function locksDifficulty(state: HardcoreState): boolean {
  return state.hardcore;
}

/**
 * The effective difficulty: ALWAYS 'hard' when hardcore is enabled (the vanilla lock, regardless
 * of the configured level); the configured level verbatim otherwise.
 */
export function effectiveDifficulty(
  state: HardcoreState,
  level: DifficultyLevel,
): DifficultyLevel {
  return state.hardcore ? 'hard' : level;
}

/** Whether death is permanent in this world (true exactly when hardcore is enabled). */
export function forcesPermanentDeath(state: HardcoreState): boolean {
  return state.hardcore;
}

/**
 * The mode a dead player returns in: ALWAYS 'spectator' when hardcore is enabled (the player can
 * only observe the dead world); the current mode verbatim otherwise.
 */
export function respawnModeAfterDeath(state: HardcoreState, currentMode: GameMode): GameMode {
  return state.hardcore ? 'spectator' : currentMode;
}

/** Versioned serialized hardcore state. */
export interface SerializedHardcoreState {
  version: 1;
  hardcore: boolean;
}

/** Serialize the state (identity-shaped; validation happens on deserialize). */
export function serializeHardcoreState(state: HardcoreState): SerializedHardcoreState {
  return { version: 1, hardcore: state.hardcore };
}

/**
 * Validate and restore a serialized state. The whole payload is validated first: object shape,
 * version, the boolean flag, and the exact key set (unknown keys rejected). Any violation throws a
 * descriptive `Error`; nothing is partially accepted.
 */
export function deserializeHardcoreState(input: unknown): HardcoreState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('HardcoreFramework: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== 1) {
    throw new Error(`HardcoreFramework: unsupported version ${String(r.version)}`);
  }
  if (typeof r.hardcore !== 'boolean') {
    throw new Error(`HardcoreFramework: hardcore must be a boolean, got ${String(r.hardcore)}`);
  }
  for (const key of Object.keys(r)) {
    if (key !== 'version' && key !== 'hardcore') {
      throw new Error(`HardcoreFramework: unknown key ${key}`);
    }
  }
  return { hardcore: r.hardcore };
}
