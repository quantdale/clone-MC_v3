import { describe, it, expect } from 'vitest';
import { GAMEMODES as COMMAND_GAMEMODES } from '../../src/simulation/CoreCommands';
import {
  GAME_MODES,
  canFly,
  createDefaultGameModeState,
  depletesItems,
  deserializeGameModeState,
  instantBlockBreak,
  parseGameMode,
  serializeGameModeState,
  setGameMode,
  survivalStatsDeplete,
  type GameMode,
} from '../../src/simulation/GameModeFramework';

describe('mode set', () => {
  it('defines exactly the four vanilla modes in order', () => {
    expect(GAME_MODES).toEqual(['survival', 'creative', 'adventure', 'spectator']);
  });

  it('defaults to survival', () => {
    expect(createDefaultGameModeState()).toEqual({ mode: 'survival' });
  });

  it('stays equal to 191 CoreCommands.GAMEMODES', () => {
    expect([...GAME_MODES]).toEqual([...COMMAND_GAMEMODES]);
  });
});

describe('setGameMode', () => {
  it('returns a new state on change', () => {
    const state = createDefaultGameModeState();
    const creative = setGameMode(state, 'creative');
    expect(creative).toEqual({ mode: 'creative' });
    expect(creative).not.toBe(state);
    expect(state).toEqual({ mode: 'survival' });
  });

  it('returns the identical state for the same mode', () => {
    const state = createDefaultGameModeState();
    expect(setGameMode(state, 'survival')).toBe(state);
  });
});

describe('text parsing', () => {
  it('parses each mode case-insensitively with trimmed whitespace', () => {
    expect(parseGameMode('creative')).toBe('creative');
    expect(parseGameMode('  CREATIVE  ')).toBe('creative');
    expect(parseGameMode('Spectator')).toBe('spectator');
  });

  it('rejects unknown values and empty input', () => {
    expect(parseGameMode('hard')).toBeNull();
    expect(parseGameMode('')).toBeNull();
    expect(parseGameMode('   ')).toBeNull();
  });
});

describe('behavior rules', () => {
  const modes: readonly GameMode[] = [...GAME_MODES];

  it('canFly is true for creative and spectator only', () => {
    expect(modes.map(canFly)).toEqual([false, true, false, true]);
  });

  it('instantBlockBreak is true for creative only', () => {
    expect(modes.map(instantBlockBreak)).toEqual([false, true, false, false]);
  });

  it('depletesItems is true for survival and adventure only', () => {
    expect(modes.map(depletesItems)).toEqual([true, false, true, false]);
  });

  it('survivalStatsDeplete is true for survival and adventure only', () => {
    expect(modes.map(survivalStatsDeplete)).toEqual([true, false, true, false]);
  });
});

describe('persistence', () => {
  it('round-trips every mode', () => {
    for (const mode of GAME_MODES) {
      const state = { mode };
      expect(deserializeGameModeState(serializeGameModeState(state))).toEqual(state);
    }
  });

  it('rejects a non-object payload', () => {
    expect(() => deserializeGameModeState(42)).toThrow('GameModeFramework: expected an object');
    expect(() => deserializeGameModeState(null)).toThrow('GameModeFramework: expected an object');
    expect(() => deserializeGameModeState('creative')).toThrow(
      'GameModeFramework: expected an object',
    );
  });

  it('rejects an unsupported version', () => {
    expect(() => deserializeGameModeState({ version: 0, mode: 'creative' })).toThrow(
      'GameModeFramework: unsupported version 0',
    );
  });

  it('rejects a mode outside the set', () => {
    expect(() => deserializeGameModeState({ version: 1, mode: 'hard' })).toThrow(
      "GameModeFramework: unknown mode hard",
    );
  });

  it('rejects unknown keys', () => {
    expect(() =>
      deserializeGameModeState({ version: 1, mode: 'creative', extra: true }),
    ).toThrow('GameModeFramework: unknown key extra');
  });
});
