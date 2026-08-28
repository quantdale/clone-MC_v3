# Design: 218-mob-content-expansion

## Context/current state
- 215-217 established the data-driven definition pattern; mobs remain fixed. 218 adds mob
  definitions (stats + spawn data) over 129-146's entity/AI primitives; 219's enchantment/potion
  expansion follows.

## Target state
- `src/data/MobExpansion.ts` holding the definition model, validation, and the expansion
  queries.

## Invariants
- Pure and headless-safe: no registry access, no entity/AI code, no mutation of inputs.
- Definition ids are valid namespaced ids (004 rules) whose path does NOT start with `mob/`;
  `name` is a non-empty translation key; `category` is one of `passive|hostile|neutral|utility`;
  `archetype` is one of `melee|ranged|wanderer` (default wanderer); `health` is a positive
  integer; `speed` is a finite number > 0; `hostileToPlayer` is a boolean (default
  `category === 'hostile'`).
- Spawn data: `spawns.biomes` non-empty known 216 categories; `spawns.weight` a positive
  integer; `spawns.packSize` a `[min, max]` positive-integer pair with min <= max.
- Duplicate ids are rejected; the whole payload validates before anything is accepted.
- `createMobExpansion` preserves registration order; lookups are total.

## API and data model
```ts
// src/data/MobExpansion.ts (new)
import type { BiomeCategory } from './BiomeExpansion';

export type MobCategory = 'passive' | 'hostile' | 'neutral' | 'utility';
export type MobArchetype = 'melee' | 'ranged' | 'wanderer';

export interface MobSpawnData {
  biomes: readonly BiomeCategory[];
  weight: number;           // positive integer
  packSize: readonly [number, number];  // [min, max], positive, min <= max
}
export interface MobDefinition {
  id: ResourceId;           // path without a mob/ prefix
  name: string;             // translation key (214)
  category: MobCategory;
  archetype: MobArchetype;  // default 'wanderer'
  health: number;           // positive integer
  speed: number;            // finite > 0
  hostileToPlayer: boolean; // default category === 'hostile'
  spawns: MobSpawnData;
}
export function createMobDefinition(input: {
  id: ResourceId | string; name: string; category: MobCategory;
  archetype?: MobArchetype; health: number; speed: number;
  hostileToPlayer?: boolean;
  spawns: { biomes: readonly BiomeCategory[]; weight: number; packSize: readonly [number, number]; };
}): MobDefinition;

export interface MobExpansion { mobs: readonly MobDefinition[]; }
export function createMobExpansion(definitions: readonly MobDefinition[]): MobExpansion;
export function mobById(expansion: MobExpansion, id: ResourceId | string): MobDefinition | undefined;
export function mobsByCategory(expansion: MobExpansion, category: MobCategory): readonly MobDefinition[];
export function mobsInBiome(expansion: MobExpansion, category: BiomeCategory): readonly MobDefinition[];
```

## Control/data flow
1. Content authors define mobs as data (stats + spawn data referencing 216's categories).
2. `createMobExpansion` validates and orders them; 137-138's spawn cycle consumes the spawn
   data through 129-146's primitives (unchanged).

## Detailed behavior
- `createMobDefinition` rejections (each `MobExpansion: <detail>`): invalid id ->
  `id must be a valid namespaced id`; `mob/`-prefixed path -> `id path must not start with
  'mob/'`; empty name -> `name must be a non-empty string`; unknown category ->
  `category must be passive, hostile, neutral, or utility`; unknown archetype ->
  `archetype must be melee, ranged, or wanderer`; health not a positive integer ->
  `health must be a positive integer`; speed not finite > 0 -> `speed must be a finite number >
  0`; non-boolean hostileToPlayer -> `hostileToPlayer must be a boolean`; empty/unknown biomes
  -> `spawns.biomes must not be empty` / `spawns.biomes must be known biome categories`; weight
  not a positive integer -> `spawns.weight must be a positive integer`; packSize invalid ->
  `spawns.packSize must be a positive integer [min, max] pair with min <= max`.
- `createMobExpansion`: duplicate ids -> `duplicate mob id <id>`.
- `mobById`: string ids parse with the default namespace; undefined when missing.
- Defaults: `archetype` 'wanderer'; `hostileToPlayer` = (category === 'hostile').

## Failure modes
- Construction throws descriptively; nothing partially accepted. Lookups are total.

## Compatibility/migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Lookups and grouping O(mobs).

## Testing seams
- Tests drive the constructor with exact payloads and pin every rejection.

## Observability/debugging
- The expansion is a plain immutable object; lookups are introspectable.

## Affected files/symbols
- `src/data/MobExpansion.ts` (new).
- Tests: `tests/unit/MobExpansion.test.ts` (new). No other files.

## Rejected alternatives
- **Extending 017's entity-type registry directly**: rejected — registry characterization stays
  pinned; the expansion is data the spawn cycle maps (the established pattern).

## Downstream dependencies
- 219 (`enchantment-potion-content-expansion`) mirrors the pattern; 137-138 consume the spawn
  data; 242's e2e verifies expanded mobs.
