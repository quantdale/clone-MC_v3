# Design: 069-incremental-light-updates

## Context / current state

067/068 compute light from scratch; edits need incremental updates.

## Target state

`updateLightAfterEdit(world, x, y, z)` runs a removal phase and a re-add phase per light type
(sky, block), both deterministic (fixed neighbor order, FIFO). The result equals a full recompute of
the edited world.

## Invariants

- Removal: BFS from the edited cell; a neighbor strictly darker than the removed path's level is
  zeroed and enqueued; cells with independent light (≥ level) are left for re-add. Opaque cells block
  the BFS.
- Re-add: BFS from every surviving lit cell (value `v` raises non-opaque neighbors to `v - 1` when
  darker), after re-seeding block-light sources (`getLuminance`, clamped to 15).
- Both phases use the fixed neighbor order `-x, +x, -y, +y, -z, +z`.
- Equivalence: the post-edit world updated via `updateLightAfterEdit` matches `computeSkyLight` +
  `computeBlockLight`.

## API and data model

```ts
// src/rendering/LightUpdateEngine.ts
export interface LightUpdateWorld {
  isOpaque(x: number, y: number, z: number): boolean;
  getLuminance(x: number, y: number, z: number): number;
  getSkyLight(x: number, y: number, z: number): number;
  setSkyLight(x: number, y: number, z: number, value: number): void;
  getBlockLight(x: number, y: number, z: number): number;
  setBlockLight(x: number, y: number, z: number, value: number): void;
  minY: number;
  maxY: number;
}
export function updateLightAfterEdit(world: LightUpdateWorld, x: number, y: number, z: number): void;
```

## Control / data flow

1. `removeLightType(world, 'sky', x, y, z)` and `removeLightType(world, 'block', x, y, z)`: the
   classic removal BFS (zero cells with `0 < value < pathLevel`; do not cross opaque cells).
2. Re-seed block sources: every cell with `getLuminance > 0` gets `min(15, luminance)` (restores
   zeroed sources; newly placed sources start).
3. `propagate(world, type)` for each type: BFS from all cells with value > 0 (falloff).

## Detailed behavior

- Removal start: if the edited cell's light is 0 (e.g., a hole opened below an opaque surface), the
  removal phase is a no-op and re-add fills the hole from surviving lit cells.
- Re-add is bounded (values only increase, ≤ 15).
- Sources always win: seeding happens before propagation, and propagation never lowers values.

## Failure modes

- World accessor exceptions propagate (caller bug).

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

Removal is local to the affected region; re-add is O(cells × 15) worst case but typically small.

## Testing seams

- `tests/unit/LightUpdateEngine.test.ts` with an in-memory grid world:
  - place an opaque block in open air → cells behind it darken; equivalence with full recompute;
  - break an opaque block (open a hole) → light fills in; equivalence;
  - place a light source → propagation; equivalence;
  - determinism across identical edits.

## Observability / debugging

Per-cell reads expose the result; equivalence tests are the correctness oracle.

## Affected files / symbols

- `src/rendering/LightUpdateEngine.ts` — NEW.
- `tests/unit/LightUpdateEngine.test.ts` — NEW.

## Rejected alternatives

- *Full recompute per edit*: non-local and wasteful; the two-phase incremental update is the standard
  approach and provably equivalent (tested).

## Downstream dependencies

The world wiring (later) calls `updateLightAfterEdit` on block changes; 070 (light-aware meshing)
samples the updated values.
