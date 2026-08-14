# Design: 023-chunk-section-storage

## Context / current state

Vertical-world work needs a per-section block-state holder. There is no section object yet; 022
provides the paletted container and 007 provides block-state runtime ids.

## Target state

`src/world/ChunkSection.ts` holds one 16×16×16 section of block states in a
`PalettedContainer<BlockStateId>` (default = air state id). It exposes slot/coordinate get/set, bulk
`fill`, `isEmpty`, `nonAirCount`, and deterministic serialize/deserialize.

## Invariants

- `ChunkSection` MUST store exactly `SECTION_VOLUME = 4096` block states.
- Default slot value MUST be the air block-state id (`BlockStateRegistry.getDefaultState(BlockId.Air).id`).
- `getState(i)` MUST equal the last `set(i, state)` (or `setStateId(i, id)`) value.
- `getStateAt(x,y,z)` MUST equal `getState(localIndex(x,y,z))`.
- `isEmpty()` MUST be true iff every slot is air (single-entry palette).
- `serialize()` → `deserialize(..., sameRegistry, sameAirId)` MUST reproduce every slot.

## API and data model

```ts
export class ChunkSection {
  constructor(index: number, registry: BlockStateRegistry, airId?: BlockStateId);
  getStateId(localIndex: number): BlockStateId;
  getState(localIndex: number): BlockState;
  getStateIdAt(x: number, y: number, z: number): BlockStateId;
  getStateAt(x: number, y: number, z: number): BlockState;
  set(localIndex: number, state: BlockState): void;
  setStateId(localIndex: number, id: BlockStateId): void;
  setAt(x: number, y: number, z: number, state: BlockState): void;
  fill(state: BlockState): void;
  isEmpty(): boolean;
  nonAirCount(): number;
  serialize(): SerializedPalettedContainer;
  static deserialize(data: SerializedPalettedContainer, index: number, registry: BlockStateRegistry, airId?: BlockStateId): ChunkSection;
}
```

## Control / data flow

Construction builds a `PalettedContainer<BlockStateId>` (default = air id). `set` writes the state id
into the underlying paletted container; `getState` resolves that id back to a `BlockState` via the
registry. Coordinate helpers convert via `localIndex` from 021. `serialize`/`deserialize` delegate to
the paletted container; `deserialize` rebuilds with matching `airId`.

## Detailed behavior

- `isEmpty()` returns `storage.paletteSize === 1` — the single-entry palette is the compact empty
  representation; no scan required.
- `nonAirCount()` scans 4096 slots comparing stored id to `airId` (cheap, O(4096)).
- `fill(state)` sets all 4096 slots to `state.id`.
- Out-of-range local indices propagate `RangeError` from the underlying `PackedIntegerArray`.

## Failure modes

- `deserialize` with a mismatched `airId` yields wrong states but no exception; correctness is the
  caller's responsibility (documented). Round-trip tests guard against regressions.
- Out-of-range index → `RangeError` (from 022).

## Compatibility / migration

Additive; no persisted or call-site changes. Serialization shape is 022's `SerializedPalettedContainer`.

## Performance / resource constraints

- Storage: 4-bit single-entry palette for an empty section = `ceil(4096*4/32)*4 = 2 KiB`, all zeros.
- `get`/`set` are O(1) (palette + bit-pack lookup). `fill` and `nonAirCount` are O(4096).

## Testing seams

`tests/unit/ChunkSection.test.ts` covers empty section, single/boundary sets, coordinate set/get,
`fill` + `nonAirCount`, partial non-air counts, and serialize/deserialize round-trips (incl. full
section).

## Affected files / symbols

- `src/world/ChunkSection.ts` (new)
- `tests/unit/ChunkSection.test.ts` (new)

## Rejected alternatives

- **Per-block object array**: wastes memory and prevents compact deterministic serialization (rejected;
  the whole point of 022).
- **Map of non-air coords only**: fast for sparse sections but complicates serialization/iteration and
  breaks the uniform paletted model; deferred.
- **Storing `BlockState` objects in the palette**: objects are not serializable; storing ids keeps
  serialization numeric and registry-driven.

## Downstream dependencies

024 (chunk-column storage) groups multiple `ChunkSection`s by X/Z. 026 (vertical world access) reads
through sections.
