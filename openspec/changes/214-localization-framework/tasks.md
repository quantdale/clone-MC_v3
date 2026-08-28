# Tasks: 214-localization-framework

## Implementation
- [x] `src/data/LocalizationFramework.ts`: `LocalizationCatalog` + `createLocalizationCatalog`
      (locale pattern, key/value validation) + `getEntry`.
- [x] `LocalizationStore` / `createLocalizationStore` / `addCatalog` (append, identity for the
      same catalog) / `lookup` (first-match fallback).
- [x] `formatText` (`{name}` record params, unknown verbatim) / `formatPositional` (`%s` order,
      `%%` escape, param-less verbatim).
- [x] `translate` (lookup + format; null when missing).

## Tests
- [x] `tests/unit/LocalizationFramework.test.ts`: creation + getEntry; empty store.
- [x] Rejections (locale pattern incl. en_US, keys, values).
- [x] Fallback (first-wins, null, addCatalog append/identity).
- [x] Formatting (record, numbers, unknown verbatim; positional order/escape/missing).
- [x] Translate (composed, no params, null).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2788/2788 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      215-block-item-content-expansion).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
