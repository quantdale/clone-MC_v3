# Proposal: 211-internal-resource-pack-format

## Problem
The game references assets ad hoc: no manifest organizes textures, models, sounds, and metadata
by namespace; no validation prevents malformed ids, paths, or duplicates; no lookup API exists.
212's data packs and the loading pipeline need a canonical asset model.

## Goals
- `src/data/ResourcePackManifest.ts` (NEW), pure and headless-safe:
  - **Model**: `ResourcePackManifest { formatVersion: 1, name, description, assets }` with
    `ResourceAsset { id: ResourceId, type, path, metadata? }`; types are
    `texture | model | sound | metadata`; ids are validated namespaced ids; paths are relative
    (no leading `/`, no `..` segments).
  - **Construction/validation**: `createResourcePackManifest(name, description, assets)` and
    `validateResourcePackManifest(input)` — validate-before-accept with descriptive throws:
    bad version, empty name/description, invalid asset ids, unknown types, malformed paths,
    metadata on non-metadata assets, and duplicate asset ids are all rejected wholesale.
  - **Organization**: `assetsByNamespace(manifest)` — assets grouped by namespace (registration
    order within each namespace); `assetsOfType(manifest, type)`; `assetById(manifest, id)`
    (string or `ResourceId`; undefined when missing); `assetPath(asset)` — the canonical pack
    path `assets/<namespace>/<type>/<path>`.

## Non-goals
- **No asset bytes/loading** (the loader resolves `assetPath`), **no pack-file parsing** (the
  model IS the format), **no change to 004-020 registries**, **no `Game.ts` edit**, **no
  save-format change**.

## Preconditions
- Change 210 (`touch-controls`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 004's `ResourceId` validation helpers (`parseResourceId`, `isValidResourceNamespace`,
  `isValidResourcePath`, `resourceIdToString`) — imported; no registry changes.

## Proposed change
1. `src/data/ResourcePackManifest.ts` (NEW): the manifest model, validation, organization
   queries, and the canonical asset path.

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Id/path validation drift**. Mitigation: every rejection class (bad id, bad type, bad path,
  metadata misuse, duplicates, bad version, empty fields) is pinned with exact messages.

## Rollback strategy
One new data file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: valid manifests (texture/model/sound/metadata assets); every rejection;
  grouping/order by namespace; lookup by string and ResourceId (incl. missing); type filtering;
  the canonical path; validate round-trip.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
