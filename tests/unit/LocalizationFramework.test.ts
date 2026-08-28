import { describe, it, expect } from 'vitest';
import {
  addCatalog,
  createLocalizationCatalog,
  createLocalizationStore,
  formatPositional,
  formatText,
  getEntry,
  lookup,
  translate,
} from '../../src/data/LocalizationFramework';

describe('creation', () => {
  it('builds a catalog and reads entries', () => {
    const catalog = createLocalizationCatalog('en-US', { 'menu.play': 'Play', 'menu.quit': 'Quit' });
    expect(catalog.locale).toBe('en-US');
    expect(getEntry(catalog, 'menu.play')).toBe('Play');
    expect(getEntry(catalog, 'nope')).toBeUndefined();
  });

  it('builds an empty store', () => {
    expect(createLocalizationStore()).toEqual({ catalogs: [] });
  });
});

describe('rejections', () => {
  it('rejects invalid locales', () => {
    for (const locale of ['EN', '', 'e', 'en_US', 'en-US-']) {
      expect(() => createLocalizationCatalog(locale, {})).toThrow(
        "Localization: locale '",
      );
    }
    expect(() => createLocalizationCatalog('zh-CN', {})).not.toThrow();
    expect(() => createLocalizationCatalog('en', {})).not.toThrow();
  });

  it('rejects empty keys and non-string values', () => {
    expect(() => createLocalizationCatalog('en', { '': 'x' })).toThrow(
      'Localization: key must be a non-empty string',
    );
    expect(() => createLocalizationCatalog('en', { a: 5 as unknown as string })).toThrow(
      'Localization: value for a must be a string',
    );
  });
});

describe('store fallback', () => {
  const en = createLocalizationCatalog('en', { 'menu.play': 'Play' });
  const de = createLocalizationCatalog('de', { 'menu.play': 'Spielen', 'menu.quit': 'Beenden' });

  it('returns the first catalog value in preference order', () => {
    const store = createLocalizationStore([de, en]);
    expect(lookup(store, 'menu.play')).toBe('Spielen');
    expect(lookup(store, 'menu.quit')).toBe('Beenden');
    expect(lookup(store, 'nope')).toBeNull();
  });

  it('appends catalogs and identity-no-ops for the same object', () => {
    const store = createLocalizationStore([de]);
    expect(addCatalog(store, de)).toBe(store);
    const extended = addCatalog(store, en);
    expect(extended.catalogs).toEqual([de, en]);
    expect(extended).not.toBe(store);
    expect(lookup(extended, 'menu.play')).toBe('Spielen'); // first wins still
  });
});

describe('formatting', () => {
  it('replaces record placeholders and keeps unknown names verbatim', () => {
    expect(formatText('Hello {name}!', { name: 'Alex' })).toBe('Hello Alex!');
    expect(formatText('Hello {name}!', {})).toBe('Hello {name}!');
    expect(formatText('Score {score}', { score: 5 })).toBe('Score 5');
  });

  it('replaces positional placeholders in order with escapes', () => {
    expect(formatPositional('%s blocks', ['5'])).toBe('5 blocks');
    expect(formatPositional('100%% sure', [])).toBe('100% sure');
    expect(formatPositional('%s and %s', ['a'])).toBe('a and %s');
    expect(formatPositional('%s %s', ['x', 'y'])).toBe('x y');
  });
});

describe('translate', () => {
  it('looks up and formats; null when missing', () => {
    const store = createLocalizationStore([
      createLocalizationCatalog('en', { greeting: 'Hello {name}' }),
    ]);
    expect(translate(store, 'greeting', { name: 'Alex' })).toBe('Hello Alex');
    expect(translate(store, 'greeting')).toBe('Hello {name}');
    expect(translate(store, 'missing')).toBeNull();
  });
});
