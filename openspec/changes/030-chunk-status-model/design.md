# Design: 030-chunk-status-model

## Context / current state

024 `ChunkColumn` groups `ChunkSection`s and, across 027/028/029, tracks dirty sections, per-section mesh version,
and surface/motion-blocking heightmaps — all runtime-derived state about a column's *current contents and render
readiness*. There is no field describing *generation progress*: whether the column has been carved, filled with
blocks, lit, etc. Visibility/meshing is separate from generation, but nothing formalizes that split.

## Target state

An explicit ordered `ChunkStatus` lifecycle (generation axis only) with pure ordering helpers, and a per-column
`status` on `ChunkColumn` that generation code advances monotonically. Status is independent of `isDirty`,
`sectionMeshVersion`, and heightmaps.

## Invariants

- `ChunkStatus` MUST be a totally ordered finite set from `Empty` to `Full`; `chunkStatusOrdinal` MUST be strictly
  increasing along that order.
- `isChunkStatusAtLeast(s, min)` MUST equal `chunkStatusOrdinal(s) >= chunkStatusOrdinal(min)`.
- `ChunkColumn.getStatus()` MUST start at `Empty` for a fresh column.
- `setStatus(s)` MUST assign `s` directly; `advanceStatusTo(s)` MUST set the status to `max(current, s)` (never
  backward).
- Status MUST be runtime-only: `serialize`/`deserialize` MUST NOT carry it (a deserialized column restarts at
  `Empty`).

## API and data model

```ts
// src/world/ChunkStatus.ts (new)
export const enum ChunkStatus { Empty, StructureStarts, StructureReferences, Biomes, Noise,
  Surface, Carvers, LiquidCarvers, Blocks, Fluids, Light, Spawn, Features, Full }
export function chunkStatusOrdinal(s: ChunkStatus): number;
export function isChunkStatusAtLeast(s: ChunkStatus, min: ChunkStatus): boolean;
export function compareChunkStatus(a: ChunkStatus, b: ChunkStatus): number;
export function chunkStatusName(s: ChunkStatus): string;

// 024 ChunkColumn (additive)
export class ChunkColumn {
  getStatus(): ChunkStatus;
  setStatus(s: ChunkStatus): void;
  advanceStatusTo(s: ChunkStatus): void;
}
```

## Control / data flow

Generation code calls `advanceStatusTo(next)` as each lifecycle stage completes; `getStatus()` lets callers decide
what work remains. `setStatus` exists for exact assignment (e.g. resetting to `Empty` after a full unload/regen).
`advanceStatusTo` clamps to the current value so a stale or out-of-order stage cannot regress the column.

## Detailed behavior

- Default `Empty`; serialization byte layout unchanged; `deserialize` produces a column at `Empty` (callers re-run
  generation to bring it back up to the needed stage).
- Status is orthogonal to `isDirty` (pending mesh/save), `sectionMeshVersion` (stale-mesh guard), and heightmaps
  (content-derived). A `Full` column may still be dirty or unmeshed; an `Empty` column has no sections.

## Failure modes

- `advanceStatusTo` with a lower stage → no change (monotonic guard).
- Reading status of a freshly deserialized column → `Empty` (intentional; generation re-runs).

## Compatibility / migration

Additive; no persisted or call-site changes.

## Performance / resource constraints

O(1) status read/assign/advance; one enum per column; no allocation on read.

## Testing seams

`tests/unit/ChunkStatus.test.ts` covers: ordinal ordering, `isAtLeast`, `compare`, name mapping, `ChunkColumn`
default `Empty`, `setStatus`, monotonic `advanceStatusTo`, and serialize non-persistence.

## Affected files / symbols

- `src/world/ChunkStatus.ts` (new)
- `src/world/ChunkColumn.ts` (add `status` + `getStatus`/`setStatus`/`advanceStatusTo`)
- `tests/unit/ChunkStatus.test.ts` (new)

## Rejected alternatives

- **Status as a string/registry entry**: overkill; the lifecycle is fixed and ordered, not data-loaded.
- **Persist status**: redundant; generation re-derives it from world data, and persisting would add migration risk.
- **Couple status to visibility/mesh**: the entire point of this change is to separate them.

## Downstream dependencies

031 (`chunk-ticket-model`) and the worldgen/streaming changes (033+) consume `getStatus`/`advanceStatusTo` to
decide what generation work a column still needs.
