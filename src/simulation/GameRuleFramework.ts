/**
 * Gamerule framework (189): the rules layer — a typed gamerule registry with boolean/integer/string
 * values, immutable per-world state, typed get/set with validation, a text parser for 191's
 * `/gamerule` command, and versioned, validated persistence.
 *
 * The initial rule set (vanilla keys and defaults):
 *   doDaylightCycle (boolean, true), doMobSpawning (boolean, true), keepInventory (boolean, false),
 *   mobGriefing (boolean, true), doWeatherCycle (boolean, true), doFireTick (boolean, true),
 *   doImmediateRespawn (boolean, false), randomTickSpeed (integer, 3), spawnRadius (integer, 10).
 *
 * Determinism rules:
 * - `setGameRule` validates the value against the rule's kind; an invalid value returns the
 *   IDENTICAL store (identity no-op). `isValidGameRuleValue` lets callers check first.
 * - `parseGameRuleValue` is the text entry point (booleans case-insensitive, integers strict,
 *   strings verbatim); `null` on parse failure.
 * - Deserialization validates the version, the exact known-key set, and each value's kind before
 *   accepting anything.
 */
export const GAMERULE_VERSION = 1;

export type GameRuleKind = 'boolean' | 'integer' | 'string';
export type GameRuleValue = boolean | number | string;

/** One rule's definition: key, value kind, and default. */
export interface GameRuleDefinition {
  readonly key: string;
  readonly kind: GameRuleKind;
  readonly defaultValue: GameRuleValue;
}

/** The known rule keys (the typed set). */
export const GAME_RULE_KEYS = [
  'doDaylightCycle',
  'doMobSpawning',
  'keepInventory',
  'mobGriefing',
  'doWeatherCycle',
  'doFireTick',
  'doImmediateRespawn',
  'randomTickSpeed',
  'spawnRadius',
] as const;

export type GameRuleKey = (typeof GAME_RULE_KEYS)[number];

const RULES: readonly GameRuleDefinition[] = [
  { key: 'doDaylightCycle', kind: 'boolean', defaultValue: true },
  { key: 'doMobSpawning', kind: 'boolean', defaultValue: true },
  { key: 'keepInventory', kind: 'boolean', defaultValue: false },
  { key: 'mobGriefing', kind: 'boolean', defaultValue: true },
  { key: 'doWeatherCycle', kind: 'boolean', defaultValue: true },
  { key: 'doFireTick', kind: 'boolean', defaultValue: true },
  { key: 'doImmediateRespawn', kind: 'boolean', defaultValue: false },
  { key: 'randomTickSpeed', kind: 'integer', defaultValue: 3 },
  { key: 'spawnRadius', kind: 'integer', defaultValue: 10 },
];

/** Immutable per-world gamerule state. */
export type GameRuleStore = Readonly<Record<GameRuleKey, GameRuleValue>>;

/** All rule definitions (the registry). */
export function gameRuleDefinitions(): readonly GameRuleDefinition[] {
  return RULES;
}

/** One rule's definition by key, or `undefined`. */
export function gameRuleDefinition(key: string): GameRuleDefinition | undefined {
  return RULES.find((r) => r.key === key);
}

/** A fresh store with every rule at its default. */
export function createDefaultGameRules(): GameRuleStore {
  const store: Record<string, GameRuleValue> = {};
  for (const rule of RULES) {
    store[rule.key] = rule.defaultValue;
  }
  return store as GameRuleStore;
}

/** Read one rule's value. */
export function getGameRule(store: GameRuleStore, key: GameRuleKey): GameRuleValue {
  return store[key];
}

/** Whether `value` is legal for `key`'s kind. */
export function isValidGameRuleValue(key: string, value: unknown): value is GameRuleValue {
  const def = gameRuleDefinition(key);
  if (!def) return false;
  switch (def.kind) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'string':
      return typeof value === 'string';
  }
}

/**
 * Set one rule. A legal value returns a NEW store; an illegal value (or unknown key) returns the
 * IDENTICAL store (identity no-op). Callers can check `isValidGameRuleValue` first.
 */
export function setGameRule(store: GameRuleStore, key: GameRuleKey, value: GameRuleValue): GameRuleStore {
  if (!isValidGameRuleValue(key, value)) return store;
  if (store[key] === value) return store;
  return { ...store, [key]: value };
}

/**
 * Parse a text value for a rule (191's `/gamerule` entry point): booleans accept true/false
 * case-insensitively, integers accept strict integer text, strings accept the text verbatim;
 * `null` on any parse failure or unknown key.
 */
export function parseGameRuleValue(key: string, text: string): GameRuleValue | null {
  const def = gameRuleDefinition(key);
  if (!def) return null;
  switch (def.kind) {
    case 'boolean': {
      const normalized = text.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
      return null;
    }
    case 'integer': {
      const trimmed = text.trim();
      if (!/^-?\d+$/.test(trimmed)) return null;
      const value = Number(trimmed);
      return Number.isSafeInteger(value) ? value : null;
    }
    case 'string':
      return text;
  }
}

/** Versioned serialized gamerules. */
export interface SerializedGameRules {
  version: 1;
  rules: Record<string, GameRuleValue>;
}

/** Serialize the store (identity-shaped; validation happens on deserialize). */
export function serializeGameRules(store: GameRuleStore): SerializedGameRules {
  return { version: GAMERULE_VERSION as 1, rules: { ...store } };
}

/**
 * Validate and restore a serialized store. The whole payload is validated first: version, the
 * exact known-key set (unknown keys rejected), and each value's kind. Any violation throws a
 * descriptive `Error`; nothing is partially accepted.
 */
export function deserializeGameRules(input: unknown): GameRuleStore {
  if (typeof input !== 'object' || input === null) {
    throw new Error('GameRules: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== GAMERULE_VERSION) {
    throw new Error(`GameRules: unsupported version ${String(r.version)}`);
  }
  if (typeof r.rules !== 'object' || r.rules === null || Array.isArray(r.rules)) {
    throw new Error('GameRules: rules must be an object');
  }
  const rules = r.rules as Record<string, unknown>;
  const store: Record<string, GameRuleValue> = {};
  for (const rule of RULES) {
    const value = rules[rule.key];
    if (!isValidGameRuleValue(rule.key, value)) {
      throw new Error(`GameRules: ${rule.key} must be a ${rule.kind}, got ${String(value)}`);
    }
    store[rule.key] = value as GameRuleValue;
  }
  for (const key of Object.keys(rules)) {
    if (gameRuleDefinition(key) === undefined) {
      throw new Error(`GameRules: unknown rule key ${key}`);
    }
  }
  return store as GameRuleStore;
}
