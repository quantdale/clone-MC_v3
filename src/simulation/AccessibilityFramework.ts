/**
 * Accessibility framework (208): the typed accessibility options (UI scale, subtitles, reduced
 * motion, screen effects, text background opacity, chat visibility, flash lighting), stored as a
 * standalone world-independent payload (like 206/207). Pure and headless-safe: no DOM access, no
 * mutation of inputs.
 *
 * Determinism rules:
 * - Options are fixed: 7 entries across boolean / float (inclusive [min, max]) / choice (ordered
 *   options list) kinds.
 * - `setOption` returns the IDENTICAL store for invalid values (wrong kind, out of range,
 *   unknown choice, non-finite) and same-value sets.
 * - `deserializeAccessibility` validates the whole payload: unknown options and invalid values
 *   throw descriptive errors; MISSING known options take their default (forward compatibility).
 */
export type AccessibilityKind = 'boolean' | 'float' | 'choice';

/** One typed accessibility option. */
export interface AccessibilityOption {
  readonly key: string;
  readonly kind: AccessibilityKind;
  readonly defaultValue: boolean | number | string;
  /** Inclusive range (float kind). */
  readonly min?: number;
  readonly max?: number;
  /** Allowed values (choice kind). */
  readonly options?: readonly string[];
}

const OPTIONS: readonly AccessibilityOption[] = [
  { key: 'uiScale', kind: 'choice', defaultValue: 'auto', options: ['auto', 'small', 'normal', 'large'] },
  { key: 'subtitles', kind: 'boolean', defaultValue: false },
  { key: 'reducedMotion', kind: 'boolean', defaultValue: false },
  { key: 'screenEffects', kind: 'choice', defaultValue: 'fade', options: ['fade', 'flash', 'none'] },
  { key: 'textBackgroundOpacity', kind: 'float', defaultValue: 0.5, min: 0, max: 1 },
  { key: 'chatVisibility', kind: 'choice', defaultValue: 'full', options: ['full', 'commands', 'hidden'] },
  { key: 'flashLighting', kind: 'boolean', defaultValue: true },
];

/** The fixed option table. */
export const ACCESSIBILITY_OPTIONS: readonly AccessibilityOption[] = OPTIONS;

export type AccessibilityKey =
  | 'uiScale'
  | 'subtitles'
  | 'reducedMotion'
  | 'screenEffects'
  | 'textBackgroundOpacity'
  | 'chatVisibility'
  | 'flashLighting';

export type AccessibilityValue = boolean | number | string;

/** Immutable accessibility store. */
export type AccessibilityStore = Readonly<Record<AccessibilityKey, AccessibilityValue>>;

/** One option by key, or `undefined`. */
export function accessibilityOption(key: string): AccessibilityOption | undefined {
  return OPTIONS.find((o) => o.key === key);
}

/** A fresh store with every option at its default. */
export function createDefaultAccessibility(): AccessibilityStore {
  const store: Record<string, AccessibilityValue> = {};
  for (const option of OPTIONS) {
    store[option.key] = option.defaultValue;
  }
  return store as AccessibilityStore;
}

/** Read one option's value. */
export function getOption(store: AccessibilityStore, key: AccessibilityKey): AccessibilityValue {
  return store[key];
}

/** Whether `value` is legal for `key`: right kind, finite/in-range, known choice. */
export function isValidAccessibilityValue(key: string, value: unknown): value is AccessibilityValue {
  const option = accessibilityOption(key);
  if (!option) return false;
  switch (option.kind) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'float':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= (option.min ?? -Infinity) &&
        value <= (option.max ?? Infinity)
      );
    case 'choice':
      return typeof value === 'string' && (option.options ?? []).includes(value);
  }
}

/**
 * Set one option. A legal value returns a NEW store; an illegal value (or unknown key) or the
 * same value returns the IDENTICAL store (identity no-op).
 */
export function setOption(
  store: AccessibilityStore,
  key: AccessibilityKey,
  value: AccessibilityValue,
): AccessibilityStore {
  if (!isValidAccessibilityValue(key, value)) return store;
  if (store[key] === value) return store;
  return { ...store, [key]: value };
}

/** Versioned serialized accessibility options. */
export interface SerializedAccessibility {
  version: 1;
  options: Record<string, AccessibilityValue>;
}

/** Serialize the store (identity-shaped; validation happens on deserialize). */
export function serializeAccessibility(store: AccessibilityStore): SerializedAccessibility {
  return { version: 1, options: { ...store } };
}

function expectation(option: AccessibilityOption): string {
  switch (option.kind) {
    case 'boolean':
      return 'a boolean';
    case 'float':
      return `within [${String(option.min)}, ${String(option.max)}]`;
    case 'choice':
      return `one of [${(option.options ?? []).join(', ')}]`;
  }
}

/**
 * Validate and restore a serialized store. The whole payload is validated first: object shape,
 * version, the options object, known keys only, and each present value's validity; MISSING known
 * options take their default. Any violation throws a descriptive `Error`; nothing else is
 * partially accepted.
 */
export function deserializeAccessibility(input: unknown): AccessibilityStore {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Accessibility: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== 1) {
    throw new Error(`Accessibility: unsupported version ${String(r.version)}`);
  }
  if (typeof r.options !== 'object' || r.options === null || Array.isArray(r.options)) {
    throw new Error('Accessibility: options must be an object');
  }
  const values = r.options as Record<string, unknown>;
  const store: Record<string, AccessibilityValue> = {};
  for (const option of OPTIONS) {
    const value = values[option.key];
    if (value === undefined) {
      store[option.key] = option.defaultValue;
      continue;
    }
    if (!isValidAccessibilityValue(option.key, value)) {
      throw new Error(
        `Accessibility: option ${option.key} must be ${expectation(option)}, got ${String(value)}`,
      );
    }
    store[option.key] = value;
  }
  for (const key of Object.keys(values)) {
    if (accessibilityOption(key) === undefined) {
      throw new Error(`Accessibility: unknown option ${key}`);
    }
  }
  for (const key of Object.keys(r)) {
    if (key !== 'version' && key !== 'options') {
      throw new Error(`Accessibility: unknown key ${key}`);
    }
  }
  return store as AccessibilityStore;
}
