# Design: 026-vertical-world-access

## Context / current state

024 `ChunkColumn` correctly routes a `(localX, worldY, localZ)` triple to the right in-column section
using 021 math, and 025 `DimensionType` derives `minSectionY` / `sectionCount` / `maxY` from a
dimension's extent. There is no world-level object that takes a flat `(x, y, z)` and a `DimensionType`
and yields those column coordinates. The legacy streaming `World.ts` still enforces a `y` slab of
`[0, CHUNK_HEIGHT)` and a single `cy === 0` chunk layer.

## Target state

`src/world/VerticalWorldAccess.ts` owns `Map<string, ChunkColumn>` and exposes dimension-aware
full-world block access with no 0–63 clamp.

## Invariants

- Horizontal chunking uses section width 16: `chunkX = floor(x / 16)`, `localX = ((x % 16) + 16) % 16`,
  same for Z; `worldY` is passed unchanged to the column (the column owns vertical section math).
- `minSectionY === dimension.minSectionY`; `sectionCount === dimension.sectionCount`.
- `getBlockState` returns air (a) when no column exists for `(chunkX, chunkZ)`, or (b) when
  `!dimension.containsY(y)`.
- `setBlockState` is a no-op when coordinates are non-integer, when `!dimension.containsY(y)`, or when
  `state` is not a valid `BlockState`.
- Columns are materialized lazily on first `setBlockState`; reads never create columns.
- The accessible vertical span is `[dimension.minY, dimension.maxY]` — never clamped to `[0, 64)`.

## API and data model

```ts
export interface VerticalWorldAccessOptions {
  dimension: DimensionType;
  registry: BlockStateRegistry;
  airId?: BlockStateId;
}

export interface SerializedChunkColumns {
  version: number;
  minSectionY: number;
  sectionCount: number;
  columns: SerializedChunkColumn[];
}

export class VerticalWorldAccess {
  readonly dimension: DimensionType;
  readonly registry: BlockStateRegistry;
  constructor(opts: VerticalWorldAccessOptions);

  hasColumn(chunkX: number, chunkZ: number): boolean;
  getColumn(chunkX: number, chunkZ: number): ChunkColumn | undefined;
  ensureColumn(chunkX: number, chunkZ: number): ChunkColumn;
  removeColumn(chunkX: number, chunkZ: number): boolean;
  get size(): number;
  columns(): IterableIterator<ChunkColumn>;

  getBlockState(x: number, y: number, z: number): BlockState;
  setBlockState(x: number, y: number, z: number, state: BlockState): void;

  get isDirty(): boolean;
  dirtyColumns(): ChunkColumn[];
  clearDirty(): void;

  serialize(): SerializedChunkColumns;
  static deserialize(
    data: SerializedChunkColumns,
    registry: BlockStateRegistry,
    dimension: DimensionType,
    airId?: BlockStateId,
  ): VerticalWorldAccess;
}
```

## Control / data flow

Construction derives `minSectionY`/`sectionCount` from `dimension` and stores `airId`
(`registry.getDefaultState(0).id` unless overridden). `getBlockState` first validates
`Number.isInteger(x|y|z)`; if invalid, returns the air state. It then computes the column key; if the
column is missing, returns air. If `!dimension.containsY(y)`, returns air. Otherwise it delegates to
`column.getBlockState(localX, y, localZ)`.

`setBlockState` validates integers and `state`; if `!dimension.containsY(y)` or no column and the write
is a no-op candidate it still lazily creates when in range. On a valid in-range write it calls
`ensureColumn` then `column.setBlockState(localX, y, localZ, state)`.

## Detailed behavior

- Column key: `` `${chunkX},${chunkZ}` `` (2-D, since a column spans all Y).
- `ensureColumn` builds a `ChunkColumn({ chunkX, chunkZ, sectionCount, minSectionY, registry, airId })`
  and stores it; `getColumn` returns the existing one or `undefined`.
- `isDirty` is true iff any column is dirty; `dirtyColumns()` lists them; `clearDirty()` clears each.
- `serialize()` emits `SerializedChunkColumns` with `minSectionY`/`sectionCount` and each column's
  `serialize()`; `deserialize()` asserts the stored `minSectionY`/`sectionCount` match `dimension`,
  then rebuilds columns via `ChunkColumn.deserialize`.

## Failure modes

- Out-of-range `y` → `getBlockState` returns air, `setBlockState` no-ops (no throw).
- Non-integer coordinates → `getBlockState` returns air, `setBlockState` no-ops.
- `deserialize` with mismatched `minSectionY`/`sectionCount` → throws (data/code drift guard).
- Writes never reach the column for out-of-range Y, so the column's `RangeError` is never triggered.

## Compatibility / migration

Additive; the legacy `World.ts` streaming path is unaffected.

## Performance / resource constraints

O(1) per access (map get + column delegation). Empty world = zero columns. Memory scales with the set
of touched columns (bounded by gameplay/loading in later changes).

## Testing seams

`tests/unit/VerticalWorldAccess.test.ts` covers: air default over full range; negative and high Y
read/write (e.g. overworld y = −64 and y = 319); cross-column routing across chunk boundaries; out-of-
range / non-integer guards; lazy column creation; `hasColumn`/`ensureColumn`/`size`; dirty aggregation
and `clearDirty`; and `serialize`/`deserialize` round-trip preserving high/negative-Y blocks.

## Affected files / symbols

- `src/world/VerticalWorldAccess.ts` (new)
- `tests/unit/VerticalWorldAccess.test.ts` (new)

## Rejected alternatives

- **Rewire legacy `World.ts` now**: a large, risky streaming refactor that belongs to a later change;
  this change delivers the dimension-aware data path in isolation.
- **Clamp Y to a fixed slab**: contradicts the change's purpose; the dimension range is the only bound.
- **Per-column chunk-key with `cy`**: unnecessary; a column already spans all Y via sections.

## Downstream dependencies

027 (vertical neighbor dirtying) and later chunk-manager/dimension-manager work build on this facade.
