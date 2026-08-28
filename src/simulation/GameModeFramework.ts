/**
 * Game-mode framework (192): the canonical game-mode model for the game-modes arc (192-195).
 * Defines the mode set (asserted equal to 191's CoreCommands.GAMEMODES), immutable mode state,
 * a text entry point for commands, four vanilla-inspired creative-behavior predicates (flight,
 * instant block break, creative inventory, no survival depletion), and versioned persistence.
 *
 * Determinism rules:
 * - `setGameMode` returns a NEW state on change and the IDENTICAL state for the same mode.
 * - `parseGameMode` is case-insensitive, trims input, and returns `null` outside the mode set.
 * - Deserialization validates the whole payload (version, mode, unknown keys) before accepting
 *   anything; violations throw descriptive errors — no partial acceptance.
 *
 * Behavior rules (vanilla semantics):
 *   canFly            : creative, spectator
 *   instantBlockBreak : creative only
 *   depletesItems     : survival, adventure  (creative/spectator: creative inventory)
 *   survivalStatsDeplete : survival, adventure (creative/spectator: no depletion)
 */
export const GAME_MODES = ['survival', 'creative', 'adventure', 'spectator'] as const;

export type GameMode = (typeof GAME_MODES)[number];

/** Immutable game-mode state. */
export interface GameModeState {
  readonly mode: GameMode;
}

/** A fresh state in survival mode (the vanilla default). */
export function createDefaultGameModeState(): GameModeState {
  return { mode: 'survival' };
}

function isGameMode(value: unknown): value is GameMode {
  return typeof value === 'string' && (GAME_MODES as readonly string[]).includes(value);
}

/**
 * Set the mode. A different, valid mode returns a NEW state; the same mode (or an invalid value
 * from an untyped caller) returns the IDENTICAL state (identity no-op).
 */
export function setGameMode(state: GameModeState, mode: GameMode): GameModeState {
  if (!isGameMode(mode)) return state;
  if (state.mode === mode) return state;
  return { mode };
}

/**
 * Text entry point (191's `/gamemode` command): the four mode names case-insensitively with
 * surrounding whitespace trimmed; `null` for anything else, including empty input.
 */
export function parseGameMode(text: string): GameMode | null {
  const normalized = text.trim().toLowerCase();
  if (!isGameMode(normalized)) return null;
  return normalized;
}

/** Whether the mode grants flight (creative and spectator). */
export function canFly(mode: GameMode): boolean {
  return mode === 'creative' || mode === 'spectator';
}

/** Whether the mode breaks blocks instantly (creative only). */
export function instantBlockBreak(mode: GameMode): boolean {
  return mode === 'creative';
}

/** Whether the mode depletes items on use/place (survival and adventure). */
export function depletesItems(mode: GameMode): boolean {
  return mode === 'survival' || mode === 'adventure';
}

/** Whether the mode depletes survival stats (hunger/damage; survival and adventure). */
export function survivalStatsDeplete(mode: GameMode): boolean {
  return mode === 'survival' || mode === 'adventure';
}

/** Versioned serialized game-mode state. */
export interface SerializedGameModeState {
  version: 1;
  mode: GameMode;
}

/** Serialize the state (identity-shaped; validation happens on deserialize). */
export function serializeGameModeState(state: GameModeState): SerializedGameModeState {
  return { version: 1, mode: state.mode };
}

/**
 * Validate and restore a serialized state. The whole payload is validated first: object shape,
 * version, mode membership, and the exact key set (unknown keys rejected). Any violation throws a
 * descriptive `Error`; nothing is partially accepted.
 */
export function deserializeGameModeState(input: unknown): GameModeState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('GameModeFramework: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== 1) {
    throw new Error(`GameModeFramework: unsupported version ${String(r.version)}`);
  }
  if (!isGameMode(r.mode)) {
    throw new Error(`GameModeFramework: unknown mode ${String(r.mode)}`);
  }
  for (const key of Object.keys(r)) {
    if (key !== 'version' && key !== 'mode') {
      throw new Error(`GameModeFramework: unknown key ${key}`);
    }
  }
  return { mode: r.mode };
}
