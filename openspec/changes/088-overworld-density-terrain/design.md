# Design: 088-overworld-density-terrain

## Context / current state

087 provides noise/density primitives; no terrain generator exists.

## Target state

`generateTerrainColumn` produces a deterministic modern-height column from a density formula over
087 noise, output as a sparse `TerrainColumn`.

## Invariants

- Density formula: `surface(x, z) = 64 + 12 · fbm(2D noise)`; `density(x, y, z) = (surface - y) / 32
  + 0.25 · noise3D(x, y, z)`; solid when `density > 0`.
- Classification: solid → stone; air below `seaLevel` → water; `y === minY` → bedrock.
- Loop order fixed: local x, local z, then y ascending (deterministic).
- Output sparse: only non-air cells; index `x + 16 · (y - minY) + 16 · height · z`.
- `surfaceHeightAt` returns the highest solid y; `minY - 1` when a column has no solid cell.

## API and data model

```ts
// src/worldgen/OverworldTerrain.ts (NEW)
export interface OverworldTerrainConfig {
  worldSeed: number;
  minY: number;   // default -64
  maxY: number;   // default 320 (exclusive)
  seaLevel: number; // default 63
}
export interface TerrainBlockIds { stone: number; water: number; bedrock: number; }
export const DEFAULT_TERRAIN_BLOCK_IDS: TerrainBlockIds; // { stone: 1, water: 8, bedrock: 7 }
export const DEFAULT_OVERWORLD_TERRAIN_CONFIG: Omit<OverworldTerrainConfig, 'worldSeed'>;
export class TerrainColumn {
  readonly columnX: number; readonly columnZ: number;
  getBlock(localX: number, localY: number, localZ: number): number | null;
  get blockCount(): number;
  surfaceHeightAt(localX: number, localZ: number): number;
}
export function generateTerrainColumn(
  seed: number, columnX: number, columnZ: number,
  config?: Partial<OverworldTerrainConfig>, ids?: Partial<TerrainBlockIds>,
): TerrainColumn;
```

## Control / data flow

1. The wiring (later) requests columns for chunk positions with the world seed.
2. `generateTerrainColumn` loops the 16×16×height volume, computes density, classifies, and
   stores non-air cells.
3. Consumers query blocks and surface heights (heightmaps, later stages).

## Detailed behavior

- Noise instances are derived from the seed: `ValueNoise3D(seed)` for the surface field and
  `ValueNoise3D(seed ^ 0x9e3779b9)` for detail — deterministic per seed.
- 2D surface sampling uses `noise.sample(wx · 0.01, 0, wz · 0.01)` (the y axis is constant).
- Config validation: integers, `minY < maxY`, `seaLevel` within `(minY, maxY)`; invalid configs
  throw.

## Failure modes

- Invalid configs/ids throw at generation time (descriptive).

## Compatibility / migration

Additive; the game's placeholder terrain is untouched (wiring is a later change).

## Performance / resource constraints

O(16 · 16 · height) density evaluations per column; sparse storage (air skipped).

## Testing seams

- `tests/unit/OverworldTerrain.test.ts` (NEW): determinism (same seed × 2, cross-column);
  seed sensitivity; classification invariants (stone/water/bedrock placement, nothing outside the
  volume); surface heights; index math (getBlock round-trip on a known cell); block counts;
  config validation.

## Observability / debugging

Columns expose `getBlock`/`surfaceHeightAt`; tests assert exact invariants.

## Affected files / symbols

- `src/worldgen/OverworldTerrain.ts` — NEW.
- `tests/unit/OverworldTerrain.test.ts` — NEW.

## Rejected alternatives

- *Dense block arrays*: 16·16·384 cells per column is wasteful; sparse maps keep generation and
  tests light.
- *Eager heightmaps*: `surfaceHeightAt` computes on demand; later stages may cache.

## Downstream dependencies

089 climate/biomes sample these columns; 091 surface rules replace top cells; the world wiring
stores columns into chunk storage.
