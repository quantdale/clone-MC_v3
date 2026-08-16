# Spec: data-pack-manifest

## Contract
This capability adds the internal data-pack format: a validated manifest of namespaced gameplay
entries (recipes, loot tables, tags, worldgen, advancements) with queries and an injected
registry-resolution check — pure and headless-safe.

## Definitions
- **Entry**: `{ id: ResourceId, kind, path }`; kinds are `recipe | loot_table | tag | worldgen |
  advancement`.
- **Manifest**: `{ formatVersion: 1, name, description, entries }`.
- **Entry path**: `data/<namespace>/<kind>/<path>`.
- **Resolution**: the entries whose `(kind, id)` is absent from the injected registry check.

## Invariants
- Pure and headless-safe: the registry check is injected; inputs are never mutated.
- `formatVersion` MUST be 1; `name`/`description` MUST be non-empty strings.
- Entry ids MUST be valid namespaced ids; paths MUST be non-empty relative paths without a
  leading `/` or `..` segments; kinds MUST be one of the five; an id MAY appear once per kind.
- Validation MUST reject the whole payload on any violation; `resolveEntries` MUST be total and
  return missing entries in registration order.

## Requirements

### Requirement: manifest construction
`createDataPackManifest(name, description, entries)` MUST return a validated manifest;
`validateDataPackManifest(input)` MUST round-trip it.

#### Scenario: construction
- **GIVEN** a manifest with a recipe entry `minecraft:planks`, a tag entry `minecraft:logs`, and
  an advancement entry `custom:first_join`
- **THEN** both functions accept it; `formatVersion` is 1

### Requirement: rejection classes
Construction MUST throw a descriptive `Error` for a non-object payload, an unsupported format
version, an empty `name`/`description`, a non-array `entries`, an invalid entry id, an unknown
kind, a malformed path, a duplicate id+kind, and unknown top-level keys.

#### Scenario: rejections
- **GIVEN** manifests with `formatVersion: 0`; `description: ''`; `entries: 'x'`; an entry with
  id `'Bad Id'`; an entry with kind `'biome'`; an entry with path `'../x.json'`; two recipe
  entries with the same id; and an extra `{ extra: true }` key
- **THEN** each throws mentioning `unsupported format version`, `description must be a
  non-empty string`, `entries must be an array`, `must be a valid namespaced id`, `must be
  recipe, loot_table, tag, worldgen, or advancement`, `must be a relative path without '..'`,
  `duplicate entry`, and `unknown key` respectively

### Requirement: queries
`entryById(manifest, id)` MUST return the first entry with the id (any kind; undefined when
missing); `entriesOfKind(manifest, kind)` MUST return that kind's entries in registration order;
`entriesByKind(manifest)` MUST group by kind (absent kinds present as empty arrays);
`entryPath(entry)` MUST be `data/<namespace>/<kind>/<path>`.

#### Scenario: queries
- **GIVEN** a manifest with a recipe `minecraft:planks`, a tag `minecraft:logs`, and another
  recipe `minecraft:stick`
- **THEN** `entryById(manifest, 'minecraft:planks')` returns the recipe; `entryById(manifest,
  'minecraft:nope')` is undefined; `entriesOfKind(manifest, 'recipe')` returns planks then stick;
  `entriesByKind(manifest).loot_table` is `[]`; `entryPath` of the tag is
  `data/minecraft/tag/minecraft:logs.json`

### Requirement: registry resolution
`resolveEntries(manifest, hasEntry)` MUST return, in registration order, the entries whose
`(kind, id)` fails `hasEntry`; a fully present manifest and an empty manifest MUST yield empty
lists.

#### Scenario: resolution
- **GIVEN** a manifest with recipe `minecraft:planks`, tag `minecraft:logs`, and advancement
  `custom:first_join`, and a `hasEntry` true only for `(recipe, minecraft:planks)`
- **THEN** the missing list is `[tag minecraft:logs, advancement custom:first_join]` in
  registration order; with `hasEntry` always true the list is empty; an empty manifest yields an
  empty list

## Error and failure behavior
- Construction/validation throws descriptively and accepts nothing partially.
- Resolution and lookups are total.

## Performance and resource bounds
- Queries and resolution O(entries).

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Security and integrity
- Path validation rejects traversal and absolute paths; duplicate id+kind is rejected.

## Observability
- The manifest is a plain immutable object; `resolveEntries` exposes the loadability report.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 construction | `tests/unit/DataPackManifest.test.ts` › construction |
| REQ-2 rejections | › rejections |
| REQ-3 queries | › queries |
| REQ-4 resolution | › resolution |
