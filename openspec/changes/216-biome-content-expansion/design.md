# Design: 216-biome-content-expansion

## Context/current state
- 215 established the data-driven definition pattern; biomes remain fixed. 216 expands the
  biome catalog and feature combinations as data over 016's biome registry and the worldgen
  registries (094-101); 217's structures follow.

## Target state
- `src/data/BiomeExpansion.ts` holding the definition model, validation, and the expansion
  queries.

## Invariants
- Pure and headless-safe: no registry access, no mutation of inputs.
- Definition ids are valid namespaced ids (004 rules) whose path does NOT start with `biome/`;
  `name` is a non-empty translation key; `temperature` is a finite number in [-2, 2] (default
  0.5); `precipitation` is one of `none|rain|snow` (default rain); `category` is one of
  `plains|forest|desert|snowy|ocean|nether|end|mountain` (default plains); `features` are
  non-empty strings (default []).
- Duplicate ids are rejected; the whole payload validates before anything is accepted.
- `createBiomeExpansion` preserves registration order; lookups are total.

## API and data model
```ts
// src/data/BiomeExpansion.ts (new)
export type BiomePrecipitation = 'none' | 'rain' | 'snow';
export type BiomeCategory = 'plains' | 'forest' | 'desert' | 'snowy' | 'ocean' | 'nether' | 'end' | 'mountain';
export interface BiomeDefinition {
  id: ResourceId;             // path without a biome/ prefix
  name: string;               // translation key (214)
  temperature: number;        // [-2, 2], default 0.5
  precipitation: BiomePrecipitation;  // default 'rain'
  category: BiomeCategory;    // default 'plains'
  features: readonly string[];        // feature ids, default []
}
export function createBiomeDefinition(input: {
  id: ResourceId | string; name: string;
  temperature?: number; precipitation?: BiomePrecipitation; category?: BiomeCategory;
  features?: readonly string[];
}): BiomeDefinition;

export interface BiomeExpansion { biomes: readonly BiomeDefinition[]; }
export function createBiomeExpansion(definitions: readonly BiomeDefinition[]): BiomeExpansion;
export function biomeById(expansion: BiomeExpansion, id: ResourceId | string): BiomeDefinition | undefined;
export function featuresFor(biome: BiomeDefinition): readonly string[];
```

## Control/data flow
1. Content authors define biomes as data (id, climate, category, feature combination).
2. `createBiomeExpansion` validates and orders them; the wiring maps definitions onto 016 and
   the worldgen registries without changing their architecture.

## Detailed behavior
- `createBiomeDefinition` rejections (each `BiomeExpansion: <detail>`): invalid id ->
  `id must be a valid namespaced id`; `biome/`-prefixed path -> `id path must not start with
  'biome/'`; empty name -> `name must be a non-empty string`; temperature outside [-2, 2] or
  non-finite -> `temperature must be a finite number in [-2, 2]`; unknown precipitation ->
  `precipitation must be none, rain, or snow`; unknown category -> `category must be one of
  plains, forest, desert, snowy, ocean, nether, end, or mountain`; malformed features ->
  `features must be non-empty strings`.
- `createBiomeExpansion`: duplicate ids -> `duplicate biome id <id>`.
- `biomeById`: string ids parse with the default namespace; undefined when missing.
- Defaults: temperature 0.5, precipitation rain, category plains, features [].

## Failure modes
- Construction throws descriptively; nothing partially accepted. Lookups are total.

## Compatibility/migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Lookups and grouping O(definitions).

## Testing seams
- Tests drive the constructor with exact payloads and pin every rejection.

## Observability/debugging
- The expansion is a plain immutable object; lookups are introspectable.

## Affected files/symbols
- `src/data/BiomeExpansion.ts` (new).
- Tests: `tests/unit/BiomeExpansion.test.ts` (new). No other files.

## Rejected alternatives
- **Extending 016's registry directly**: rejected — registry characterization stays pinned; the
  expansion is data the wiring maps (215's pattern).

## Downstream dependencies
- 217 (`structure-content-expansion`) references biome categories for placement; the wiring maps
  definitions into 016/094-101; 242's e2e verifies expanded biomes.
