# Tasks: 212-internal-data-pack-format

## Implementation
- [x] `src/data/DataPackManifest.ts`: `DataKind` / `DataPackEntry` / `DataPackManifest` types.
- [x] `createDataPackManifest` / `validateDataPackManifest` (validate-before-accept: version,
      name/description, ids via 004, kinds, relative paths, duplicate id+kind, unknown keys).
- [x] `entryById` / `entriesOfKind` / `entriesByKind` (empty groups for absent kinds) /
      `entryPath`.
- [x] `resolveEntries` (injected `(kind, id) => boolean`; missing entries in registration
      order; total).

## Tests
- [x] `tests/unit/DataPackManifest.test.ts`: construction across all five kinds + round-trip.
- [x] Every rejection class with exact messages.
- [x] Queries (id lookup, kind filter order, grouping incl. empty groups, canonical path).
- [x] Resolution (fully present, partial, missing order, empty manifest).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2772/2772 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 213-resource-reload).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
