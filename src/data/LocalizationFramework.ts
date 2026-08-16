/**
 * Localization framework (214): the pure localization model — validated per-locale catalogs, a
 * preference-ordered store with first-match fallback, `{name}` and positional `%s` parameter
 * formatting, and a composed translate. Headless-safe: no locale detection, no mutation of
 * inputs, no IO.
 *
 * Determinism rules:
 * - Locales match `^[a-z]{2,3}(-[A-Za-z]{2,4})*$`; keys are non-empty strings; values strings.
 * - `lookup` returns the FIRST catalog's value (preference order); null when missing.
 * - `addCatalog` appends and identity-no-ops for an already-present catalog object.
 * - `formatText`: `{name}` -> params[name], unknown names stay verbatim.
 * - `formatPositional`: `%s` consumed in order, `%%` -> literal `%`, a param-less `%s` stays
 *   verbatim.
 */
const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Za-z]{2,4})*$/;

/** One locale's key -> string map. */
export interface LocalizationCatalog {
  readonly locale: string;
  readonly entries: Readonly<Record<string, string>>;
}

/** Build a validated catalog. */
export function createLocalizationCatalog(locale: string, entries: Record<string, string>): LocalizationCatalog {
  if (!LOCALE_PATTERN.test(locale)) {
    throw new Error(`Localization: locale '${locale}' must match ^[a-z]{2,3}(-[A-Za-z]{2,4})*$`);
  }
  for (const key of Object.keys(entries)) {
    if (key.length === 0) {
      throw new Error('Localization: key must be a non-empty string');
    }
    if (typeof entries[key] !== 'string') {
      throw new Error(`Localization: value for ${key} must be a string`);
    }
  }
  return { locale, entries: { ...entries } };
}

/** One entry, or undefined. */
export function getEntry(catalog: LocalizationCatalog, key: string): string | undefined {
  return catalog.entries[key];
}

/** The preference-ordered catalog chain (fallback). */
export interface LocalizationStore {
  readonly catalogs: readonly LocalizationCatalog[];
}

/** Build a store over validated catalogs (empty by default). */
export function createLocalizationStore(catalogs?: readonly LocalizationCatalog[]): LocalizationStore {
  if (catalogs === undefined) return { catalogs: [] };
  // Re-validate each catalog's shape defensively.
  for (const catalog of catalogs) {
    createLocalizationCatalog(catalog.locale, { ...catalog.entries });
  }
  return { catalogs: [...catalogs] };
}

/** Append a catalog; identity no-op when the exact catalog object is already present. */
export function addCatalog(store: LocalizationStore, catalog: LocalizationCatalog): LocalizationStore {
  if (store.catalogs.includes(catalog)) return store;
  return { catalogs: [...store.catalogs, catalog] };
}

/** The FIRST catalog's value for the key (preference order), or null. */
export function lookup(store: LocalizationStore, key: string): string | null {
  for (const catalog of store.catalogs) {
    const value = catalog.entries[key];
    if (value !== undefined) return value;
  }
  return null;
}

/** Replace `{name}` placeholders from a record; unknown names stay verbatim. */
export function formatText(
  template: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{([^{}]+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Replace `%s` in order; `%%` -> literal `%`; a param-less `%s` stays verbatim. */
export function formatPositional(template: string, params: readonly (string | number)[]): string {
  let index = 0;
  let out = '';
  for (let i = 0; i < template.length; i += 1) {
    const ch = template[i];
    if (ch !== '%') {
      out += ch;
      continue;
    }
    const next = template[i + 1];
    if (next === '%') {
      out += '%';
      i += 1;
    } else if (next === 's') {
      const param = params[index];
      if (param === undefined) {
        out += '%s';
      } else {
        out += String(param);
        index += 1;
      }
      i += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Look up a key and format it; null when the key is missing. */
export function translate(
  store: LocalizationStore,
  key: string,
  params?: Readonly<Record<string, string | number>>,
): string | null {
  const value = lookup(store, key);
  if (value === null) return null;
  return params === undefined ? value : formatText(value, params);
}
