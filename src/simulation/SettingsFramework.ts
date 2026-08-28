/**
 * Settings framework (206): the typed graphics/audio/control/gameplay settings model, stored
 * independently of world saves (the wiring persists the serialized payload under its own key).
 * Pure and headless-safe: no storage access, no mutation of inputs.
 *
 * Determinism rules:
 * - Definitions are fixed: 10 settings across 4 categories; integer/float kinds carry inclusive
 *   [min, max] ranges.
 * - `setSetting` returns the IDENTICAL store for invalid values (wrong kind, out of range,
 *   non-finite) and same-value sets.
 * - `deserializeSettings` validates the whole payload: unknown keys and invalid values throw
 *   descriptive errors; MISSING known keys take their default (forward compatibility when new
 *   settings are added).
 */
export type SettingsKind = 'boolean' | 'integer' | 'float';

/** One typed setting definition. */
export interface SettingsDefinition {
  readonly key: string;
  readonly kind: SettingsKind;
  readonly defaultValue: boolean | number;
  /** Inclusive range (integer/float kinds). */
  readonly min?: number;
  readonly max?: number;
}

const DEFINITIONS: readonly SettingsDefinition[] = [
  { key: 'renderDistance', kind: 'integer', defaultValue: 12, min: 2, max: 32 },
  { key: 'fov', kind: 'integer', defaultValue: 70, min: 30, max: 110 },
  { key: 'brightness', kind: 'float', defaultValue: 0.5, min: 0, max: 1 },
  { key: 'masterVolume', kind: 'float', defaultValue: 1, min: 0, max: 1 },
  { key: 'musicVolume', kind: 'float', defaultValue: 1, min: 0, max: 1 },
  { key: 'sfxVolume', kind: 'float', defaultValue: 1, min: 0, max: 1 },
  { key: 'mouseSensitivity', kind: 'float', defaultValue: 0.5, min: 0.1, max: 2 },
  { key: 'invertY', kind: 'boolean', defaultValue: false },
  { key: 'autoJump', kind: 'boolean', defaultValue: true },
  { key: 'showCoordinates', kind: 'boolean', defaultValue: false },
];

export const SETTING_KEYS = [
  'renderDistance',
  'fov',
  'brightness',
  'masterVolume',
  'musicVolume',
  'sfxVolume',
  'mouseSensitivity',
  'invertY',
  'autoJump',
  'showCoordinates',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** Immutable settings store. */
export type SettingsStore = Readonly<Record<SettingKey, boolean | number>>;

/** All setting definitions. */
export function settingDefinitions(): readonly SettingsDefinition[] {
  return DEFINITIONS;
}

/** One definition by key, or `undefined`. */
export function settingDefinition(key: string): SettingsDefinition | undefined {
  return DEFINITIONS.find((d) => d.key === key);
}

/** A fresh store with every setting at its default. */
export function createDefaultSettings(): SettingsStore {
  const store: Record<string, boolean | number> = {};
  for (const def of DEFINITIONS) {
    store[def.key] = def.defaultValue;
  }
  return store as SettingsStore;
}

/** Read one setting's value. */
export function getSetting(store: SettingsStore, key: SettingKey): boolean | number {
  return store[key];
}

/** Whether `value` is legal for `key`: right kind, finite, within the inclusive range. */
export function isValidSettingValue(key: string, value: unknown): value is boolean | number {
  const def = settingDefinition(key);
  if (!def) return false;
  switch (def.kind) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return (
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= (def.min ?? -Infinity) &&
        value <= (def.max ?? Infinity)
      );
    case 'float':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= (def.min ?? -Infinity) &&
        value <= (def.max ?? Infinity)
      );
  }
}

/**
 * Set one setting. A legal value returns a NEW store; an illegal value (or unknown key) or the
 * same value returns the IDENTICAL store (identity no-op).
 */
export function setSetting(
  store: SettingsStore,
  key: SettingKey,
  value: boolean | number,
): SettingsStore {
  if (!isValidSettingValue(key, value)) return store;
  if (store[key] === value) return store;
  return { ...store, [key]: value };
}

/** Versioned serialized settings. */
export interface SerializedSettings {
  version: 1;
  settings: Record<string, boolean | number>;
}

/** Serialize the store (identity-shaped; validation happens on deserialize). */
export function serializeSettings(store: SettingsStore): SerializedSettings {
  return { version: 1, settings: { ...store } };
}

function rejectionMessage(def: SettingsDefinition, value: unknown): string {
  if (def.kind === 'boolean') {
    return `SettingsFramework: setting ${def.key} must be a boolean, got ${String(value)}`;
  }
  const range = `within [${String(def.min)}, ${String(def.max)}]`;
  if (typeof value === 'number') {
    if (def.kind === 'integer' && !Number.isSafeInteger(value)) {
      return `SettingsFramework: setting ${def.key} must be an integer ${range}, got ${String(value)}`;
    }
    if (def.kind === 'float' && !Number.isFinite(value)) {
      return `SettingsFramework: setting ${def.key} must be a finite number ${range}, got ${String(value)}`;
    }
    return `SettingsFramework: setting ${def.key} must be ${range}, got ${String(value)}`;
  }
  const kindWord = def.kind === 'integer' ? 'integer' : 'finite number';
  return `SettingsFramework: setting ${def.key} must be a ${kindWord} ${range}, got ${String(value)}`;
}

/**
 * Validate and restore a serialized store. The whole payload is validated first: object shape,
 * version, the settings object, known keys only, and each present value's validity; MISSING
 * known keys take their default. Any violation throws a descriptive `Error`; nothing else is
 * partially accepted.
 */
export function deserializeSettings(input: unknown): SettingsStore {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('SettingsFramework: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== 1) {
    throw new Error(`SettingsFramework: unsupported version ${String(r.version)}`);
  }
  if (typeof r.settings !== 'object' || r.settings === null || Array.isArray(r.settings)) {
    throw new Error('SettingsFramework: settings must be an object');
  }
  const values = r.settings as Record<string, unknown>;
  const store: Record<string, boolean | number> = {};
  for (const def of DEFINITIONS) {
    const value = values[def.key];
    if (value === undefined) {
      store[def.key] = def.defaultValue;
      continue;
    }
    if (!isValidSettingValue(def.key, value)) {
      throw new Error(rejectionMessage(def, value));
    }
    store[def.key] = value;
  }
  for (const key of Object.keys(values)) {
    if (settingDefinition(key) === undefined) {
      throw new Error(`SettingsFramework: unknown setting ${key}`);
    }
  }
  for (const key of Object.keys(r)) {
    if (key !== 'version' && key !== 'settings') {
      throw new Error(`SettingsFramework: unknown key ${key}`);
    }
  }
  return store as SettingsStore;
}
