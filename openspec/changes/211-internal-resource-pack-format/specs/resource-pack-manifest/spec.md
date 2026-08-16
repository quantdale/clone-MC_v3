# Spec: resource-pack-manifest

## Contract
This capability adds the internal resource-pack format: a validated manifest of namespaced
assets (textures, models, sounds, metadata) with organization queries and a canonical asset
path — pure and headless-safe.

## Definitions
- **Asset**: `{ id: ResourceId, type, path, metadata? }`; types are `texture | model | sound |
  metadata`.
- **Manifest**: `{ formatVersion: 1, name, description, assets }`.
- **Asset path**: the canonical loader path `assets/<namespace>/<type>/<path>`.

## Invariants
- Pure and headless-safe: no file access, no mutation of inputs.
- `formatVersion` MUST be 1; `name`/`description` MUST be non-empty strings.
- Asset ids MUST be valid namespaced ids; paths MUST be non-empty relative paths without a
  leading `/` or `..` segments; `metadata` MUST be an object and MUST appear only on
  `metadata`-type assets; duplicate ids MUST be rejected.
- Validation MUST reject the whole payload on any violation (nothing partially accepted).

## Requirements

### Requirement: manifest construction
`createResourcePackManifest(name, description, assets)` MUST return a validated manifest.
`validateResourcePackManifest(input)` MUST round-trip it.

#### Scenario: construction
- **GIVEN** a manifest with a texture asset `minecraft:block/stone` at `textures/block/stone.png`
  and a metadata asset `minecraft:block/stone_meta` with `{ tint: 'green' }`
- **THEN** both functions accept it; `formatVersion` is 1

### Requirement: rejection classes
Construction MUST throw a descriptive `Error` for a non-object payload, an unsupported format
version, an empty `name`/`description`, a non-array `assets`, an invalid asset id, an unknown
asset type, a malformed asset path (empty, leading `/`, `..`), metadata on a non-metadata asset,
a non-object `metadata`, duplicate asset ids, and unknown top-level keys.

#### Scenario: rejections
- **GIVEN** manifests with `formatVersion: 0`; `name: ''`; `assets: 'x'`; an asset with id
  `'Bad Id'`; an asset with type `'shader'`; an asset with path `'../secret.png'`; a texture
  asset with `metadata: {}`; two assets with the same id; and an extra `{ extra: true }` key
- **THEN** each throws mentioning `unsupported format version`, `name must be a non-empty
  string`, `assets must be an array`, `must be a valid namespaced id`, `must be texture, model,
  sound, or metadata`, `must be a relative path without '..'`, `must be an object on metadata
  assets`, `duplicate asset id`, and `unknown key` respectively

### Requirement: organization queries
`assetById(manifest, id)` MUST return the asset for a string or `ResourceId` id (undefined when
missing); `assetsByNamespace(manifest)` MUST group assets by namespace preserving registration
order; `assetsOfType(manifest, type)` MUST filter by type in registration order.

#### Scenario: queries
- **GIVEN** a manifest with `minecraft:block/stone`, `minecraft:item/sword`, and
  `custom:block/stone`
- **THEN** `assetById(manifest, 'minecraft:block/stone')` returns the first asset; `assetById`
  with `createResourceId('minecraft', 'item/sword')` returns the second; `assetById(manifest,
  'minecraft:nope')` is undefined; `assetsByNamespace` has `minecraft` and `custom` groups in
  registration order; `assetsOfType(manifest, 'texture')` returns the texture assets in order

### Requirement: canonical path
`assetPath(asset)` MUST return `assets/<namespace>/<type>/<path>`.

#### Scenario: path
- **GIVEN** a sound asset `minecraft:block/stone_hit` at `sounds/block/stone.ogg`
- **THEN** `assetPath` is `assets/minecraft/sound/sounds/block/stone.ogg`

## Error and failure behavior
- Construction/validation throws descriptively and accepts nothing partially.
- Lookups are total (undefined for missing ids).

## Performance and resource bounds
- Lookups and grouping O(assets).

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Security and integrity
- Path validation rejects traversal (`..`) and absolute paths.

## Observability
- The manifest is a plain immutable object; `assetPath` exposes the loader contract.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 construction | `tests/unit/ResourcePackManifest.test.ts` › construction |
| REQ-2 rejections | › rejections |
| REQ-3 queries | › queries |
| REQ-4 path | › canonical path |
