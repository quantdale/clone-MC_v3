# Design: 067-skylight-propagation

## Context / current state

066 provides storage; no computation.

## Target state

`computeSkyLight(world)` initializes each column from the world top (15, −1 per air block downward,
stopping at the first opaque block, 0 below) and then propagates: a FIFO BFS where any non-opaque
cell with light `v` raises its six non-opaque neighbors to `v - 1` when they are darker. Deterministic
neighbor order: `-x, +x, -y, +y, -z, +z`.

## Invariants

- Initialization visits columns in `(x, z)` order, rows from the world top down.
- Opaque cells always have sky light 0.
- Propagation only raises values (each cell ≤ 15, ≥ 0), so the BFS terminates.
- Neighbor expansion order is fixed (`-x, +x, -y, +y, -z, +z`), FIFO queue — deterministic output.

## API and data model

```ts
// src/rendering/SkyLightEngine.ts
export interface SkyLightWorld {
  isOpaque(x: number, y: number, z: number): boolean;
  getSkyLight(x: number, y: number, z: number): number;
  setSkyLight(x: number, y: number, z: number, value: number): void;
  minY: number;      // lowest world Y of the lit volume
  maxY: number;      // highest world Y + 1 (world top)
}
export function computeSkyLight(world: SkyLightWorld): number; // returns cells set (nonzero)
```

## Control / data flow

1. `for (x, z)`: `v = 15`; walk `y` from `maxY - 1` down to `minY`: if opaque → set 0, stop the
   column; else set `v` (clamp ≥ 0) and `v--`.
2. Seed the BFS queue with every cell whose light is > 0.
3. Drain FIFO: for each cell with light `v`, for each neighbor in fixed order: if non-opaque and
   `neighborLight < v - 1`, set `v - 1` and enqueue.

## Detailed behavior

- The initializer writes `0` explicitly for opaque cells and the cells below the first opaque block
  (default storage is 0 anyway; writing is idempotent).
- The BFS only enqueues when a value increases, bounding total work at 15 × cells.

## Failure modes

- World accessor exceptions propagate (caller bug).

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

O(cells × 15) worst case; typical columns stop at the first opaque block.

## Testing seams

- `tests/unit/SkyLightEngine.test.ts` with an in-memory grid world:
  - open sky: top cell 15, −1 per block down to 0;
  - ground: air above ground lit 15..1 down to the surface; the opaque block and everything below 0;
  - overhang: a cave under an overhang receives reduced light via the open side (BFS);
  - determinism: two runs produce identical results;
  - opaque cells never lit.

## Observability / debugging

The returned count of lit cells plus per-cell reads expose the result.

## Affected files / symbols

- `src/rendering/SkyLightEngine.ts` — NEW.
- `tests/unit/SkyLightEngine.test.ts` — NEW.

## Rejected alternatives

- *Per-section independent lighting*: skylight crosses section boundaries; the engine computes over a
  vertical volume (sections later wire the world interface).

## Downstream dependencies

068 (block light) reuses the BFS pattern; 070 (light-aware meshing) samples the computed light; the
world wiring later adapts `SkyLightWorld` over chunk sections.
