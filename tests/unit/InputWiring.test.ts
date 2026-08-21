import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../src/config';
import {
  applyMouseLook,
  gamepadFrame,
  keyboardActions,
  loadWithFallback,
} from '../../src/simulation/InputWiring';
import {
  createDefaultKeybindings,
  deserializeKeybindings,
  remapKey,
  type KeybindingState,
} from '../../src/simulation/KeybindingFramework';
import {
  createDefaultSettings,
  deserializeSettings,
  setSetting,
  type SettingsStore,
} from '../../src/simulation/SettingsFramework';

/** Settings with only the given control overrides applied to the defaults. */
function settingsWith(overrides: Partial<Record<'mouseSensitivity' | 'invertY', number | boolean>>): SettingsStore {
  let store = createDefaultSettings();
  for (const [key, value] of Object.entries(overrides)) {
    store = setSetting(store, key as 'mouseSensitivity' | 'invertY', value as boolean | number);
  }
  return store;
}

describe('keyboardActions', () => {
  it('maps default bindings (KeyW→forward, Space→jump, Digit1..9→hotbar1..9)', () => {
    const bindings = createDefaultKeybindings();
    expect(keyboardActions(['KeyW'], bindings)).toEqual(['forward']);
    expect(keyboardActions(['KeyA', 'KeyS', 'KeyD', 'KeyW'], bindings)).toEqual([
      'forward',
      'back',
      'left',
      'right',
    ]);
    expect(keyboardActions(['Space'], bindings)).toEqual(['jump']);
    expect(keyboardActions(['Digit3'], bindings)).toEqual(['hotbar3']);
    expect(keyboardActions(['Digit1', 'Digit9'], bindings)).toEqual(['hotbar1', 'hotbar9']);
  });

  it('emits actions in KEYBINDING_ACTIONS order regardless of held-code order', () => {
    const bindings = createDefaultKeybindings();
    // back < jump < hotbar9 in KEYBINDING_ACTIONS order.
    expect(keyboardActions(['Digit9', 'Space', 'KeyS'], bindings)).toEqual([
      'back',
      'jump',
      'hotbar9',
    ]);
  });

  it('drops unbound keys and dedupes repeated codes', () => {
    const bindings = createDefaultKeybindings();
    expect(keyboardActions(['KeyZ'], bindings)).toEqual([]);
    expect(keyboardActions(['KeyW', 'KeyW'], bindings)).toEqual(['forward']);
    expect(keyboardActions([], bindings)).toEqual([]);
  });

  it('resolves a remapped binding and stops producing the old key', () => {
    const defaults = createDefaultKeybindings();
    const remapped = remapKey(defaults, 'forward', 'KeyU');
    expect(remapped.ok).toBe(true);
    const state: KeybindingState = remapped.ok ? remapped.state : defaults;
    expect(keyboardActions(['KeyU'], state)).toEqual(['forward']);
    expect(keyboardActions(['KeyW'], state)).toEqual([]);
  });
});

describe('applyMouseLook', () => {
  it('reproduces today’s exact scale at the default sensitivity (0.5)', () => {
    // Today's behavior: dyaw += movementX * CONFIG.mouseSensitivity.
    const look = applyMouseLook({ movementX: 10, movementY: -4 }, createDefaultSettings());
    expect(look.x).toBeCloseTo(10 * CONFIG.mouseSensitivity, 12);
    expect(look.y).toBeCloseTo(-4 * CONFIG.mouseSensitivity, 12);
  });

  it('scales linearly with the 206 mouseSensitivity setting', () => {
    const doubled = applyMouseLook(
      { movementX: 10, movementY: 0 },
      settingsWith({ mouseSensitivity: 1 }),
    );
    expect(doubled.x).toBeCloseTo(2 * 10 * CONFIG.mouseSensitivity, 12);

    const halved = applyMouseLook(
      { movementX: 10, movementY: 0 },
      settingsWith({ mouseSensitivity: 0.25 }),
    );
    expect(halved.x).toBeCloseTo(0.5 * 10 * CONFIG.mouseSensitivity, 12);
  });

  it('keeps screen convention for y when invertY is false (consumer negates for pitch)', () => {
    // With default settings the consumer's `dpitch -= look.y` reproduces
    // today's `dpitch -= movementY * CONFIG.mouseSensitivity` exactly.
    const look = applyMouseLook({ movementX: 0, movementY: 4 }, createDefaultSettings());
    expect(look.y).toBeCloseTo(4 * CONFIG.mouseSensitivity, 12);
  });

  it('flips the vertical component when invertY is true', () => {
    const normal = applyMouseLook({ movementX: 0, movementY: 4 }, createDefaultSettings());
    const inverted = applyMouseLook(
      { movementX: 0, movementY: 4 },
      settingsWith({ invertY: true }),
    );
    expect(inverted.y).toBeCloseTo(-normal.y, 12);
    // The consumer's `dpitch -= look.y` then yields the opposite pitch motion
    // of today's non-inverted behavior, as required by the spec scenario.
  });

  it('maps a zero delta to zero regardless of settings', () => {
    const look = applyMouseLook(
      { movementX: 0, movementY: 0 },
      settingsWith({ mouseSensitivity: 2, invertY: true }),
    );
    expect(look.x).toBe(0);
    // toBeCloseTo so a negated zero (-0) still passes.
    expect(look.y).toBeCloseTo(0, 12);
  });
});

describe('loadWithFallback', () => {
  it('passes a valid payload through unmodified', () => {
    const payload = {
      version: 1,
      settings: { mouseSensitivity: 1.5, invertY: true },
    };
    const result = loadWithFallback(deserializeSettings, createDefaultSettings, payload);
    expect(result.corrupted).toBe(false);
    expect(result.value.mouseSensitivity).toBe(1.5);
    expect(result.value.invertY).toBe(true);
    // Missing known keys take their framework defaults.
    expect(result.value.autoJump).toBe(true);
  });

  it('falls back to defaults with corrupted:true when deserialize throws', () => {
    const result = loadWithFallback(deserializeSettings, createDefaultSettings, {
      version: 1,
      settings: { nonsense: true },
    });
    expect(result.corrupted).toBe(true);
    expect(result.value).toEqual(createDefaultSettings());
  });

  it('falls back for non-object garbage too', () => {
    const result = loadWithFallback(deserializeKeybindings, createDefaultKeybindings, 'garbage');
    expect(result.corrupted).toBe(true);
    expect(result.value).toEqual(createDefaultKeybindings());
  });

  it('does not fall back for a valid keybinding payload', () => {
    const payload = { version: 1, bindings: { forward: 'KeyU' } };
    const result = loadWithFallback(deserializeKeybindings, createDefaultKeybindings, payload);
    expect(result.corrupted).toBe(false);
    expect(result.value.bindings.forward).toBe('KeyU');
  });
});

describe('gamepadFrame', () => {
  it('returns a disconnected zero frame for null or absent pads', () => {
    const expected = {
      connected: false,
      actions: [],
      move: { x: 0, y: 0 },
      look: { x: 0, y: 0 },
      uiNav: { up: false, down: false, left: false, right: false, confirm: false, cancel: false },
    };
    expect(gamepadFrame(null)).toEqual(expected);
    expect(gamepadFrame([])).toEqual(expected);
  });

  it('returns a disconnected zero frame when no pad reports connected', () => {
    const frame = gamepadFrame([
      {
        connected: false,
        buttons: [{ pressed: true }],
        axes: [0.8, -0.8, 0.5, 0],
      },
    ]);
    expect(frame.connected).toBe(false);
    expect(frame.actions).toEqual([]);
    expect(frame.move).toEqual({ x: 0, y: 0 });
    expect(frame.look).toEqual({ x: 0, y: 0 });
    expect(frame.uiNav).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
      confirm: false,
      cancel: false,
    });
  });

  it('picks the FIRST connected pad', () => {
    const frame = gamepadFrame([
      { connected: false, buttons: [], axes: [1, 1, 1, 1] },
      { connected: true, buttons: [], axes: [0, -1, 0, 0] },
      { connected: true, buttons: [], axes: [1, 1, 1, 1] },
    ]);
    expect(frame.connected).toBe(true);
    expect(frame.move).toEqual({ x: 0, y: -1 });
  });

  it('maps axes through movement/look vectors with deadzone', () => {
    const frame = gamepadFrame([
      {
        connected: true,
        buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
        // Left stick mostly-deflected X (inside deadzone → 0), full Y;
        // right stick { 0.5, 0 } per the spec scenario.
        axes: [0.1, -1, 0.5, 0],
      },
    ]);
    expect(frame.move).toEqual({ x: 0, y: -1 });
    expect(frame.look).toEqual({ x: 0.5, y: 0 });
  });

  it('maps pressed buttons to actions and uiNav', () => {
    const buttons = Array.from({ length: 17 }, (_, index) => ({
      pressed: index === 6 || index === 0 || index === 12,
    }));
    const frame = gamepadFrame([{ connected: true, buttons, axes: [0, 0, 0, 0] }]);
    expect(frame.actions).toContain('attack'); // LT = index 6
    expect(frame.actions).toContain('jump'); // A = index 0
    expect(frame.uiNav.up).toBe(true); // dpad up = index 12
    expect(frame.uiNav.confirm).toBe(true); // A = index 0
    expect(frame.uiNav.cancel).toBe(false);
  });
});
