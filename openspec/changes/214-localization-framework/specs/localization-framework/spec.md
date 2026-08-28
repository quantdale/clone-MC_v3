# Spec: localization-framework

## Contract
This capability adds the pure localization model: validated per-locale catalogs, a preference-
ordered store with first-match fallback, `{name}` and positional `%s` parameter formatting, and a
composed translate — headless-safe.

## Definitions
- **Catalog**: `{ locale, entries }` — one locale's key -> string map.
- **Store**: `{ catalogs }` — preference order; the FIRST catalog holding a key wins.
- **Placeholders**: `{name}` (record params, unknown names verbatim) and `%s` (positional, in
  order; `%%` escapes a literal `%`; a `%s` with no remaining param stays verbatim).

## Invariants
- Pure and headless-safe: no locale detection, no mutation of inputs.
- Locales MUST match `^[a-z]{2,3}(-[A-Za-z]{2,4})*$`; keys MUST be non-empty strings; values
  MUST be strings.
- `lookup` MUST return the first catalog's value or null; `addCatalog` MUST append and
  identity-no-op for an already-present catalog object.
- Construction MUST reject the whole payload on any violation.

## Requirements

### Requirement: catalog creation
`createLocalizationCatalog(locale, entries)` MUST return a validated catalog.
`createLocalizationStore(catalogs?)` MUST validate every catalog.

#### Scenario: creation
- **GIVEN** `createLocalizationCatalog('en-US', { 'menu.play': 'Play', 'menu.quit': 'Quit' })`
- **THEN** the catalog holds the two entries; `getEntry(catalog, 'menu.play')` is 'Play';
  `getEntry(catalog, 'nope')` is undefined; an empty store validates

### Requirement: catalog rejections
Creation MUST throw a descriptive `Error` for an invalid locale, an empty/non-string key, and a
non-string value.

#### Scenario: rejections
- **GIVEN** locales `'EN'`, `''`, `'e'`, `'en_US'`, `'zh-CN'`; keys `''` and `1`; values `5`
- **THEN** the invalid locales throw mentioning `locale`; the invalid keys throw mentioning
  `must be a non-empty string`; the invalid value throws mentioning `must be a string`; `'zh-CN'`
  validates

### Requirement: store fallback
`addCatalog(store, catalog)` MUST append and identity-no-op for the same catalog object;
`lookup(store, key)` MUST return the FIRST catalog's value in preference order, or null.

#### Scenario: fallback
- **GIVEN** an en catalog with `menu.play`, a de catalog with `menu.play` and `menu.quit`, and a
  store of [de, en]
- **THEN** `lookup(store, 'menu.play')` is the de value; `lookup(store, 'menu.quit')` is the de
  value; `lookup(store, 'nope')` is null; `addCatalog(store, de)` returns the identical store;
  `addCatalog(store, en)` appends en and the lookup still returns the de value

### Requirement: formatting
`formatText(template, params)` MUST replace `{name}` placeholders (unknown names verbatim);
`formatPositional(template, params)` MUST replace `%s` in order, `%%` -> `%`, and leave a
param-less `%s` verbatim.

#### Scenario: formatting
- **GIVEN** `formatText('Hello {name}!', { name: 'Alex' })`, `formatText('Hello {name}!', {})`,
  `formatText('Score {score}', { score: 5 })`, `formatPositional('%s blocks', ['5'])`,
  `formatPositional('100%% sure', [])`, and `formatPositional('%s and %s', ['a'])`
- **THEN** the results are 'Hello Alex!', 'Hello {name}!', 'Score 5', '5 blocks', '100% sure',
  and 'a and %s'

### Requirement: translate
`translate(store, key, params?)` MUST look up then format; null when the key is missing.

#### Scenario: translate
- **GIVEN** a store with `greeting` = 'Hello {name}' and no `missing`
- **THEN** `translate(store, 'greeting', { name: 'Alex' })` is 'Hello Alex';
  `translate(store, 'greeting')` is 'Hello {name}'; `translate(store, 'missing')` is null

## Error and failure behavior
- Construction throws descriptively; lookup/format/translate are total.

## Performance and resource bounds
- Lookup O(catalogs); formatting O(template length).

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Security and integrity
- Pure functions; templates are never evaluated, only substituted.

## Observability
- Catalogs and stores are plain immutable objects; `lookup` exposes the fallback chain.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 creation | `tests/unit/LocalizationFramework.test.ts` › creation |
| REQ-2 rejections | › rejections |
| REQ-3 fallback | › store fallback |
| REQ-4 formatting | › formatting |
| REQ-5 translate | › translate |
