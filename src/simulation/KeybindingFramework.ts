/**
 * Keybinding framework (207): conflict-aware remappable controls with standalone persistence
 * (the wiring stores the payload independently of world saves, like 206's settings). Pure and
 * headless-safe: no input capture, no mutation of inputs.
 *
 * Determinism rules:
 * - The action table is fixed (23 actions, each with a default `KeyboardEvent.code`-style key).
 * - `remapKey` NEVER throws and NEVER unbinds: invalid keys return a structured rejection;
 *   same-action rebinds are identity no-ops; cross-action rebinds SWAP (the displaced action
 *   receives the remapped action's previous key, vanilla-style), reported via `displaced`.
 * - `actionForKey` returns the FIRST action bound to a key (binding order), or null.
 * - Deserialization validates the whole payload: unknown actions and invalid (empty) keys throw
 *   descriptive errors; MISSING actions take their default (forward compatibility).
 */
export const KEYBINDING_ACTIONS = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'sneak',
  'sprint',
  'attack',
  'use',
  'pickBlock',
  'inventory',
  'drop',
  'swapOffhand',
  'chat',
  'hotbar1',
  'hotbar2',
  'hotbar3',
  'hotbar4',
  'hotbar5',
  'hotbar6',
  'hotbar7',
  'hotbar8',
  'hotbar9',
] as const;

export type KeybindingAction = (typeof KEYBINDING_ACTIONS)[number];

const DEFAULTS: Readonly<Record<KeybindingAction, string>> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sneak: 'ShiftLeft',
  sprint: 'ControlLeft',
  attack: 'MouseLeft',
  use: 'MouseRight',
  pickBlock: 'MouseMiddle',
  inventory: 'KeyE',
  drop: 'KeyQ',
  swapOffhand: 'KeyF',
  chat: 'KeyT',
  hotbar1: 'Digit1',
  hotbar2: 'Digit2',
  hotbar3: 'Digit3',
  hotbar4: 'Digit4',
  hotbar5: 'Digit5',
  hotbar6: 'Digit6',
  hotbar7: 'Digit7',
  hotbar8: 'Digit8',
  hotbar9: 'Digit9',
};

/** The default key for an action. */
export function defaultKey(action: KeybindingAction): string {
  return DEFAULTS[action];
}

/** Immutable keybinding state: every action bound to exactly one key. */
export interface KeybindingState {
  readonly bindings: Readonly<Record<KeybindingAction, string>>;
}

/** A fresh state with every default binding. */
export function createDefaultKeybindings(): KeybindingState {
  return { bindings: { ...DEFAULTS } };
}

/** The key bound to an action. */
export function keyFor(state: KeybindingState, action: KeybindingAction): string {
  return state.bindings[action];
}

/** The FIRST action bound to a key (binding order), or `null`. */
export function actionForKey(state: KeybindingState, key: string): KeybindingAction | null {
  for (const action of KEYBINDING_ACTIONS) {
    if (state.bindings[action] === key) return action;
  }
  return null;
}

export type RemapResult =
  | { ok: true; state: KeybindingState; displaced: KeybindingAction | null }
  | { ok: false; reason: 'invalid_key' };

/**
 * Remap an action to a key with conflict awareness: empty/whitespace keys are rejected
 * structurally; same-action rebinds identity no-op; a free key rebinds; a key held by another
 * action SWAPS (the displaced action receives the remapped action's previous key). Every action
 * stays bound.
 */
export function remapKey(state: KeybindingState, action: KeybindingAction, key: string): RemapResult {
  if (key.trim().length === 0) return { ok: false, reason: 'invalid_key' };
  if (keyFor(state, action) === key) return { ok: true, state, displaced: null };
  const holder = actionForKey(state, key);
  if (holder === null) {
    return {
      ok: true,
      state: { bindings: { ...state.bindings, [action]: key } },
      displaced: null,
    };
  }
  const previous = keyFor(state, action);
  return {
    ok: true,
    state: { bindings: { ...state.bindings, [action]: key, [holder]: previous } },
    displaced: holder,
  };
}

/** Restore an action's default key (identity no-op when already default). */
export function resetKey(state: KeybindingState, action: KeybindingAction): KeybindingState {
  if (keyFor(state, action) === DEFAULTS[action]) return state;
  return { bindings: { ...state.bindings, [action]: DEFAULTS[action] } };
}

/** Restore every default binding (identity no-op when already default). */
export function resetAll(state: KeybindingState): KeybindingState {
  for (const action of KEYBINDING_ACTIONS) {
    if (state.bindings[action] !== DEFAULTS[action]) {
      return { bindings: { ...DEFAULTS } };
    }
  }
  return state;
}

/** Versioned serialized keybindings. */
export interface SerializedKeybindings {
  version: 1;
  bindings: Record<string, string>;
}

/** Serialize the state (identity-shaped; validation happens on deserialize). */
export function serializeKeybindings(state: KeybindingState): SerializedKeybindings {
  return { version: 1, bindings: { ...state.bindings } };
}

function isAction(value: unknown): value is KeybindingAction {
  return typeof value === 'string' && (KEYBINDING_ACTIONS as readonly string[]).includes(value);
}

/**
 * Validate and restore a serialized state. The whole payload is validated first: object shape,
 * version, the bindings object, known actions only, and non-empty keys; MISSING actions take
 * their default. Any violation throws a descriptive `Error`; nothing else is partially accepted.
 */
export function deserializeKeybindings(input: unknown): KeybindingState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Keybindings: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== 1) {
    throw new Error(`Keybindings: unsupported version ${String(r.version)}`);
  }
  if (typeof r.bindings !== 'object' || r.bindings === null || Array.isArray(r.bindings)) {
    throw new Error('Keybindings: bindings must be an object');
  }
  const values = r.bindings as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const action of KEYBINDING_ACTIONS) {
    const key = values[action];
    if (key === undefined) {
      out[action] = DEFAULTS[action];
      continue;
    }
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new Error(`Keybindings: binding ${action} must be a non-empty string`);
    }
    out[action] = key;
  }
  for (const key of Object.keys(values)) {
    if (!isAction(key)) {
      throw new Error(`Keybindings: unknown action ${key}`);
    }
  }
  for (const key of Object.keys(r)) {
    if (key !== 'version' && key !== 'bindings') {
      throw new Error(`Keybindings: unknown key ${key}`);
    }
  }
  return { bindings: out as Record<KeybindingAction, string> };
}
