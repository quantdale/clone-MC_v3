import { describe, it, expect } from 'vitest';
import {
  KEYBINDING_ACTIONS,
  actionForKey,
  createDefaultKeybindings,
  defaultKey,
  deserializeKeybindings,
  keyFor,
  remapKey,
  resetAll,
  resetKey,
  serializeKeybindings,
} from '../../src/simulation/KeybindingFramework';

describe('table', () => {
  it('defines the 23 actions in order', () => {
    expect(KEYBINDING_ACTIONS).toHaveLength(23);
    expect(KEYBINDING_ACTIONS.slice(0, 7)).toEqual([
      'forward',
      'back',
      'left',
      'right',
      'jump',
      'sneak',
      'sprint',
    ]);
    expect(KEYBINDING_ACTIONS.slice(14)).toEqual([
      'hotbar1',
      'hotbar2',
      'hotbar3',
      'hotbar4',
      'hotbar5',
      'hotbar6',
      'hotbar7',
      'hotbar8',
      'hotbar9',
    ]);
    expect(defaultKey('forward')).toBe('KeyW');
    expect(defaultKey('hotbar1')).toBe('Digit1');
    expect(defaultKey('attack')).toBe('MouseLeft');
  });

  it('binds every default in the default state', () => {
    const state = createDefaultKeybindings();
    for (const action of KEYBINDING_ACTIONS) {
      expect(keyFor(state, action)).toBe(defaultKey(action));
    }
  });
});

describe('queries', () => {
  it('maps actions to keys and keys to the first action', () => {
    const state = createDefaultKeybindings();
    expect(keyFor(state, 'forward')).toBe('KeyW');
    expect(actionForKey(state, 'KeyW')).toBe('forward');
    expect(actionForKey(state, 'KeyZ')).toBeNull();
  });
});

describe('remap', () => {
  it('rejects invalid keys structurally', () => {
    const state = createDefaultKeybindings();
    expect(remapKey(state, 'forward', '')).toEqual({ ok: false, reason: 'invalid_key' });
    expect(remapKey(state, 'forward', '   ')).toEqual({ ok: false, reason: 'invalid_key' });
  });

  it('identity-no-ops on a same-action rebind', () => {
    const state = createDefaultKeybindings();
    const result = remapKey(state, 'forward', 'KeyW');
    if (!result.ok) throw new Error('unreachable');
    expect(result.displaced).toBeNull();
    expect(result.state).toBe(state);
  });

  it('rebinds a free key without displacing', () => {
    const state = createDefaultKeybindings();
    const result = remapKey(state, 'forward', 'KeyZ');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.displaced).toBeNull();
    expect(keyFor(result.state, 'forward')).toBe('KeyZ');
    expect(keyFor(result.state, 'back')).toBe('KeyS');
  });

  it('swaps keys on a cross-action rebind and reports the displaced action', () => {
    const state = createDefaultKeybindings();
    const result = remapKey(state, 'jump', 'KeyW');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.displaced).toBe('forward');
    expect(keyFor(result.state, 'jump')).toBe('KeyW');
    expect(keyFor(result.state, 'forward')).toBe('Space');
  });

  it('keeps every action bound after any remap', () => {
    const state = createDefaultKeybindings();
    const result = remapKey(state, 'hotbar9', 'Digit1');
    if (!result.ok) throw new Error('unreachable');
    const keys = new Set(KEYBINDING_ACTIONS.map((a) => keyFor(result.state, a)));
    expect(keys.size).toBe(23); // no duplicates after the swap
  });
});

describe('resets', () => {
  it('resets one action (identity when already default)', () => {
    const state = createDefaultKeybindings();
    const remapped = remapKey(state, 'forward', 'KeyZ');
    if (!remapped.ok) throw new Error('unreachable');
    expect(keyFor(resetKey(remapped.state, 'forward'), 'forward')).toBe('KeyW');
    expect(resetKey(state, 'forward')).toBe(state);
  });

  it('resets everything (identity when already default)', () => {
    const state = createDefaultKeybindings();
    const remapped = remapKey(state, 'forward', 'KeyZ');
    if (!remapped.ok) throw new Error('unreachable');
    expect(resetAll(remapped.state)).toEqual(state);
    expect(resetAll(state)).toBe(state);
  });
});

describe('persistence', () => {
  it('round-trips states', () => {
    const state = createDefaultKeybindings();
    const remapped = remapKey(state, 'forward', 'KeyZ');
    if (!remapped.ok) throw new Error('unreachable');
    expect(deserializeKeybindings(serializeKeybindings(remapped.state))).toEqual(remapped.state);
  });

  it('rejects a non-object payload', () => {
    expect(() => deserializeKeybindings(null)).toThrow('Keybindings: expected an object');
    expect(() => deserializeKeybindings('x')).toThrow('Keybindings: expected an object');
  });

  it('rejects an unsupported version and non-object bindings', () => {
    expect(() => deserializeKeybindings({ version: 0, bindings: {} })).toThrow(
      'Keybindings: unsupported version 0',
    );
    expect(() => deserializeKeybindings({ version: 1, bindings: 'x' })).toThrow(
      'Keybindings: bindings must be an object',
    );
  });

  it('rejects unknown actions and invalid keys', () => {
    expect(() => deserializeKeybindings({ version: 1, bindings: { nope: 'KeyW' } })).toThrow(
      'Keybindings: unknown action nope',
    );
    expect(() => deserializeKeybindings({ version: 1, bindings: { forward: '' } })).toThrow(
      'Keybindings: binding forward must be a non-empty string',
    );
  });

  it('rejects unknown top-level keys', () => {
    expect(() =>
      deserializeKeybindings({ version: 1, bindings: { forward: 'KeyZ' }, extra: true }),
    ).toThrow('Keybindings: unknown key extra');
  });

  it('defaults missing actions (forward compatibility)', () => {
    const restored = deserializeKeybindings({ version: 1, bindings: { forward: 'KeyZ' } });
    expect(keyFor(restored, 'forward')).toBe('KeyZ');
    expect(keyFor(restored, 'back')).toBe('KeyS');
    expect(keyFor(restored, 'hotbar1')).toBe('Digit1');
  });
});
