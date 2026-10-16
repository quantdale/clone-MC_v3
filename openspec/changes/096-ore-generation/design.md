# Design: 096-ore-generation

## Context / current state

094 provides the configured-feature core (simpleBlock/blockPatch) whose union is the documented
extension point; 095 provides placed features and modifiers. No ore features, tags, or tag-driven
target resolution exist. Worldgen is pure and decoupled from `src/world/`; block ids in feature
configs are numeric vocabulary (094/095 precedent), so 096 uses a worldgen-local numeric block-id
tag registry instead of the ResourceId-based `src/data/TagRegistry` (which is bound to resource
members, not numeric ids).

## Target state

`ore` configs validate strictly, ore targets resolve through a validated block-id tag registry,
and deterministic defaults (tags + configured + placed) exist over the 094/095 registries.

## Invariants

- `ore` config: `blockId` non-negative integer; `size` positive integer;
  `discardChanceOnAirExposure` finite number in `[0, 1]`; `targetTags` non-empty array of
  non-empty strings.
- Tags: non-empty key; non-empty array of non-negative integer block ids; no duplicate ids
  within a tag; member order is preserved.
- The tag registry stores only validated tags; duplicates and invalid inputs throw without
  partial state.
- `resolveOreTargetBlockIds(targetTags, tags)` follows `targetTags` order, member order within
  each tag, and dedupes preserving first occurrence; unknown tags throw.
- Defaults are deterministic and every default ore config's tags resolve through the default tag
  registry.

## API and data model

```ts
// src/worldgen/ConfiguredFeature.ts (MODIFIED — union gains one member)
export type ConfiguredFeatureConfig =
  | { type: 'simpleBlock'; blockId: number }
  | { type: 'blockPatch'; blockId: number; tries: number; radiusXZ: number; radiusY: number }
  | { type: 'ore'; blockId: number; size: number; discardChanceOnAirExposure: number; targetTags: string[] };

// src/worldgen/OreFeature.ts (NEW)
export interface OreBlockTag { key: string; blockIds: number[]; }
export function validateOreBlockTag(input: unknown): OreBlockTag;
export class OreBlockTagRegistry {
  register(key: string, blockIds: number[]): void;
  get(key: string): OreBlockTag | null;
  has(key: string): boolean;
  get size(): number;
  clear(): void;
}
export function resolveOreTargetBlockIds(targetTags: string[], tags: OreBlockTagRegistry): number[];
export function createDefaultOreBlockTags(): OreBlockTagRegistry;
export function createDefaultOreConfiguredFeatures(): ConfiguredFeatureRegistry;
export function createDefaultOrePlacedFeatures(): PlacedFeatureRegistry;
```

## Control / data flow

1. 096 registers default tags, then ore configured features referencing them, then ore placed
   features referencing the configured keys (095 chains: `count` + `heightRange`).
2. Later wiring resolves each ore config's targets via `resolveOreTargetBlockIds` and executes
   veins against columns.

## Detailed behavior

- Default tags (documented, matching `BlockId` vocabulary):
  - `overworld/stone_ore_replaceables` = `[3]` (stone)
  - `overworld/soil_ore_replaceables` = `[2, 11, 4]` (dirt, gravel, sand)
- Default ore configured features:
  - `overworld/coal_ore`: ore, blockId 14, size 17, discardChanceOnAirExposure 0,
    targets `[overworld/stone_ore_replaceables, overworld/soil_ore_replaceables]`
  - `overworld/iron_ore`: ore, blockId 15, size 9, discardChanceOnAirExposure 0,
    targets `[overworld/stone_ore_replaceables, overworld/soil_ore_replaceables]`
- Default ore placed features (095 chains; no survivalFilter needed — ore veins replace blocks
  inside tags, so the chain needs no solidity probe):
  - `overworld/coal_ore` -> featureKey `overworld/coal_ore`, modifiers
    `[count 20, heightRange -64..192]`
  - `overworld/iron_ore` -> featureKey `overworld/iron_ore`, modifiers
    `[count 9, heightRange -64..72]`
- `discardChanceOnAirExposure` is data carried for the later wiring change (vein discard
  probability when exposed to air); it is validated but not executed in 096.

## Failure modes

- Validation throws descriptive errors naming the offending field; unknown tags throw at
  resolution; registry operations reject invalid/duplicate registrations atomically.

## Compatibility / migration

Additive union member; 094 defaults and validations unchanged. One 094 test assertion switches
its unknown-type stand-in from `ore` to `portal` because `ore` became valid (documented union
extension, per 094 design).

## Performance / resource constraints

Validation O(1) per config/tag; resolution O(total members); registry O(1) lookups.

## Testing seams

- `tests/unit/OreFeature.test.ts` (NEW): ore config validation matrix; tag validation matrix;
  registry lifecycle/atomicity; resolution order/dedupe/unknown-tag errors; defaults
  (tags/configured/placed) exact values and determinism; cross-check that all default ore
  targetTags resolve through the default tag registry.
- `tests/unit/ConfiguredFeature.test.ts` (MODIFIED): `{ type: 'ore' }` -> `{ type: 'portal' }`
  in the unknown-type rejection assertion.

## Observability / debugging

Everything is plain validated data; tests assert exact values.

## Affected files / symbols

- `src/worldgen/ConfiguredFeature.ts` — union + validator gain `ore`.
- `src/worldgen/OreFeature.ts` — NEW.
- `tests/unit/ConfiguredFeature.test.ts` — one assertion updated.
- `tests/unit/OreFeature.test.ts` — NEW.

## Rejected alternatives

- *ResourceId-based `src/data/TagRegistry`*: bound to resource members, not the numeric block-id
  vocabulary used by 094/095 feature configs; would couple worldgen to `src/world/BlockRegistry`
  and create a layer inversion.
- *Per-ore inline block lists instead of tags*: tags make 097+ features share replaceable-block
  policy and match the "registry/tag-driven" scope.

## Downstream dependencies

097 tree features extend the union further; the wiring change resolves tags against the live
`BlockTypeRegistry` and executes veins via the 095 `placeFeature` positions.
