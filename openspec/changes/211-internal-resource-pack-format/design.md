# Design: 211-internal-resource-pack-format

## Context/current state
- Assets are referenced ad hoc. 211 adds the canonical namespaced asset manifest (the internal
  resource-pack format); 212's data packs and the asset loader consume it. The manifest model IS
  the format — no pack-file parsing in this change.

## Target state
- `src/data/ResourcePackManifest.ts` holding the manifest/asset model, validate-before-accept
  construction, organization queries, and the canonical asset path.

## Invariants
- Pure and headless-safe: no file access, no mutation of inputs, no registry changes.
- `formatVersion` MUST be 1; `name`/`description` MUST be non-empty strings.
- Asset ids MUST be valid namespaced ids (namespace `[a-z0-9_.-]+`, path `[a-z0-9/._-]+` —
  004's rules); asset paths MUST be non-empty, without a leading `/` and without `..` segments.
- `metadata` MUST be an object and MUST appear only on `metadata`-type assets.
- Duplicate asset ids MUST be rejected; the whole payload is validated before anything is
  accepted.
- `assetPath(asset)` MUST be `assets/<namespace>/<type>/<path>`.

## API and data model
```ts
// src/data/ResourcePackManifest.ts (new)
export type AssetType = 'texture' | 'model' | 'sound' | 'metadata';
export interface ResourceAsset {
  id: ResourceId;
  type: AssetType;
  path: string;                                  // relative, no leading '/' or '..'
  metadata?: Readonly<Record<string, unknown>>;  // metadata assets only
}
export interface ResourcePackManifest {
  formatVersion: 1;
  name: string;
  description: string;
  assets: readonly ResourceAsset[];
}
export function createResourcePackManifest(name: string, description: string, assets: readonly ResourceAsset[]): ResourcePackManifest;
export function validateResourcePackManifest(input: unknown): ResourcePackManifest;
export function assetById(manifest: ResourcePackManifest, id: ResourceId | string): ResourceAsset | undefined;
export function assetsByNamespace(manifest: ResourcePackManifest): Readonly<Record<string, readonly ResourceAsset[]>>;
export function assetsOfType(manifest: ResourcePackManifest, type: AssetType): readonly ResourceAsset[];
export function assetPath(asset: ResourceAsset): string;
```

## Control/data flow
1. The asset loader builds a manifest from bundled asset metadata and resolves each asset via
   `assetPath`; the renderer/audio layers look up assets by id.

## Detailed behavior
- Validation order (each throws `ResourcePack: <detail>`):
  non-object -> `expected an object`; `formatVersion` !== 1 -> `unsupported format version <v>`;
  `name`/`description` not non-empty strings -> `name must be a non-empty string` /
  `description must be a non-empty string`; `assets` not an array -> `assets must be an array`;
  per asset: `assets <i>.id` must parse via `parseResourceId` (default namespace `minecraft`) or
  be a valid ResourceId object -> `assets <i>.id must be a valid namespaced id`; `type` not one
  of the four -> `assets <i>.type must be texture, model, sound, or metadata`; `path` invalid ->
  `assets <i>.path must be a relative path without '..'`; `metadata` present on a non-metadata
  asset or not an object -> `assets <i>.metadata must be an object on metadata assets`;
  duplicate ids -> `duplicate asset id <id>`; unknown top-level keys -> `unknown key <k>`.
- `assetById`: accepts a string (parsed with default namespace) or a ResourceId; compares by
  `resourceIdEquals`.
- `assetsByNamespace`: registration order preserved per namespace.
- `assetPath`: `assets/<namespace>/<type>/<path>` via `resourceIdToString` components.

## Failure modes
- Construction/validation throws descriptively and accepts nothing partially.
- Lookups are total (undefined for missing ids).

## Compatibility/migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Lookups O(assets); grouping O(assets).

## Testing seams
- Tests build manifests through `createResourcePackManifest` and drive every rejection with
  exact payloads.

## Observability/debugging
- The manifest is a plain immutable object; `assetPath` exposes the loader contract.

## Affected files/symbols
- `src/data/ResourcePackManifest.ts` (new).
- Tests: `tests/unit/ResourcePackManifest.test.ts` (new). No other files.

## Rejected alternatives
- **A zip/pack parser**: rejected — the manifest model IS the internal format; actual file I/O
  belongs to the loader (later arc).

## Downstream dependencies
- 212 (`internal-data-pack-format`) organizes recipes/loot/tags/worldgen/advancements; the asset
  loader resolves `assetPath`; 213 closes the assets arc.
