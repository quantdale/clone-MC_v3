# Design: 024-chunk-column-storage

## Context / current state

023 provides a single `ChunkSection`. World storage needs a vertical column grouping sections by
(chunkX, chunkZ), with lazy allocation and dirty tracking for incremental saves.

## Target state

`src/world/ChunkColumn.ts` groups `sectionCount` `ChunkSection`s indexed by in-column section Y
(`[0, sectionCount)`), offset by `minSectionY`. Block get/set route from (localX, worldY, localZ) to
the correct section and local Y via 021's `sectionIndex`/`localCoord`. Untouched sections stay
materialized-on-write only. Dirty sections are tracked in a `Set<number>`.

## Invariants

- `getBlockState(x, worldY, z)` MUST equal the last `setBlockState(x, worldY, z, state)` at that coord.
- `sectionIndex(worldY) - minSectionY` MUST be the in-column section index; out-of-range MUST throw `RangeError`.
- Untouched sections MUST read as air and MUST NOT be materialized until written.
- A write to a section MUST add its in-column index to the dirty set; `clearDirty` MUST empty it.
- `serialize()` → `deserialize(..., sameRegistry, sameAirId)` MUST reproduce every written block and
  leave unwritten sections as air.

## API and data model

```ts
export interface ChunkColumnOptions {
  chunkX: number; chunkZ: number; sectionCount: number; minSectionY?: number;
  registry: BlockStateRegistry; airId?: BlockStateId;
}
export interface SerializedChunkColumn {
  version: number; chunkX: number; chunkZ: number;
  sectionCount: number; minSectionY: number;
  sections: Record<number, SerializedPalettedContainer>;
}

export class ChunkColumn {
  readonly chunkX: number; readonly chunkZ: number;
  readonly sectionCount: number; readonly minSectionY: number;
  constructor(options: ChunkColumnOptions);
  getSection(sy: number): ChunkSection;
  getBlockState(localX: number, worldY: number, localZ: number): BlockState;
  setBlockState(localX: number, worldY: number, localZ: number, state: BlockState): void;
  get isDirty(): boolean;
  dirtySectionIndices(): readonly number[];
  clearDirty(): void;
  serialize(): SerializedChunkColumn;
  static deserialize(data: SerializedChunkColumn, registry: BlockStateRegistry, airId?: BlockStateId): ChunkColumn;
}
```

## Control / data flow

`sectionIndexForY(worldY) = sectionIndex(worldY) - minSectionY`. `getBlockState` validates the index,
returns air if the section was never materialized, else `section.getStateAt(x, localY, z)`.
`setBlockState` validates, `ensureSection` (create-on-first-write), writes via `section.setAt`, and adds
the section index to the dirty set. `serialize` emits only materialized sections; `deserialize` rebuilds
each from its `SerializedPalettedContainer`.

## Detailed behavior

- `getSection(sy)` validates range then lazily materializes and caches an air `ChunkSection`.
- `localY = localCoord(worldY)` (negative-safe from 021).
- `isDirty` is true when the dirty set is non-empty.
- `deserialize` validates `version` and rebuilds sections from the record.

## Failure modes

- Out-of-range `worldY` (section index < 0 or ≥ `sectionCount`) → `RangeError`.
- `deserialize` with unknown `version` → `Error`.
- Air-id/registry mismatch at `deserialize` yields wrong states without throwing (caller contract).

## Compatibility / migration

Additive; serialization reuses 022's `SerializedPalettedContainer` per section.

## Performance / resource constraints

- Empty column holds a small `Map` (no section arrays). A written section is 2 KiB (4-bit) when uniform.
- `get`/`set` are O(1); serialization cost is proportional to written sections.

## Testing seams

`tests/unit/ChunkColumn.test.ts` covers air default + not-dirty, cross-section routing, out-of-range
throws, dirty tracking + clear, serialize/deserialize round-trip, version rejection, and untouched
sections remaining air after deserialize.

## Affected files / symbols

- `src/world/ChunkColumn.ts` (new)
- `tests/unit/ChunkColumn.test.ts` (new)

## Rejected alternatives

- **Fixed array of all sections**: wastes memory for empty columns; lazy `Map` is the compact choice.
- **String-keyed section map**: numeric keys keep serialization small and avoid parse ambiguity.
- **Storing whole sections unconditionally**: defeats empty-column compression.

## Downstream dependencies

025 (dimension height) supplies `sectionCount`/`minSectionY`. 026 (vertical world access) reads/writes
through columns. 029/035+ persist columns.
