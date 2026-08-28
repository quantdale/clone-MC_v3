import { describe, it, expect } from 'vitest';
import {
  createDefaultSettings,
  deserializeSettings,
  getSetting,
  isValidSettingValue,
  serializeSettings,
  setSetting,
  settingDefinition,
  settingDefinitions,
  type SettingsStore,
} from '../../src/simulation/SettingsFramework';

describe('definitions', () => {
  it('defines the 10 settings with kinds, ranges, and defaults', () => {
    expect(settingDefinitions()).toHaveLength(10);
    expect(settingDefinitions().map((d) => d.key)).toEqual([
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
    ]);
    expect(settingDefinition('renderDistance')).toEqual({
      key: 'renderDistance',
      kind: 'integer',
      defaultValue: 12,
      min: 2,
      max: 32,
    });
    expect(settingDefinition('sfxVolume')?.kind).toBe('float');
    expect(settingDefinition('sfxVolume')?.defaultValue).toBe(1);
    expect(settingDefinition('invertY')?.kind).toBe('boolean');
    expect(settingDefinition('nope')).toBeUndefined();
  });

  it('defaults every setting', () => {
    const store = createDefaultSettings();
    expect(getSetting(store, 'renderDistance')).toBe(12);
    expect(getSetting(store, 'fov')).toBe(70);
    expect(getSetting(store, 'brightness')).toBe(0.5);
    expect(getSetting(store, 'masterVolume')).toBe(1);
    expect(getSetting(store, 'mouseSensitivity')).toBe(0.5);
    expect(getSetting(store, 'invertY')).toBe(false);
    expect(getSetting(store, 'autoJump')).toBe(true);
    expect(getSetting(store, 'showCoordinates')).toBe(false);
  });
});

describe('validation', () => {
  it('accepts boundaries and rejects wrong kinds, ranges, and NaN', () => {
    expect(isValidSettingValue('renderDistance', 2)).toBe(true);
    expect(isValidSettingValue('renderDistance', 32)).toBe(true);
    expect(isValidSettingValue('renderDistance', 33)).toBe(false);
    expect(isValidSettingValue('renderDistance', 12.5)).toBe(false);
    expect(isValidSettingValue('renderDistance', NaN)).toBe(false);
    expect(isValidSettingValue('brightness', 0)).toBe(true);
    expect(isValidSettingValue('brightness', 1)).toBe(true);
    expect(isValidSettingValue('brightness', 0.5)).toBe(true);
    expect(isValidSettingValue('brightness', -0.1)).toBe(false);
    expect(isValidSettingValue('invertY', true)).toBe(true);
    expect(isValidSettingValue('invertY', 1)).toBe(false);
    expect(isValidSettingValue('nope', 1)).toBe(false);
  });
});

describe('set', () => {
  it('returns a new store on valid change and identity-no-ops otherwise', () => {
    const store = createDefaultSettings();
    const changed = setSetting(store, 'renderDistance', 20);
    expect(changed).not.toBe(store);
    expect(getSetting(changed, 'renderDistance')).toBe(20);
    expect(getSetting(store, 'renderDistance')).toBe(12);
    expect(setSetting(changed, 'renderDistance', 20)).toBe(changed);
    expect(setSetting(changed, 'renderDistance', 40)).toBe(changed);
    expect(setSetting(changed, 'renderDistance', 12.5)).toBe(changed);
    expect(setSetting(changed, 'invertY', true)).not.toBe(changed);
  });
});

describe('persistence', () => {
  it('round-trips stores', () => {
    const store: SettingsStore = setSetting(setSetting(createDefaultSettings(), 'fov', 90), 'autoJump', false);
    expect(deserializeSettings(serializeSettings(store))).toEqual(store);
  });

  it('rejects a non-object payload', () => {
    expect(() => deserializeSettings(null)).toThrow('SettingsFramework: expected an object');
    expect(() => deserializeSettings('x')).toThrow('SettingsFramework: expected an object');
  });

  it('rejects an unsupported version and a non-object settings', () => {
    expect(() => deserializeSettings({ version: 0, settings: {} })).toThrow(
      'SettingsFramework: unsupported version 0',
    );
    expect(() => deserializeSettings({ version: 1, settings: 'x' })).toThrow(
      'SettingsFramework: settings must be an object',
    );
  });

  it('rejects unknown setting keys', () => {
    expect(() => deserializeSettings({ version: 1, settings: { nope: 1 } })).toThrow(
      'SettingsFramework: unknown setting nope',
    );
  });

  it('rejects wrong-kind and out-of-range values with distinct messages', () => {
    expect(() => deserializeSettings({ version: 1, settings: { renderDistance: 12.5 } })).toThrow(
      'SettingsFramework: setting renderDistance must be an integer within [2, 32], got 12.5',
    );
    expect(() => deserializeSettings({ version: 1, settings: { renderDistance: 40 } })).toThrow(
      'SettingsFramework: setting renderDistance must be within [2, 32], got 40',
    );
    expect(() => deserializeSettings({ version: 1, settings: { invertY: 1 } })).toThrow(
      'SettingsFramework: setting invertY must be a boolean, got 1',
    );
  });

  it('defaults missing keys (forward compatibility)', () => {
    const restored = deserializeSettings({ version: 1, settings: { renderDistance: 20 } });
    expect(getSetting(restored, 'renderDistance')).toBe(20);
    expect(getSetting(restored, 'fov')).toBe(70);
    expect(getSetting(restored, 'invertY')).toBe(false);
  });
});
