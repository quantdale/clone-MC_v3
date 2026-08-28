# Design: 057-shape-aware-player-collision

## Context / current state

Player movement assumes full cubes. 056 provides per-block `VoxelShape`s.

## Target state

A `CollisionResolver` moves an axis-aligned `CollisionBox` through a `ShapeWorld` with axis-separated
resolution (X → Y → Z), face snapping against each block's shape boxes, and per-axis collision flags.

## Invariants

- Resolution order is X, then Y, then Z; each axis is resolved independently.
- A collision on an axis stops that axis (position clamped to the shape face ± epsilon) and sets the
  axis flag; other axes still move.
- `collides(world, box)` is true when any shape box in any overlapped cell intersects the box
  (boundary-inclusive per 056).
- Cells queried are those overlapped by the box expanded by `epsilon` on all sides.
- All math is deterministic (no timers, no randomness).

## API and data model

```ts
// src/world/CollisionResolver.ts
export interface ShapeWorld {
  getCollisionShape(x: number, y: number, z: number): VoxelShape;
}
export interface CollisionBox {
  x: number; y: number; z: number;
  width: number; height: number; depth: number;
}
export interface MovementResult {
  x: number; y: number; z: number;
  collidedX: boolean; collidedY: boolean; collidedZ: boolean;
}
export class CollisionResolver {
  constructor(opts?: { epsilon?: number });
  move(world: ShapeWorld, box: CollisionBox, dx: number, dy: number, dz: number): MovementResult;
  collides(world: ShapeWorld, box: CollisionBox): boolean;
}
```

## Control / data flow

1. Physics computes the desired delta `(dx, dy, dz)` and calls `move`.
2. `move` applies each axis in order:
   - Tentatively advance the axis by its delta.
   - For every cell overlapped by the (epsilon-expanded) box, for every shape box (translated to
     world coordinates), if the shape box overlaps on the other two axes, clamp the moving axis to the
     facing boundary and set the axis flag.
   - Apply the clamped axis; continue with the next axis.
3. `collides` is the same overlap test without movement.

## Detailed behavior

- Epsilon (default `0.001`): the box is expanded by epsilon when *querying* cells, but face snapping
  keeps the entity `epsilon` away from the shape surface to avoid sticky overlap.
- Moving positive on an axis: allowed max = shape.min − epsilon. Moving negative: allowed min =
  shape.max + epsilon. The position is the extremum that still avoids overlap (Minecraft-style).
- Per-axis resolution uses the already-resolved other axes.

## Failure modes

- Degenerate boxes (non-positive width/height/depth) → `RangeError`.
- Empty `ShapeWorld` cells (EMPTY shape) never collide.

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

Per axis: O(cells × boxes per cell); typical entities span 1-4 cells with 1-16 boxes.

## Testing seams

- `tests/unit/CollisionResolver.test.ts` with fixture worlds built from `VoxelShape.of`:
  - full-cube wall: horizontal move stops at the wall face, `collidedX` true, Y/Z pass through;
  - floor: falling stops at the floor top, `collidedY` true;
  - slab (shape `[0,0,0]..[1,0.5,1]`): an entity at slab height stops at y = 0.5 (shape-aware, not
    full cube);
  - axis separation: a diagonal move into a wall stops X while Y/Z continue;
  - empty space: unrestricted movement, no flags;
  - `collides`: inside/outside a full cube and a slab.

## Observability / debugging

`MovementResult` exposes the final position and per-axis flags.

## Affected files / symbols

- `src/world/CollisionResolver.ts` — NEW.
- `tests/unit/CollisionResolver.test.ts` — NEW.

## Rejected alternatives

- *Swept AABB with ray math*: more precise but complex; axis-separated stepping with face snapping is
  the standard, deterministic Minecraft approach and is fully testable.

## Downstream dependencies

The game's `PlayerPhysics` (later wiring) adopts `CollisionResolver`; 130 (entity physics) reuses it;
082 (fluid collision) extends the same box model.
