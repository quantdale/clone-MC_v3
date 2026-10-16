import { describe, it, expect } from 'vitest';
import {
  ACCESSIBILITY_OPTIONS,
  accessibilityOption,
  createDefaultAccessibility,
  deserializeAccessibility,
  getOption,
  isValidAccessibilityValue,
  serializeAccessibility,
  setOption,
} from '../../src/simulation/AccessibilityFramework';

describe('table', () => {
  it('defines the 7 options with kinds, choices, and defaults', () => {
    expect(ACCESSIBILITY_OPTIONS).toHaveLength(7);
    expect(ACCESSIBILITY_OPTIONS.map((o) => o.key)).toEqual([
      'uiScale',
      'subtitles',
      'reducedMotion',
      'screenEffects',
      'textBackgroundOpacity',
      'chatVisibility',
      'flashLighting',
    ]);
    expect(accessibilityOption('uiScale')).toEqual({
      key: 'uiScale',
      kind: 'choice',
      defaultValue: 'auto',
      options: ['auto', 'small', 'normal', 'large'],
    });
    expect(accessibilityOption('screenEffects')?.kind).toBe('choice');
    expect(accessibilityOption('subtitles')?.kind).toBe('boolean');
    expect(accessibilityOption('textBackgroundOpacity')).toMatchObject({
      kind: 'float',
      defaultValue: 0.5,
      min: 0,
      max: 1,
    });
    expect(accessibilityOption('chatVisibility')?.options).toEqual(['full', 'commands', 'hidden']);
    expect(accessibilityOption('flashLighting')?.defaultValue).toBe(true);
    expect(accessibilityOption('nope')).toBeUndefined();
  });

  it('defaults every option', () => {
    const store = createDefaultAccessibility();
    expect(getOption(store, 'uiScale')).toBe('auto');
    expect(getOption(store, 'subtitles')).toBe(false);
    expect(getOption(store, 'reducedMotion')).toBe(false);
    expect(getOption(store, 'screenEffects')).toBe('fade');
    expect(getOption(store, 'textBackgroundOpacity')).toBe(0.5);
    expect(getOption(store, 'chatVisibility')).toBe('full');
    expect(getOption(store, 'flashLighting')).toBe(true);
  });
});

describe('validation', () => {
  it('accepts valid choices, floats, and booleans; rejects the rest', () => {
    expect(isValidAccessibilityValue('uiScale', 'auto')).toBe(true);
    expect(isValidAccessibilityValue('uiScale', 'large')).toBe(true);
    expect(isValidAccessibilityValue('uiScale', 'huge')).toBe(false);
    expect(isValidAccessibilityValue('screenEffects', 'none')).toBe(true);
    expect(isValidAccessibilityValue('textBackgroundOpacity', 0)).toBe(true);
    expect(isValidAccessibilityValue('textBackgroundOpacity', 1)).toBe(true);
    expect(isValidAccessibilityValue('textBackgroundOpacity', 0.5)).toBe(true);
    expect(isValidAccessibilityValue('textBackgroundOpacity', -0.1)).toBe(false);
    expect(isValidAccessibilityValue('textBackgroundOpacity', NaN)).toBe(false);
    expect(isValidAccessibilityValue('subtitles', true)).toBe(true);
    expect(isValidAccessibilityValue('subtitles', 1)).toBe(false);
    expect(isValidAccessibilityValue('nope', true)).toBe(false);
  });
});

describe('set', () => {
  it('returns a new store on valid change and identity-no-ops otherwise', () => {
    const store = createDefaultAccessibility();
    const changed = setOption(store, 'uiScale', 'large');
    expect(changed).not.toBe(store);
    expect(getOption(changed, 'uiScale')).toBe('large');
    expect(getOption(store, 'uiScale')).toBe('auto');
    expect(setOption(changed, 'uiScale', 'large')).toBe(changed);
    expect(setOption(changed, 'uiScale', 'huge')).toBe(changed);
    expect(setOption(changed, 'subtitles', 1)).toBe(changed);
    expect(setOption(changed, 'reducedMotion', true)).not.toBe(changed);
  });
});

describe('persistence', () => {
  it('round-trips stores', () => {
    const store = setOption(setOption(createDefaultAccessibility(), 'uiScale', 'large'), 'subtitles', true);
    expect(deserializeAccessibility(serializeAccessibility(store))).toEqual(store);
  });

  it('rejects a non-object payload', () => {
    expect(() => deserializeAccessibility(null)).toThrow('Accessibility: expected an object');
    expect(() => deserializeAccessibility('x')).toThrow('Accessibility: expected an object');
  });

  it('rejects an unsupported version and a non-object options', () => {
    expect(() => deserializeAccessibility({ version: 0, options: {} })).toThrow(
      'Accessibility: unsupported version 0',
    );
    expect(() => deserializeAccessibility({ version: 1, options: 'x' })).toThrow(
      'Accessibility: options must be an object',
    );
  });

  it('rejects unknown options and invalid values', () => {
    expect(() => deserializeAccessibility({ version: 1, options: { nope: true } })).toThrow(
      'Accessibility: unknown option nope',
    );
    expect(() => deserializeAccessibility({ version: 1, options: { uiScale: 'huge' } })).toThrow(
      "Accessibility: option uiScale must be one of [auto, small, normal, large], got huge",
    );
    expect(() =>
      deserializeAccessibility({ version: 1, options: { textBackgroundOpacity: 1.5 } }),
    ).toThrow('Accessibility: option textBackgroundOpacity must be within [0, 1], got 1.5');
    expect(() => deserializeAccessibility({ version: 1, options: { subtitles: 1 } })).toThrow(
      'Accessibility: option subtitles must be a boolean, got 1',
    );
  });

  it('rejects unknown top-level keys', () => {
    expect(() =>
      deserializeAccessibility({ version: 1, options: { uiScale: 'large' }, extra: true }),
    ).toThrow('Accessibility: unknown key extra');
  });

  it('defaults missing options (forward compatibility)', () => {
    const restored = deserializeAccessibility({ version: 1, options: { uiScale: 'large' } });
    expect(getOption(restored, 'uiScale')).toBe('large');
    expect(getOption(restored, 'subtitles')).toBe(false);
    expect(getOption(restored, 'flashLighting')).toBe(true);
  });
});
