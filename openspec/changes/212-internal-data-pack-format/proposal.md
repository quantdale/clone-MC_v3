# Proposal: 212-internal-data-pack-format

## Problem
211 organized assets, but gameplay DATA (recipes, loot tables, tags, worldgen, advancements)
has no canonical manifest: nothing lists which namespaced entries a data pack provides, and
nothing validates that they resolve through the existing registries. 213's atomic reload needs
this model.

## Goals
- `src/data/DataPackManifest.ts` (NEW), pure and headless-safe:
  - **Model**: `DataPackManifest { formatVersion: 1, name, description, entries }` with
    `DataPackEntry { id: ResourceId, kind, path }`; kinds are
    `recipe | loot_table | tag | worldgen | advancement`; ids are validated namespaced ids;
    paths are relative (no leading `/`, no `..` segments); a given id may appear once per kind.
  - **Construction/validation**: `createDataPackManifest` / `validateDataPackManifest` —
    validate-before-accept with descriptive throws (version, empty fields, invalid ids, unknown
    kinds, malformed paths, duplicate id+kind, unknown keys).
  - **Queries**: `entryById(manifest, id)` (first entry of any kind; undefined when missing);
    `entriesOfKind(manifest, kind)` (registration order); `entriesByKind(manifest)` (grouped);
    `entryPath(entry)` = `data/<namespace>/<kind>/<path>`.
  - **Registry resolution**: `resolveEntries(manifest, hasEntry)` — an INJECTED
    `(kind, id) => boolean` lookup (the wiring adapts 103's recipe registry, 005's tags, 186's
    advancements, the loot/worldgen registries) returns the MISSING entries in registration
    order — the "loaded through registries" contract, total and side-effect free.

## Non-goals
- **No actual registry mutation** (the wiring loads resolved entries), **no pack-file parsing**
  (the model IS the format), **no atomic reload** (213), **no change to any existing registry**,
  **no `Game.ts` edit**, **no save-format change**.

## Preconditions
- Change 211 (`internal-resource-pack-format`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 004's `ResourceId` helpers (imported; no registry changes).

## Proposed change
1. `src/data/DataPackManifest.ts` (NEW): the manifest model, validation, queries, and injected
   registry resolution.

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Resolution coupling drift**. Mitigation: the registry check is injected as a tiny
  `(kind, id) => boolean`; no registry type is imported.

## Rollback strategy
One new data file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: valid manifests across all five kinds; every rejection; queries
  (id/kind/group/path); resolution (fully present -> empty missing list, partial, missing in
  registration order, empty manifest).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
