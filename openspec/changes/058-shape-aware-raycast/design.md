# Design: 058-shape-aware-raycast

## Context / current state

`raycastVoxel` (DDA) selects full cubes. 056 provides selection shapes per block.

## Target state

`raycastSelection` walks the voxel grid with the Amanatides & Woo DDA (same stepping as
`raycastVoxel`) and, for each visited cell, intersects the ray with the cell's selection shape boxes
via the slab method. The nearest hit (first cell with any box hit, since cells are visited in
increasing entry-`t` order) is returned with cell coords, entry-face normal, exact point, and
distance.

## Invariants

- Cells are visited in increasing entry-`t` order; the first cell with a box hit yields the nearest
  hit (later cells cannot contain nearer hits).
- EMPTY cells never hit; a non-empty cell hits only where the ray crosses an actual box.
- The returned normal is the entered face's normal, pointing toward the ray origin (DDA convention:
  `-sign(dir)` on the entry axis); a hit inside the starting cell at t = 0 returns a zero normal.
- `maxDistance` bounds the search (in world units, using the normalized direction).
- Zero-length directions, non-finite inputs, and negative `maxDistance` return `null`.

## API and data model

```ts
// src/world/ShapeRaycast.ts
export interface SelectionShapeWorld {
  getSelectionShape(x: number, y: number, z: number): VoxelShape;
}
export interface ShapeRayHit {
  blockX: number; blockY: number; blockZ: number;
  nx: number; ny: number; nz: number;
  pointX: number; pointY: number; pointZ: number;
  distance: number;
}
export function raycastSelection(
  world: SelectionShapeWorld,
  originX: number, originY: number, originZ: number,
  dirX: number, dirY: number, dirZ: number,
  maxDistance: number,
): ShapeRayHit | null;
```

## Control / data flow

1. Normalize the direction; guard degenerate inputs.
2. Initialize the DDA state (cell, step, tMax/tDelta) exactly as `raycastVoxel`.
3. For the starting cell, and then each stepped cell in order:
   - `shape = world.getSelectionShape(x, y, z)`; skip when empty.
   - For each box (translated to world coordinates), compute the ray-box entry `t` and entry axis via
     the slab method (zero-direction axes handled by containment checks).
   - Keep the box with the smallest `t >= 0`.
   - If any box hit with `t <= maxDistance`, return the hit (cell coords, normal from the entry axis,
     exact point `origin + dir * t`, distance `t`).
4. Stop when the next cell's entry `t > maxDistance`; return `null`.

## Detailed behavior

- Slab method per box:
  - For each axis with `|dir| >= EPS`: `t1 = (min - o)/d`, `t2 = (max - o)/d`, order them; track the
    max entry (with its axis) and the min exit; reject when `tMin > tMax`.
  - For axes with `|dir| < EPS`: require `min <= o <= max` (contained on that axis).
  - Entry `t = max(tMin, 0)`; the entry axis is the one that produced `tMin` (when tMin < 0, the hit
    starts inside the box on that axis; the returned axis is the stored entry axis).
- The starting cell is checked first (a hit at t = 0 with the zero normal, mirroring `raycastVoxel`).

## Failure modes

- Degenerate/non-finite inputs → `null`.
- Box fully behind the ray (`tMax < 0`) → no hit for that box.

## Compatibility / migration

Additive; `raycastVoxel` remains untouched for its consumers.

## Performance / resource constraints

O(cells × boxes per cell); the DDA bounds the cells by the ray path and `maxDistance`.

## Testing seams

- `tests/unit/ShapeRaycast.test.ts` with fixture worlds built from `VoxelShape`:
  - full cube: near-face hit with correct distance/normal/point; far-face-only when starting inside;
  - slab: a ray at y = 0.25 hits the slab side face; a ray at y = 0.75 passes through the cell (no
    hit) — shape-aware;
  - nearest cell: two cubes along the ray, the nearer is returned;
  - maxDistance: a hit beyond the limit returns null; a hit within returns it;
  - degenerate inputs: zero-length direction, NaN, negative maxDistance → null;
  - entry normal sign matches the ray direction (e.g. +X ray → nx = -1).

## Observability / debugging

The hit point/distance/normal fully describe the interaction point.

## Affected files / symbols

- `src/world/ShapeRaycast.ts` — NEW.
- `tests/unit/ShapeRaycast.test.ts` — NEW.

## Rejected alternatives

- *Per-box DDA re-march*: unnecessary; cell traversal + per-box slab intersection is the standard
  Minecraft approach and reuses the proven stepping.

## Downstream dependencies

`PlayerInteraction` (later wiring) uses `raycastSelection` for targeting; 142 (projectiles) reuse the
same primitive for entity-adjacent hits.
