# Design: 181-end-world-generation

## Context/current state
- 088 established the terrain-column shape; 176 applied it to the Nether (dimension-specific rules,
  parameterized ids, documented placeholder). 180 defined `END_DIMENSION_TYPE` (0..255). 181
  applies the same pattern to the End — the void dimension.

## Target state
- `src/worldgen/EndTerrain.ts` holding the End config/ids defaults and `generateEndColumn`.

## Invariants
- Defaults: `minY 0`, `maxY 256` (180's End bounds); config validation requires
  `minY < maxY` (integers).
- The main island exists only near the origin: cells are end-stone where
  `wx² + (wy − 64)² + wz² < radius²` with `radius = 45 + 10·fbm(wx, wz)`; fbm3D's 4-octave range
  (±1.875) bounds the island to roughly y ∈ [0, 127].
- Outer islands: only columns with `|centerX| ≥ 1000` or `|centerZ| ≥ 1000` AND
  `fbm(center) > 0.35` carry a blob of radius `12·(0.5 + 0.5·|noise|)` around y=64.
- Everything else is air (the void); water never appears; cells stay inside the column volume.
- Deterministic per (seed, columnX, columnZ).

## API and data model
```ts
// src/worldgen/EndTerrain.ts (new)
export interface EndTerrainConfig { worldSeed: number; minY: number; maxY: number; }
export interface EndTerrainBlockIds { endStone: number; }
export const DEFAULT_END_TERRAIN_CONFIG: Omit<EndTerrainConfig, 'worldSeed'>;  // 0..256
export const DEFAULT_END_TERRAIN_BLOCK_IDS: EndTerrainBlockIds;  // endStone: 1 (placeholder, 215 handoff)
export const END_MAIN_ISLAND_CENTER_Y = 64;
export const END_MAIN_ISLAND_BASE_RADIUS = 45;
export const END_MAIN_ISLAND_RADIUS_VARIATION = 10;
export const END_OUTER_ISLAND_DISTANCE = 1000;
export const END_OUTER_ISLAND_THRESHOLD = 0.35;
export const END_OUTER_ISLAND_RADIUS = 12;
export function generateEndColumn(
  seed: number, columnX: number, columnZ: number,
  config?: Partial<EndTerrainConfig>, ids?: Partial<EndTerrainBlockIds>,
): TerrainColumn;
```

## Control/data flow
1. A wiring change (182's portal progression) calls `generateEndColumn` per column in the End
   dimension, exactly as 176's Nether column is consumed.
2. The main island column (0, 0) hosts the dragon-fight arena (183); outer islands host End cities
   (a later content change).

## Detailed behavior
- Each column classifies itself once: origin-region (main island radius applies) vs outer region
  (per-column island decision). Every cell then tests the sphere against the applicable radius —
  O(16×16×256) sphere tests with O(1) noise.
- The endStone id is a parameter exactly like 176's netherrack was; 215 registers the real block and
  the default flips (the documented handoff).

## Failure modes
- Invalid configs throw a descriptive `Error` before generation; valid inputs never throw and never
  emit out-of-range cells.

## Compatibility/migration
- One new worldgen file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- One column = 65 536 sphere tests (~0.5 s for the whole suite).

## Testing seams
- Tests use the real `TerrainColumn` and `END_DIMENSION_TYPE`; assertions are structural (void,
  island presence/profile, blob bounds, determinism, custom ids).

## Observability/debugging
- `TerrainColumn.blockCount` and per-cell lookups make columns inspectable; constants exported.

## Affected files/symbols
- `src/worldgen/EndTerrain.ts` (new).
- Tests: `tests/unit/EndTerrain.test.ts` (new). No other files.

## Rejected alternatives
- **Golden-hash assertions**: rejected — structural invariants pin the rules (same reasoning as
  176).
- **Registering end_stone now**: rejected — content registration is 215's change; the parameterized
  id + documented handoff is the established pattern.
- **Modeling the obsidian platform/pillars now**: rejected — they belong to 182/183.

## Downstream dependencies
- 182 (`end-portal-progression`) opens into the main island; 183 (dragon) uses the island as the
  arena; 184 (exit progression) completes the loop; 215 registers end_stone and flips the default.
