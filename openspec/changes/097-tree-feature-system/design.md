# Design: 097-tree-feature-system

## Context / current state

`TerrainGenerator.placeTrees` hard-codes a fixed tree: `CANOPY_HALF_WIDTH = 2`, trunk
`4 + rng.nextInt(2)`, canopy 5x5x3 with a 3x3 top, wood id 7, leaves id 8, owner-based
cross-chunk canopy writes. 094's config union is the documented extension point; 096 added
`ore`.

## Target state

`tree` is a validated configured-feature member; `buildTreeBlocks(config, rng)` returns the
deterministic relative block layout; `TerrainGenerator` places trees through it, keeping its
biome/density gating and draw sequence so output is bit-identical.

## Invariants

- `tree` config: `trunk.blockId` non-negative integer; `trunk.minHeight`/`maxHeight` positive
  integers with `minHeight <= maxHeight`; `foliage.blockId` non-negative integer;
  `foliage.shape` one of `round`/`flatTop`/`spruce`; `foliage.radius` positive integer.
- Trunk height samples uniformly: `h = minHeight + floor(nextFloat() * (maxHeight - minHeight + 1))`
  (one draw; identical to `4 + nextInt(2)` for the default oak).
- Foliage layers (1-based layer `i`, `dy = h + i`, layer radius from the shape table); each layer
  is the full `[-r_i, r_i]^2` square including the center.
- Block order is deterministic: trunk blocks first (dy ascending), then foliage layers (layer,
  then dx ascending, then dz ascending).
- `TerrainGenerator` keeps its exact per-column placement gating (biome density via `hash2`
  + `PRNG`, surface > sea level, owner-based trunk/canopy chunk writes, air-only overwrites).

## API and data model

```ts
// src/worldgen/TreeFeature.ts (NEW)
export type TreeShape = 'round' | 'flatTop' | 'spruce';
export interface TreeTrunkConfig { blockId: number; minHeight: number; maxHeight: number; }
export interface TreeFoliageConfig { blockId: number; shape: TreeShape; radius: number; }
export interface TreeBlock { kind: 'trunk' | 'foliage'; dx: number; dy: number; dz: number; blockId: number; }
export function buildTreeBlocks(
  config: { trunk: TreeTrunkConfig; foliage: TreeFoliageConfig },
  rng: { nextFloat(): number },
): TreeBlock[];
export function createDefaultTreeConfiguredFeatures(): ConfiguredFeatureRegistry;
```

```ts
// src/worldgen/ConfiguredFeature.ts (MODIFIED — union member)
| { type: 'tree';
    trunk: { blockId: number; minHeight: number; maxHeight: number };
    foliage: { blockId: number; shape: TreeShape; radius: number } }
```

## Control / data flow

1. `TerrainGenerator` resolves the default oak feature once (constructor, fail-fast).
2. Per anchor column: biome/density gate (unchanged), surface gate (unchanged), then
   `buildTreeBlocks(config, { nextFloat: () => rng.next() })` and write blocks with the
   existing owner-based bounds/air rules.

## Detailed behavior

- Shape tables (layer index `i` starting at 1, `dy = h + i`):
  - `round`: layers 1..3, radii `[r, r, max(r - 1, 0)]`.
  - `flatTop`: layers 1..3, radii `[r, r, r]`.
  - `spruce`: layers 1..(r + 1), radius of layer `i` = `r - i + 1`.
- Default oak (`overworld/oak_tree`): trunk `{ blockId: 7, minHeight: 4, maxHeight: 5 }`,
  foliage `{ blockId: 8, shape: 'round', radius: 2 }` — identical shape to the former
  hard-coded tree (trunk 4-5; 5x5, 5x5, 3x3 canopy).
- Bit-identical rewire: old `trunkHeight = 4 + rng.nextInt(2)` equals
  `4 + floor(rng.next() * 2)`; foliage tables match the old 5x5x3 + 3x3 top exactly; canopy
  reach = foliage radius = 2 = old `CANOPY_HALF_WIDTH`.

## Failure modes

- Validation throws descriptive errors naming the offending field.
- TerrainGenerator fails fast at construction if the default oak feature is missing or not a
  tree config.

## Compatibility / migration

Additive union member. Chunk output unchanged (verified by the existing determinism/tree unit
tests and E2E). No stored data changes.

## Performance / resource constraints

`buildTreeBlocks` is O(trunk height + foliage area), called once per tree column; canopy anchor
loop reach equals the foliage radius (2 for the default oak, same as before).

## Testing seams

- `tests/unit/TreeFeature.test.ts` (NEW): tree config validation matrix; exact block layouts
  for all three shapes with scripted rng; height sampling bounds; determinism; defaults.
- `tests/unit/TerrainGenerator.test.ts` (existing): determinism, tree existence, trunk
  anchoring — regression gate for the bit-identical rewire.

## Observability / debugging

Block layouts are plain relative tuples; tests assert exact lists.

## Affected files / symbols

- `src/worldgen/ConfiguredFeature.ts` — union + validator gain `tree`.
- `src/worldgen/TreeFeature.ts` — NEW.
- `src/world/TerrainGenerator.ts` — `CANOPY_HALF_WIDTH` removed; `treeSpec` returns the
  positioned `PRNG`; `placeTrees` writes `buildTreeBlocks` output; constructor resolves the
  default oak.
- `tests/unit/TreeFeature.test.ts` — NEW.

## Rejected alternatives

- *Keep hard-coded trees, add a separate tree system*: the scope requires replacement, and a
  parallel path would diverge over time.
- *Place trees via 095 chains now*: 095 `heightRange` is absolute; tree trunks are
  surface-relative. Surface-relative placement lands with the worldgen wiring change.

## Downstream dependencies

098 vegetation reuses the pattern; the wiring change places trees via 095 chains with a
surface-relative height concept and writes `buildTreeBlocks` output into columns.
