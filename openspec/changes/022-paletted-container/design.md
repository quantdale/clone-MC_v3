# Design: 022-paletted-container

## Context / current state

Chunk-section storage (023) needs compact, serializable block-state storage. There is no shared
paletted/bit-packed primitive yet; chunk data currently uses unrelated structures.

## Target state

`src/data/PalettedContainer.ts` provides:

- `PackedIntegerArray` — packs `capacity` values of `bitsPerEntry` width into 32-bit words, with
  `get`/`set`/`resize`/`serialize`.
- `PalettedContainer<T>` — de-duplicates values into a runtime palette (ordinal → value via
  `keyOf`), stores slot ordinals in a `PackedIntegerArray`, widens `bitsPerEntry` automatically as
  the palette grows, and serializes deterministically.

## Invariants

- `bitsPerEntry` MUST stay within `[MIN_PALETTE_BITS=4, MAX_PALETTE_BITS=16]`.
- Distinct values MUST map to distinct palette ordinals; equal values (`keyOf` equal) MUST share one.
- A slot's stored value MUST always equal the last value `set` at that slot.
- After growing the palette past `2^bits`, `bitsPerEntry` MUST increase to `max(4, ceil(log2(paletteSize)))`
  and every stored ordinal MUST remain valid (ordinal assignment is append-only, so widths can re-pack).
- `serialize()` → `deserialize()` MUST be an exact identity on all slots and palette size.

## API and data model

```ts
export const MIN_PALETTE_BITS = 4;
export const MAX_PALETTE_BITS = 16;
export const PALETTED_CONTAINER_VERSION = 1;

export interface PalettedContainerOptions<T> {
  capacity?: number;          // default SECTION_VOLUME (4096)
  defaultValue: T;
  bitsPerEntry?: number;      // default 4, clamped to [4,16]
  keyOf?: (value: T) => string | number;        // identity for numbers
  encode?: (value: T) => number;                // identity for numbers
  decode?: (id: number) => T;                    // identity for numbers
}

export interface SerializedPalettedContainer {
  version: number;
  capacity: number;
  bitsPerEntry: number;
  palette: number[];   // encode(value) for each palette entry
  storage: number[];   // packed words
}

export class PackedIntegerArray {
  constructor(bitsPerEntry: number, capacity: number, words?: number[]);
  get(index: number): number;
  set(index: number, value: number): void;
  resize(bitsPerEntry: number): void;
  serialize(): number[];
  static deserialize(bitsPerEntry: number, capacity: number, words: number[]): PackedIntegerArray;
}

export class PalettedContainer<T> {
  constructor(options: PalettedContainerOptions<T>);
  get(index: number): T;
  set(index: number, value: T): void;
  get bitsPerEntry(): number;
  get paletteSize(): number;
  serialize(): SerializedPalettedContainer;
  static deserialize<T>(data: SerializedPalettedContainer, options: PalettedContainerOptions<T>): PalettedContainer<T>;
}
```

## Control / data flow

`PackedIntegerArray` packs value `v` at slot `i` into bits `[i*bits, i*bits+bits)` spread across
32-bit words; `get`/`set` read/write the possibly two-word span and mask to `bits`. `resize` re-packs
each slot into a fresh array of the new width.

`PalettedContainer` registers each `set` value: look up `keyOf(value)`; if new, append to the
palette, map key→ordinal, and widen `bitsPerEntry` if `paletteSize > 2^bits`. The slot stores the
ordinal. `get` reads the ordinal and returns `palette[ordinal]`.

## Detailed behavior

- Default value is registered at ordinal 0 and every slot initialized to it.
- Out-of-range indices throw `RangeError` from `PackedIntegerArray`.
- `serialize` records `version`, `capacity`, `bitsPerEntry`, the encoded palette, and the packed words.
- `deserialize` validates `version` and `capacity`, rebuilds the palette via `decode`/`keyOf`, and
  restores the storage at the recorded bit width.

## Failure modes

- Out-of-range index access → `RangeError`.
- `deserialize` with unknown `version` or mismatched `capacity` → `Error`.
- Values wider than the current palette bit width are never stored directly; only small ordinals are
  packed, so any `T` (via `encode`) is safe.

## Compatibility / migration

Purely additive; no persisted or call-site changes. Serialization version is explicit for forward
compatibility.

## Performance / resource constraints

- `get`/`set` are O(1) bit arithmetic; `resize` is O(capacity).
- Memory is `ceil(capacity*bits/32)*4` bytes; for a 4096-slot section at 4 bits that is 2 KiB.

## Testing seams

`tests/unit/PalettedContainer.test.ts` covers: `PackedIntegerArray` round-trip, cross-word
boundaries, out-of-range throw, resize preservation, serialize/deserialize; and `PalettedContainer`
default value, single/overwrite set, de-duplication, bit-width growth at the 17-entry threshold and
up to full capacity, large/negative values, and serialize/deserialize round-trip (incl. full
`SECTION_VOLUME`) plus version/capacity rejection.

## Affected files / symbols

- `src/data/PalettedContainer.ts` (new)
- `tests/unit/PalettedContainer.test.ts` (new)

## Rejected alternatives

- **Global/registry palette**: unnecessary here because palette size is bounded by capacity (≤4096),
  far below 2^16; the runtime-palette-with-resize model covers the real range.
- **Storing raw values** instead of ordinals: wastes space and prevents deterministic compact
  serialization.
- **64-bit word packing** (as in Java Minecraft): unnecessary because values are ≤16 bits; 32-bit
  packing is simpler and fully sufficient.

## Downstream dependencies

023 (chunk-section-storage) and 024 (chunk-column-storage) build block-state storage on top of
`PalettedContainer<number>` keyed by block-state runtime ids.
