import { describe, it, expect } from 'vitest';
import {
  GAME_RULE_KEYS,
  createDefaultGameRules,
  deserializeGameRules,
  gameRuleDefinition,
  gameRuleDefinitions,
  getGameRule,
  isValidGameRuleValue,
  parseGameRuleValue,
  serializeGameRules,
  setGameRule,
} from '../../src/simulation/GameRuleFramework';

describe('gamerule registry', () => {
  it('defines the nine rules with vanilla kinds and defaults', () => {
    const defs = gameRuleDefinitions();
    expect(defs.length).toBe(9);
    expect(GAME_RULE_KEYS.length).toBe(9);
    expect(gameRuleDefinition('doDaylightCycle')).toEqual({
      key: 'doDaylightCycle',
      kind: 'boolean',
      defaultValue: true,
    });
    expect(gameRuleDefinition('randomTickSpeed')).toEqual({
      key: 'randomTickSpeed',
      kind: 'integer',
      defaultValue: 3,
    });
    expect(gameRuleDefinition('spawnRadius')).toEqual({
      key: 'spawnRadius',
      kind: 'integer',
      defaultValue: 10,
    });
    expect(gameRuleDefinition('not_a_rule')).toBeUndefined();
  });

  it('creates a store with every default', () => {
    const store = createDefaultGameRules();
    expect(getGameRule(store, 'doDaylightCycle')).toBe(true);
    expect(getGameRule(store, 'keepInventory')).toBe(false);
    expect(getGameRule(store, 'mobGriefing')).toBe(true);
    expect(getGameRule(store, 'randomTickSpeed')).toBe(3);
    expect(getGameRule(store, 'spawnRadius')).toBe(10);
  });
});

describe('get/set with validation', () => {
  it('sets legal values into a new store, leaving the original untouched', () => {
    const store = createDefaultGameRules();
    const next = setGameRule(store, 'keepInventory', true);
    expect(getGameRule(next, 'keepInventory')).toBe(true);
    expect(getGameRule(store, 'keepInventory')).toBe(false); // immutable
    const next2 = setGameRule(next, 'randomTickSpeed', 7);
    expect(getGameRule(next2, 'randomTickSpeed')).toBe(7);
  });

  it('illegal values are identity no-ops', () => {
    const store = createDefaultGameRules();
    // Kind validation is runtime: a boolean rule given a string is rejected at runtime.
    expect(setGameRule(store, 'doDaylightCycle', 'yes' as unknown as boolean)).toBe(store);
    expect(setGameRule(store, 'randomTickSpeed', 1.5)).toBe(store);
    // Setting the same value is also an identity no-op.
    expect(setGameRule(store, 'doDaylightCycle', true)).toBe(store);
  });

  it('isValidGameRuleValue checks the kind', () => {
    expect(isValidGameRuleValue('doDaylightCycle', true)).toBe(true);
    expect(isValidGameRuleValue('doDaylightCycle', 'true')).toBe(false);
    expect(isValidGameRuleValue('randomTickSpeed', 5)).toBe(true);
    expect(isValidGameRuleValue('randomTickSpeed', 5.5)).toBe(false);
    expect(isValidGameRuleValue('not_a_rule', true)).toBe(false);
  });
});

describe('text parsing (191 entry point)', () => {
  it('parses booleans case-insensitively', () => {
    expect(parseGameRuleValue('doDaylightCycle', 'true')).toBe(true);
    expect(parseGameRuleValue('doDaylightCycle', 'FALSE')).toBe(false);
    expect(parseGameRuleValue('doDaylightCycle', '  True ')).toBe(true);
    expect(parseGameRuleValue('doDaylightCycle', 'yes')).toBeNull();
  });

  it('parses strict integers and verbatim strings', () => {
    expect(parseGameRuleValue('randomTickSpeed', '3')).toBe(3);
    expect(parseGameRuleValue('randomTickSpeed', '-1')).toBe(-1);
    expect(parseGameRuleValue('randomTickSpeed', '1.5')).toBeNull();
    expect(parseGameRuleValue('randomTickSpeed', 'abc')).toBeNull();
    expect(parseGameRuleValue('not_a_rule', 'x')).toBeNull();
  });
});

describe('persistence', () => {
  it('serializes and deserializes round-trip', () => {
    const store = createDefaultGameRules();
    const changed = setGameRule(setGameRule(store, 'keepInventory', true), 'randomTickSpeed', 0);
    const serialized = serializeGameRules(changed);
    expect(serialized.version).toBe(1);
    expect(deserializeGameRules(serialized)).toEqual(changed);
  });

  it('rejects malformed payloads', () => {
    expect(() => deserializeGameRules(null)).toThrow();
    expect(() => deserializeGameRules({ version: 2 })).toThrow(/unsupported version/);
    expect(() =>
      deserializeGameRules({ version: 1, rules: { randomTickSpeed: 1.5 } }),
    ).toThrow();
    expect(() =>
      deserializeGameRules({ version: 1, rules: { doDaylightCycle: 'true' } }),
    ).toThrow();
    // All nine known keys PLUS an unknown key trips the unknown-key rejection explicitly.
    expect(() =>
      deserializeGameRules({
        version: 1,
        rules: {
          doDaylightCycle: true,
          doMobSpawning: true,
          keepInventory: false,
          mobGriefing: true,
          doWeatherCycle: true,
          doFireTick: true,
          doImmediateRespawn: false,
          randomTickSpeed: 3,
          spawnRadius: 10,
          not_a_rule: true,
        },
      }),
    ).toThrow(/unknown rule key/);
  });
});
