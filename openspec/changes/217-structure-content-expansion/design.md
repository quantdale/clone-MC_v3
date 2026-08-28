# Design: 217-structure-content-expansion

## Context/current state
- 215/216 established the data-driven definition pattern for blocks/items/biomes; structures
  remain fixed. 217 adds structure definitions (template + placement rules) over 099-101's
  structure systems; 218's mob expansion follows.

## Target state
- `src/data/StructureExpansion.ts` holding the definition model, validation, and the expansion
  queries.

## Invariants
- Pure and headless-safe: no registry access, no template parsing, no mutation of inputs.
- Definition ids are valid namespaced ids (004 rules) whose path does NOT start with
  `structure/`; `name` is a non-empty translation key; `template` is a non-empty template id.
- Placement rules: `biomeCategories` non-empty, drawn from 216's `BiomeCategory`; `spacing` a
  positive integer; `separation` an integer in [0, spacing); `rarity` a finite number in (0, 1]
  (default 1); `yRange` an integer `[min, max]` pair with min <= max.
- Duplicate ids are rejected; the whole payload validates before anything is accepted.
- `createStructureExpansion` preserves registration order; lookups are total.

## API and data model
```ts
// src/data/StructureExpansion.ts (new)
import type { BiomeCategory } from './BiomeExpansion';

export interface StructurePlacement {
  biomeCategories: readonly BiomeCategory[];
  spacing: number;        // positive integer (chunks)
  separation: number;     // integer in [0, spacing)
  rarity: number;         // (0, 1], default 1
  yRange: readonly [number, number];  // [min, max], min <= max
}
export interface StructureDefinition {
  id: ResourceId;         // path without a structure/ prefix
  name: string;           // translation key (214)
  template: string;       // template id (099-101)
  placement: StructurePlacement;
}
export function createStructureDefinition(input: {
  id: ResourceId | string; name: string; template: string;
  placement: {
    biomeCategories: readonly BiomeCategory[];
    spacing: number;
    separation?: number;
    rarity?: number;
    yRange: readonly [number, number];
  };
}): StructureDefinition;

export interface StructureExpansion { structures: readonly StructureDefinition[]; }
export function createStructureExpansion(definitions: readonly StructureDefinition[]): StructureExpansion;
export function structureById(expansion: StructureExpansion, id: ResourceId | string): StructureDefinition | undefined;
export function structuresInCategory(expansion: StructureExpansion, category: BiomeCategory): readonly StructureDefinition[];
```

## Control/data flow
1. Content authors define structures as data (template id + placement rules).
2. `createStructureExpansion` validates and orders them; the placement pipeline consumes the
   rules through 099-101 (unchanged).

## Detailed behavior
- `createStructureDefinition` rejections (each `StructureExpansion: <detail>`): invalid id ->
  `id must be a valid namespaced id`; `structure/`-prefixed path -> `id path must not start with
  'structure/'`; empty name -> `name must be a non-empty string`; empty template ->
  `template must be a non-empty string`; empty categories -> `biomeCategories must not be
  empty`; unknown category -> `biomeCategories must be known biome categories`; spacing not a
  positive integer -> `spacing must be a positive integer`; separation outside [0, spacing) ->
  `separation must be an integer in [0, spacing)`; rarity outside (0, 1] or non-finite ->
  `rarity must be a finite number in (0, 1]`; yRange not integers with min <= max ->
  `yRange must be an integer [min, max] pair with min <= max`.
- `createStructureExpansion`: duplicate ids -> `duplicate structure id <id>`.
- `structureById`: string ids parse with the default namespace; undefined when missing.
- `structuresInCategory`: registration order filter.
- Defaults: `separation` 0, `rarity` 1.

## Failure modes
- Construction throws descriptively; nothing partially accepted. Lookups are total.

## Compatibility/migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Lookups and grouping O(structures).

## Testing seams
- Tests drive the constructor with exact payloads and pin every rejection.

## Observability/debugging
- The expansion is a plain immutable object; lookups are introspectable.

## Affected files/symbols
- `src/data/StructureExpansion.ts` (new).
- Tests: `tests/unit/StructureExpansion.test.ts` (new). No other files.

## Rejected alternatives
- **Extending 099-101's registries directly**: rejected — registry characterization stays
  pinned; the expansion is data the placement pipeline maps (the established pattern).

## Downstream dependencies
- 218 (`mob-content-expansion`) mirrors the pattern; the placement pipeline consumes the rules;
  242's e2e verifies structure placement.
