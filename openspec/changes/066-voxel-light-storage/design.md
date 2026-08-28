# Design: 066-voxel-light-storage

## Context / current state

No compact light storage exists.

## Target state

A `NibbleArray` (2048 bytes for 4096 4-bit cells; low nibble of byte `i` = cell `2i`) and a
`SectionLightStorage` wrapping sky + block nibble arrays with coordinate accessors and deterministic
serialization.

## Invariants

- `NibbleArray` has exactly `SECTION_VOLUME` (4096) cells backed by 2048 bytes.
- `get(index)` returns 0-15; `set(index, value)` stores `value & 0x0f` after rejecting values > 15.
- Indices outside `[0, 4096)` throw `RangeError`.
- Packing: cell `2i` lives in the low nibble of byte `i`; cell `2i + 1` in the high nibble.
- `serialize()` returns a copy; `deserialize` validates length 2048 and copies.
- `SectionLightStorage` maps local `(x, y, z)` via 021 `localIndex`; `fill(v)` sets both arrays.

## API and data model

```ts
// src/rendering/LightStorage.ts
export class NibbleArray {
  constructor(data?: Uint8Array);      // default 2048 zero bytes
  get(index: number): number;          // 0..15
  set(index: number, value: number): void;
  get size(): number;                  // 4096
  serialize(): Uint8Array;             // copy
  static deserialize(data: Uint8Array): NibbleArray;
}
export interface SectionLightData { sky: Uint8Array; block: Uint8Array; }
export class SectionLightStorage {
  constructor(sky?: Uint8Array, block?: Uint8Array);
  getSkyLight(x: number, y: number, z: number): number;
  setSkyLight(x: number, y: number, z: number, value: number): void;
  getBlockLight(x: number, y: number, z: number): number;
  setBlockLight(x: number, y: number, z: number, value: number): void;
  fill(value: number): void;
  serialize(): SectionLightData;
  static deserialize(data: SectionLightData): SectionLightStorage;
}
```

## Control / data flow

1. Propagation (067/068) reads/writes per-cell values through `get*Light`/`set*Light`.
2. Meshing (070) samples `getSkyLight`/`getBlockLight` per vertex.
3. Persistence (later wiring) stores `serialize()` output per section.

## Detailed behavior

- `set` rejects `value > 15` with a `RangeError` (values are clamped by callers intentionally).
- `deserialize` rejects arrays whose length is not 2048.
- All arrays are copied on construction (no aliasing).

## Failure modes

- Out-of-range index → `RangeError`.
- Out-of-range value (> 15) → `RangeError`.
- Wrong-length serialized data → `RangeError`.

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

Get/set are O(1); storage is 4 KiB per section.

## Testing seams

- `tests/unit/LightStorage.test.ts`:
  - nibble round-trip across all 4096 cells (both nibbles per byte);
  - bounds: index 4096 and negative throw; value 16 throws;
  - serialize/deserialize byte-identical round-trip; wrong length rejected;
  - SectionLightStorage coordinate accessors, fill, and serialization round-trip;
  - construction copies input arrays (no aliasing).

## Observability / debugging

`size` exposes cell count; serialized bytes are inspectable.

## Affected files / symbols

- `src/rendering/LightStorage.ts` — NEW.
- `tests/unit/LightStorage.test.ts` — NEW.

## Rejected alternatives

- *One byte per cell*: 4× the memory; nibbles are the standard Minecraft format.

## Downstream dependencies

067/068 (propagation) read/write this storage; 070 (light-aware meshing) samples it; persistence
(035-style stores) serializes it.
