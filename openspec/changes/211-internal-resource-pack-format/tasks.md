# Tasks: 211-internal-resource-pack-format

## Implementation
- [x] `src/data/ResourcePackManifest.ts`: `AssetType` / `ResourceAsset` / `ResourcePackManifest`
      types.
- [x] `createResourcePackManifest` / `validateResourcePackManifest` (validate-before-accept:
      version, name/description, ids via 004's helpers, types, relative paths, metadata rules,
      duplicates, unknown keys; descriptive throws).
- [x] `assetById` (string or ResourceId), `assetsByNamespace` (order-preserving), `assetsOfType`.
- [x] `assetPath` (`assets/<namespace>/<type>/<path>`).

## Tests
- [x] `tests/unit/ResourcePackManifest.test.ts`: valid manifest construction + round-trip.
- [x] Every rejection class with exact messages.
- [x] Queries (string/ResourceId lookup, missing, namespace grouping order, type filter).
- [x] Canonical path.
- [x] Totality of lookups on empty manifests.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2763/2763 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      212-internal-data-pack-format).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
