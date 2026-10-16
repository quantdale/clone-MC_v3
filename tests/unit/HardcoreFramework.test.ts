import { describe, it, expect } from 'vitest';
import { DIFFICULTY_LEVELS, type DifficultyLevel } from '../../src/simulation/WorldDifficulty';
import { GAME_MODES, type GameMode } from '../../src/simulation/GameModeFramework';
import {
  createDefaultHardcoreState,
  deserializeHardcoreState,
  effectiveDifficulty,
  forcesPermanentDeath,
  locksDifficulty,
  respawnModeAfterDeath,
  serializeHardcoreState,
  setHardcore,
} from '../../src/simulation/HardcoreFramework';

describe('state transitions', () => {
  it('defaults to disabled', () => {
    expect(createDefaultHardcoreState()).toEqual({ hardcore: false });
  });

  it('returns a new state on change', () => {
    const state = createDefaultHardcoreState();
    const enabled = setHardcore(state, true);
    expect(enabled).toEqual({ hardcore: true });
    expect(enabled).not.toBe(state);
    expect(state).toEqual({ hardcore: false });
  });

  it('returns the identical state for the same value', () => {
    const state = createDefaultHardcoreState();
    expect(setHardcore(state, false)).toBe(state);
    const enabled = setHardcore(state, true);
    expect(setHardcore(enabled, true)).toBe(enabled);
  });
});

describe('difficulty lock', () => {
  it('locks difficulty exactly when enabled', () => {
    expect(locksDifficulty(createDefaultHardcoreState())).toBe(false);
    expect(locksDifficulty({ hardcore: true })).toBe(true);
  });

  it('forces hard for every configured level when enabled', () => {
    const state = { hardcore: true };
    for (const level of DIFFICULTY_LEVELS) {
      expect(effectiveDifficulty(state, level)).toBe('hard');
    }
  });

  it('passes the configured level through when disabled', () => {
    const state = createDefaultHardcoreState();
    const levels: readonly DifficultyLevel[] = [...DIFFICULTY_LEVELS];
    expect(levels.map((level) => effectiveDifficulty(state, level))).toEqual(levels);
  });
});

describe('death-world semantics', () => {
  it('forces permanent death exactly when enabled', () => {
    expect(forcesPermanentDeath(createDefaultHardcoreState())).toBe(false);
    expect(forcesPermanentDeath({ hardcore: true })).toBe(true);
  });

  it('returns spectator for every mode when enabled', () => {
    const state = { hardcore: true };
    for (const mode of GAME_MODES) {
      expect(respawnModeAfterDeath(state, mode)).toBe('spectator');
    }
  });

  it('passes the current mode through when disabled', () => {
    const state = createDefaultHardcoreState();
    const modes: readonly GameMode[] = [...GAME_MODES];
    expect(modes.map((mode) => respawnModeAfterDeath(state, mode))).toEqual(modes);
  });
});

describe('persistence', () => {
  it('round-trips both states', () => {
    for (const state of [{ hardcore: false }, { hardcore: true }]) {
      expect(deserializeHardcoreState(serializeHardcoreState(state))).toEqual(state);
    }
  });

  it('rejects a non-object payload', () => {
    expect(() => deserializeHardcoreState('yes')).toThrow(
      'HardcoreFramework: expected an object',
    );
    expect(() => deserializeHardcoreState(null)).toThrow(
      'HardcoreFramework: expected an object',
    );
  });

  it('rejects an unsupported version', () => {
    expect(() => deserializeHardcoreState({ version: 0, hardcore: true })).toThrow(
      'HardcoreFramework: unsupported version 0',
    );
  });

  it('rejects a non-boolean flag', () => {
    expect(() => deserializeHardcoreState({ version: 1, hardcore: 'yes' })).toThrow(
      'HardcoreFramework: hardcore must be a boolean, got yes',
    );
  });

  it('rejects unknown keys', () => {
    expect(() => deserializeHardcoreState({ version: 1, hardcore: true, extra: 1 })).toThrow(
      'HardcoreFramework: unknown key extra',
    );
  });
});
