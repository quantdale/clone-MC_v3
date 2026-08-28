# Design: 215-block-item-content-expansion

## Context/current state
- The block/item catalog is fixed; content additions currently require registry edits. 215 adds
  a data-driven DEFINITION layer over the existing registries (no architecture change, no
  registry mutation); 216's biome expansion follows the same pattern.

## Target state
- `src/data/ContentExpansion.ts` holding the definition model, validation, and the expansion
  queries.

## Invariants
- Pure and headless-safe: no registry access, no mutation of inputs.
- Definition ids are valid namespaced ids (004 rules) whose path does NOT start with
  `block/` or `item/` (the kind carries the prefix); `name` is a non-empty translation key;
  `stackSize` is an integer in [1, 64] (default 64); `hardness` is a finite number >= 0
  (default 0); `tags` are non-empty strings (default []).
- Duplicate ids are rejected; the whole payload validates before anything is accepted.
- `createContentExpansion` groups by kind preserving registration order; lookups are total.

## API and data model
```ts
// src/data/ContentExpansion.ts (new)
export type ContentKind = 'block' | 'item';
export interface ContentDefinition {
  id: ResourceId;             // path without a block/ or item/ prefix
  kind: ContentKind;
  name: string;               // translation key (214)
  stackSize: number;          // 1..64, default 64
  hardness: number;           // >= 0, default 0
  tags: readonly string[];    // default []
}
export function createContentDefinition(input: {
  id: ResourceId | string; kind: ContentKind; name: string;
  stackSize?: number; hardness?: number; tags?: readonly string[];
}): ContentDefinition;

export interface ContentExpansion {
  blocks: readonly ContentDefinition[];
  items: readonly ContentDefinition[];
}
export function createContentExpansion(definitions: readonly ContentDefinition[]): ContentExpansion;
export function contentById(expansion: ContentExpansion, id: ResourceId | string): ContentDefinition | undefined;
export function contentsOfKind(expansion: ContentExpansion, kind: ContentKind): readonly ContentDefinition[];
```

## Control/data flow
1. Content authors define new blocks/items as data.
2. `createContentExpansion` validates and groups them; the wiring maps the definitions onto the
   existing registries (004/006) without changing their architecture.

## Detailed behavior
- `createContentDefinition` rejections (each `Content: <detail>`): invalid id ->
  `id must be a valid namespaced id`; path with a `block/`/`item/` prefix ->
  `id path must not start with 'block/' or 'item/'`; empty name -> `name must be a non-empty
  string`; `stackSize` not an integer in [1, 64] -> `stackSize must be an integer in [1, 64]`;
  `hardness` not a finite number >= 0 -> `hardness must be a finite number >= 0`; a tag that is
  not a non-empty string -> `tags must be non-empty strings`.
- `createContentExpansion`: duplicate ids -> `duplicate content id <id>`; blocks/items keep
  registration order.
- `contentById`: string ids parse with the default namespace; undefined when missing.
- Defaults: `stackSize` 64, `hardness` 0, `tags` [].

## Failure modes
- Construction throws descriptively; nothing partially accepted. Lookups are total.

## Compatibility/migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Lookups O(definitions); grouping O(definitions).

## Testing seams
- Tests drive the constructor with exact payloads and pin every rejection.

## Observability/debugging
- The expansion is a plain immutable object; lookups are introspectable.

## Affected files/symbols
- `src/data/ContentExpansion.ts` (new).
- Tests: `tests/unit/ContentExpansion.test.ts` (new). No other files.

## Rejected alternatives
- **Extending the registries directly**: rejected — registry characterization stays pinned; the
  expansion is data the wiring maps (the "not new architecture" constraint).

## Downstream dependencies
- 216 (`biome-content-expansion`) mirrors the pattern; the wiring maps definitions into 004/006;
  242's e2e verifies expanded content.
