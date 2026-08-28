# Proposal: 214-localization-framework

## Problem
The UI strings are hardcoded English: no translation keys, no catalogs, no fallback chain, no
parameter formatting. 215's content expansion and every UI screen need a localization model.

## Goals
- `src/data/LocalizationFramework.ts` (NEW), pure and headless-safe:
  - **Catalog**: `LocalizationCatalog { locale, entries }`; `createLocalizationCatalog(locale,
    entries)` validates — locale matches `^[a-z]{2,3}(-[A-Za-z]{2,4})*$` (e.g. `en`, `en-US`,
    `zh-CN`), keys non-empty, values strings; `getEntry(catalog, key)`.
  - **Store + fallback**: `LocalizationStore { catalogs }` (preference order);
    `createLocalizationStore(catalogs?)`; `addCatalog(store, catalog)` (appends; identity when
    the catalog is already present); `lookup(store, key)` — the FIRST catalog containing the key
    wins (fallback chain), else `null`.
  - **Formatted parameters**: `formatText(template, params)` — `{name}` placeholders replaced
    from a record (unknown keys stay verbatim); `formatPositional(template, params)` — `%s`
    consumed in order and `%%` -> literal `%` (a `%s` with no remaining parameter stays verbatim).
  - **Translate**: `translate(store, key, params?)` — lookup then format; `null` when missing.

## Non-goals
- **No locale detection/selection UI** (the wiring picks the locale), **no catalog file loading**
  (213's reload transaction covers it), **no pluralization rules**, **no change to existing
  modules**, **no `Game.ts` edit**, **no save-format change**.

## Preconditions
- Change 213 (`resource-reload`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library.

## Proposed change
1. `src/data/LocalizationFramework.ts` (NEW): the catalog, store with fallback, formatting, and
   translate.

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Formatting drift**. Mitigation: the exact placeholder rules (`{name}`, `%s` order, `%%`
  escape, verbatim leftovers) are pinned in tests.

## Rollback strategy
One new data file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: catalog creation + every rejection; getEntry; store creation + addCatalog
  (append, identity for the same catalog object); lookup (first-wins fallback, null when
  missing); formatText (substitution, numbers, unknown keys verbatim); formatPositional (order,
  escape, missing param verbatim); translate (composed, null).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
