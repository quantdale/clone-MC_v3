# Design: 092-cave-carver-system

## Context / current state

088 produces solid terrain; 091 replaces surfaces. No 3D carving exists.

## Target state

`carveValue`/`carveColumn` provide a deterministic, configurable 3D carve mask independent of
terrain density; `applyCarving` removes carved cells from a `TerrainColumn` purely.

## Invariants

- `carveValue(seed, x, y, z) = fbm4(wide, x·0.02, y·0.02, z·0.02) − 0.4 · fbm3(detail,
  x·0.09, y·0.09, z·0.09)` with noise instances derived from the seed (XOR offsets).
- A cell is carved when `carveValue > threshold` (default 0.05).
- `CarvedColumn` is sparse (local index `x + 16·(y - minY) + 16·height·z`).
- `applyCarving` returns a new column: carved cells removed, everything else preserved; input
  untouched.

## API and data model

```ts
// src/worldgen/CaveCarver.ts (NEW)
export interface CaveCarverConfig {
  seed: number;
  threshold?: number;   // default 0.05
  minY?: number;        // default -64
  maxY?: number;        // default 320 (exclusive)
}
export function carveValue(seed: number, x: number, y: number, z: number): number;
export class CarvedColumn {
  readonly columnX: number; readonly columnZ: number;
  has(localX: number, worldY: number, localZ: number): boolean;
  get size(): number;
}
export function carveColumn(seed: number, columnX: number, columnZ: number, config?: Partial<CaveCarverConfig>): CarvedColumn;
export function applyCarving(column: TerrainColumn, carved: CarvedColumn): TerrainColumn;

// src/worldgen/OverworldTerrain.ts (additive)
export class TerrainColumn {
  removeCell(localX: number, worldY: number, localZ: number): void;
}
```

## Control / data flow

1. The wiring generates a column (088), then `carveColumn` per column, then `applyCarving`.
2. Carving is independent of the terrain density formula (its own noise fields).

## Detailed behavior

- Noise derivation: wide = `ValueNoise3D(seed ^ 0x9e3779b9)`, detail =
  `ValueNoise3D(seed ^ 0x85ebca6b)`.
- Carved cells are stored only for worldY in `[minY, maxY)`.
- `applyCarving` iterates the source column's footprint × height, copying non-carved cells into a
  new column (sparse copy).

## Failure modes

- Invalid configs throw (finite threshold, `minY < maxY`).

## Compatibility / migration

Additive; `TerrainColumn.removeCell` is a new method (088 tests extended).

## Performance / resource constraints

Carving = O(16·16·height) carve evaluations; apply = O(cells).

## Testing seams

- `tests/unit/CaveCarver.test.ts` (NEW): carveValue determinism/bounds; mask determinism,
  seed sensitivity, y-window confinement; has/size; applyCarving removal + purity; config
  validation; nonzero-carve fixture.
- `tests/unit/OverworldTerrain.test.ts`: `removeCell` behavior.

## Observability / debugging

Masks expose `has`; tests assert exact removals.

## Affected files / symbols

- `src/worldgen/CaveCarver.ts` — NEW.
- `src/worldgen/OverworldTerrain.ts` — `removeCell` (additive).
- Tests: `CaveCarver.test.ts` NEW; `OverworldTerrain.test.ts` extended.

## Rejected alternatives

- *Density-coupled carving*: the scope explicitly separates carving from terrain density.
- *Mutable carving*: pure application keeps columns immutable.

## Downstream dependencies

093 aquifers decide fluids in carved space; 084-style fixtures may cover carved columns later.
