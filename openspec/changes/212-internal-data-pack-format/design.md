# Design: 212-internal-data-pack-format

## Context/current state
- 211 modeled assets; gameplay data has no manifest. 212 adds the data-pack manifest (the
  internal data-pack format); 213 reloads it atomically. The manifest model IS the format.

## Target state
- `src/data/DataPackManifest.ts` holding the entry/manifest model, validate-before-accept
  construction, queries, and injected registry resolution.

## Invariants
- Pure and headless-safe: no registry access (the check is injected), no mutation of inputs.
- `formatVersion` MUST be 1; `name`/`description` MUST be non-empty strings.
- Entry ids MUST be valid namespaced ids; paths MUST be non-empty relative paths without a
  leading `/` or `..` segments; kinds MUST be one of the five; an id MAY appear once per kind
  (duplicate id+kind rejected).
- Validation MUST reject the whole payload on any violation; `resolveEntries` is total.
- `entryPath` = `data/<namespace>/<kind>/<path>`.

## API and data model
```ts
// src/data/DataPackManifest.ts (new)
export type DataKind = 'recipe' | 'loot_table' | 'tag' | 'worldgen' | 'advancement';
export interface DataPackEntry {
  id: ResourceId;
  kind: DataKind;
  path: string;
}
export interface DataPackManifest {
  formatVersion: 1;
  name: string;
  description: string;
  entries: readonly DataPackEntry[];
}
export function createDataPackManifest(name: string, description: string, entries: readonly DataPackEntry[]): DataPackManifest;
export function validateDataPackManifest(input: unknown): DataPackManifest;
export function entryById(manifest: DataPackManifest, id: ResourceId | string): DataPackEntry | undefined;
export function entriesOfKind(manifest: DataPackManifest, kind: DataKind): readonly DataPackEntry[];
export function entriesByKind(manifest: DataPackManifest): Readonly<Record<DataKind, readonly DataPackEntry[]>>;
export function entryPath(entry: DataPackEntry): string;
export function resolveEntries(manifest: DataPackManifest, hasEntry: (kind: DataKind, id: ResourceId) => boolean): readonly DataPackEntry[];
```

## Control/data flow
1. The wiring builds the manifest and checks it with `resolveEntries` against the adapted
   registries (103 recipes, 005 tags, 186 advancements, loot/worldgen).
2. A fully resolvable manifest (empty missing list) is loaded; missing entries are reported.

## Detailed behavior
- Validation order (each throws `DataPack: <detail>`): non-object -> `expected an object`;
  `formatVersion` !== 1 -> `unsupported format version <v>`; `name`/`description` empty ->
  `name must be a non-empty string` / `description must be a non-empty string`; `entries` not an
  array -> `entries must be an array`; per entry: `entries <i>.id` invalid -> `entries <i>.id
  must be a valid namespaced id`; `entries <i>.kind` unknown -> `entries <i>.kind must be
  recipe, loot_table, tag, worldgen, or advancement`; `entries <i>.path` malformed ->
  `entries <i>.path must be a relative path without '..'`; duplicate id+kind -> `duplicate entry
  <kind> <id>`; unknown top-level keys -> `unknown key <k>`.
- Queries mirror 211's (`assetById`-style; `entriesByKind` includes empty groups for absent
  kinds).
- `resolveEntries(manifest, hasEntry)`: the entries (registration order) for which
  `hasEntry(kind, id)` is false; an empty manifest yields an empty list.

## Failure modes
- Construction/validation throws descriptively; nothing partially accepted.
- Resolution is total; `entryById` returns undefined for missing ids.

## Compatibility/migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Queries O(entries); resolution O(entries).

## Testing seams
- Tests inject stub `hasEntry` lookups over hand-built manifests.

## Observability/debugging
- The manifest is a plain immutable object; `resolveEntries` exposes the loadability report.

## Affected files/symbols
- `src/data/DataPackManifest.ts` (new).
- Tests: `tests/unit/DataPackManifest.test.ts` (new). No other files.

## Rejected alternatives
- **Binding to concrete registry types**: rejected — the injected `(kind, id) => boolean` keeps
  the module decoupled and headless-testable.

## Downstream dependencies
- 213 (`resource-reload`) validates and atomically reloads data packs; the wiring loads resolved
  entries into the registries; 214+ continue the arc.
