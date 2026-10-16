import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_LEVELS,
  deserializeDifficulty,
  difficultyAllowsHostileSpawns,
  difficultyCanStarve,
  difficultyDefinition,
  difficultyHostileDamageMultiplier,
  difficultyHungerDepletionMultiplier,
  parseDifficultyLevel,
  serializeDifficulty,
} from '../../src/simulation/WorldDifficulty';

describe('difficulty definitions', () => {
  it('has exactly the four vanilla levels', () => {
    expect(DIFFICULTY_LEVELS).toEqual(['peaceful', 'easy', 'normal', 'hard']);
    expect(DEFAULT_DIFFICULTY).toBe('normal');
  });

  it('peaceful disables hostile spawns, damage, hunger, and starvation', () => {
    const p = difficultyDefinition('peaceful');
    expect(p).toEqual({
      level: 'peaceful',
      hostileSpawns: false,
      hostileDamageMultiplier: 0,
      hungerDepletionMultiplier: 0,
      canStarve: false,
    });
  });

  it('easy/normal/hard carry vanilla multipliers and full spawn/starve rules', () => {
    expect(difficultyDefinition('easy')).toMatchObject({
      hostileSpawns: true,
      hostileDamageMultiplier: 0.5,
      hungerDepletionMultiplier: 0.5,
      canStarve: true,
    });
    expect(difficultyDefinition('normal')).toMatchObject({
      hostileSpawns: true,
      hostileDamageMultiplier: 1,
      hungerDepletionMultiplier: 1,
      canStarve: true,
    });
    expect(difficultyDefinition('hard')).toMatchObject({
      hostileSpawns: true,
      hostileDamageMultiplier: 1.5,
      hungerDepletionMultiplier: 1.5,
      canStarve: true,
    });
  });

  it('accessors read the table', () => {
    expect(difficultyAllowsHostileSpawns('peaceful')).toBe(false);
    expect(difficultyAllowsHostileSpawns('hard')).toBe(true);
    expect(difficultyHostileDamageMultiplier('easy')).toBe(0.5);
    expect(difficultyHostileDamageMultiplier('hard')).toBe(1.5);
    expect(difficultyHungerDepletionMultiplier('normal')).toBe(1);
    expect(difficultyHungerDepletionMultiplier('easy')).toBe(0.5);
    expect(difficultyCanStarve('peaceful')).toBe(false);
    expect(difficultyCanStarve('normal')).toBe(true);
  });
});

describe('parseDifficultyLevel', () => {
  it('parses trimmed case-insensitive text', () => {
    expect(parseDifficultyLevel('easy')).toBe('easy');
    expect(parseDifficultyLevel('  HARD ')).toBe('hard');
    expect(parseDifficultyLevel('Normal')).toBe('normal');
    expect(parseDifficultyLevel('PEACEFUL')).toBe('peaceful');
  });

  it('returns null for unknown text and null input', () => {
    expect(parseDifficultyLevel('insane')).toBeNull();
    expect(parseDifficultyLevel('')).toBeNull();
    expect(parseDifficultyLevel(null)).toBeNull();
  });
});

describe('persistence', () => {
  it('serializes and deserializes round-trip', () => {
    const serialized = serializeDifficulty('hard');
    expect(serialized.version).toBe(1);
    expect(deserializeDifficulty(serialized)).toBe('hard');
  });

  it('rejects malformed payloads', () => {
    expect(() => deserializeDifficulty(null)).toThrow();
    expect(() => deserializeDifficulty({ version: 2, level: 'normal' })).toThrow(/unsupported version/);
    expect(() => deserializeDifficulty({ version: 1, level: 'insane' })).toThrow(/unknown level/);
    expect(() => deserializeDifficulty({ version: 1, level: 42 })).toThrow(/unknown level/);
  });
});
