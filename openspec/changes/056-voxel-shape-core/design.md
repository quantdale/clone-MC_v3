# Design: 056-voxel-shape-core

## Context / current state

Collision/selection assume full cubes (the player physics and raycast use cube tests). Non-cube
blocks need volume definitions.

## Target state

An immutable `VoxelShape` holding an ordered list of axis-aligned boxes in block-local unit
coordinates `[0, 1]³`, with composition (`union`), overlap/containment queries, and `maxY`, plus
`FULL_CUBE`/`EMPTY` constants.

## Invariants

- Every box is validated at construction: all six coordinates finite; `min ≤ max` per axis.
- Shapes are immutable: input arrays/boxes are copied, the stored list and each box are frozen.
- `union` returns a new shape (`[...this.boxes, ...other.boxes]`); neither input is mutated.
- `intersects(aabb)` is true when any box overlaps the query AABB (touching boundaries inclusive).
- `contains(x, y, z)` is true when the point lies inside any box (boundary inclusive).
- `maxY()` is the max `maxY` across boxes; `0` for the empty shape.
- `EMPTY` has zero boxes; `FULL_CUBE` is the unit cube `[0,0,0]..[1,1,1]`.

## API and data model

```ts
// src/world/VoxelShape.ts
export interface Aabb {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}
export class VoxelShape {
  static of(boxes: Aabb[]): VoxelShape;
  static get EMPTY(): VoxelShape;
  static get FULL_CUBE(): VoxelShape;
  get isEmpty(): boolean;
  get boxes(): readonly Aabb[];
  union(other: VoxelShape): VoxelShape;
  intersects(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean;
  contains(x: number, y: number, z: number): boolean;
  maxY(): number;
}
```

## Control / data flow

1. Block definitions (059+) construct shapes via `VoxelShape.of([...])` or reuse the constants.
2. Collision (057) tests an entity AABB against `shape.intersects(...)` per block;
   selection (058) uses `intersects` on the ray's cell AABB; occlusion uses `maxY`/full-cube checks.

## Detailed behavior

- `of` normalizes: copies each box, validates, freezes each box and the array.
- `union` concatenates box lists (no simplification — Minecraft keeps box lists).
- `intersects`: any box with pairwise `max >= min && min <= max` overlap on all three axes.
- `contains`: any box with `min <= p <= max` on all axes.

## Failure modes

- Non-finite coordinates or `min > max` → `Error` at construction.

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

Queries are O(boxes); typical shapes have 1-16 boxes.

## Testing seams

- `tests/unit/VoxelShape.test.ts`:
  - constants: FULL_CUBE contains (0.5,0.5,0.5) and not (1.5,...); EMPTY is empty, maxY 0;
  - validation: NaN/min>max throw;
  - immutability: mutating the input array/box after `of` does not change the shape;
  - union: box count is the sum; originals unchanged; result contains points of both;
  - intersects: overlapping, disjoint, and boundary-touching AABBs;
  - contains: inside/outside/boundary points;
  - maxY across a multi-box shape.

## Observability / debugging

`boxes` is directly inspectable.

## Affected files / symbols

- `src/world/VoxelShape.ts` — NEW.
- `tests/unit/VoxelShape.test.ts` — NEW.

## Rejected alternatives

- *Bitmask 16³ voxel grids*: memory-heavy and awkward for AABB queries; box lists are the standard
  Minecraft approach and compose naturally.

## Downstream dependencies

057 (player collision), 058 (raycast), and 059 (block models) consume shapes; 082 (fluid collision)
reuses them.
