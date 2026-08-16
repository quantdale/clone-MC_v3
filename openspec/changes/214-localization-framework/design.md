# Design: 214-localization-framework

## Context/current state
- UI strings are hardcoded. 214 adds the pure localization model: catalogs, a fallback chain,
  and parameter formatting; 215's content expansion and every UI screen consume it.

## Target state
- `src/data/LocalizationFramework.ts` holding the catalog/store model, formatting, and
  `translate`.

## Invariants
- Pure and headless-safe: no locale detection, no mutation of inputs, no IO.
- Locales match `^[a-z]{2,3}(-[A-Za-z]{2,4})*$`; keys are non-empty strings; values are strings.
- `lookup` returns the FIRST catalog's value (preference order = fallback chain); null when
  missing.
- `addCatalog` appends and identity-no-ops when the exact catalog object is already present.
- `formatText`: `{name}` -> `params[name]`; unknown names stay verbatim.
- `formatPositional`: `%s` consumed in order; `%%` -> literal `%`; a `%s` without a remaining
  parameter stays verbatim.

## API and data model
```ts
// src/data/LocalizationFramework.ts (new)
export interface LocalizationCatalog {
  locale: string;
  entries: Readonly<Record<string, string>>;
}
export function createLocalizationCatalog(locale: string, entries: Record<string, string>): LocalizationCatalog;
export function getEntry(catalog: LocalizationCatalog, key: string): string | undefined;

export interface LocalizationStore { catalogs: readonly LocalizationCatalog[]; }
export function createLocalizationStore(catalogs?: readonly LocalizationCatalog[]): LocalizationStore;
export function addCatalog(store: LocalizationStore, catalog: LocalizationCatalog): LocalizationStore;
export function lookup(store: LocalizationStore, key: string): string | null;

export function formatText(template: string, params: Readonly<Record<string, string | number>>): string;
export function formatPositional(template: string, params: readonly (string | number)[]): string;
export function translate(store: LocalizationStore, key: string, params?: Readonly<Record<string, string | number>>): string | null;
```

## Control/data flow
1. The wiring builds catalogs and a store (preference order) at startup and on 213 reloads.
2. UI code calls `translate(store, 'menu.play', { count })`; the result renders directly.

## Detailed behavior
- `createLocalizationCatalog`: locale not matching the pattern ->
  `Localization: locale '<l>' must match ^[a-z]{2,3}(-[A-Za-z]{2,4})*$`; an empty or
  non-string key -> `Localization: key <k> must be a non-empty string`; a non-string value ->
  `Localization: value for <k> must be a string`.
- `createLocalizationStore`: validates each catalog via the catalog rules (same messages).
- `addCatalog`: `store.catalogs.includes(catalog)` -> identity; else append.
- `lookup`: first catalog (in order) whose `entries[key]` is defined; else null.
- `formatText`: split on `{...}` segments; `{name}` replaced when present, else verbatim.
- `formatPositional`: scan; `%%` -> `%`; `%s` -> next param (shift), none left -> verbatim.
- `translate`: `lookup` null -> null; else `formatText(value, params ?? {})`.

## Failure modes
- Catalog/store construction throws descriptively; nothing partially accepted.
- Lookup/format/translate are total.

## Compatibility/migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Lookup O(catalogs); formatting O(template length).

## Testing seams
- Tests drive the framework with hand-built catalogs and exact templates.

## Observability/debugging
- Catalogs and stores are plain immutable objects; `lookup` exposes the fallback chain.

## Affected files/symbols
- `src/data/LocalizationFramework.ts` (new).
- Tests: `tests/unit/LocalizationFramework.test.ts` (new). No other files.

## Rejected alternatives
- **Pluralization/ICU rules**: rejected — 214 pins keys + fallback + parameter formatting; ICU
  rules belong to a later polish change.

## Downstream dependencies
- 215 (`block-item-content-expansion`) localizes new content; every UI screen translates through
  this framework; 242's e2e switches locales.
