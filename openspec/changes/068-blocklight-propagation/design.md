# Design: 068-blocklight-propagation

## Context / current state

067 computes skylight; block light from emitters is missing.

## Target state

`computeBlockLight(world)` seeds every cell whose `getLuminance` is > 0 with that value (clamped to
15), then runs the same FIFO BFS as 067: a cell with value `v` raises non-opaque neighbors to `v - 1`
when darker. Sources always win (propagation never reduces a source's value).

## Invariants

- Seed order: `(x, z)` columns, then `y` ascending — deterministic queue order.
- Sources: `setBlockLight(lum)` regardless of opacity (glowstone is opaque but emits).
- Propagation only raises values (≤ 15), so the BFS terminates.
- Neighbor order fixed: `-x, +x, -y, +y, -z, +z`.
- A source cell's final value equals its luminance (never lowered by propagation).

## API and data model

```ts
// src/rendering/BlockLightEngine.ts
export interface BlockLightWorld {
  getLuminance(x: number, y: number, z: number): number; // 0 = not a source
  isOpaque(x: number, y: number, z: number): boolean;
  getBlockLight(x: number, y: number, z: number): number;
  setBlockLight(x: number, y: number, z: number, value: number): void;
  minY: number;
  maxY: number; // world top + 1
}
export function computeBlockLight(world: BlockLightWorld): number; // cells set > 0
```

## Control / data flow

1. Seed: for every cell, `lum = getLuminance(x, y, z)`; if `lum > 0`, set block light to
   `min(lum, 15)` and enqueue.
2. BFS: drain FIFO; for value `v > 1`, for each neighbor in fixed order: skip opaque or out-of-range;
   if `neighborLight < v - 1`, set `v - 1` and enqueue (this also preserves source values — a source
   already holds its luminance, which is ≥ any propagated value it could receive... unless a neighbor
   source is brighter: propagation would set the source cell to v-1 < its own luminance, which is
   skipped by the `<` comparison).

## Detailed behavior

- Cells not reached stay 0 (storage default).
- Luminance values > 15 are clamped to 15.

## Failure modes

- World accessor exceptions propagate (caller bug).

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

O(cells × 15) worst case; typical emitters are sparse.

## Testing seams

- `tests/unit/BlockLightEngine.test.ts` with an in-memory grid world:
  - a torch (lum 14) in an open room: falloff −1 per block to 0 at distance 14;
  - glowstone (lum 15) placed as an opaque cell: the source reads 15 (opaque source emits);
  - corner: light bends around an opaque wall into an adjacent cell;
  - wall: an opaque wall blocks propagation;
  - determinism: identical worlds → identical results.

## Observability / debugging

The returned count of lit cells plus per-cell reads expose the result.

## Affected files / symbols

- `src/rendering/BlockLightEngine.ts` — NEW.
- `tests/unit/BlockLightEngine.test.ts` — NEW.

## Rejected alternatives

- *Merging into 067*: sources are a distinct seeding model; a separate engine keeps each change
  narrow.

## Downstream dependencies

069 (incremental updates) reuses the BFS pattern; 070 (light-aware meshing) samples both light types;
content (125+) defines luminances.
