# Spec: voxel-light-storage

## Contract

Per-section light values MUST be stored compactly as 4-bit nibbles with deterministic accessors and
serialization. A `NibbleArray` MUST hold 4096 cells in 2048 bytes (low nibble of byte `i` = cell
`2i`), MUST bounds-check indices and values, and MUST round-trip exactly through
`serialize`/`deserialize`. A `SectionLightStorage` MUST expose sky/block light accessors by local
coordinate, `fill`, and serialization.

## Definitions

- **Nibble**: a 4-bit value 0-15.
- **Packing**: cell `2i` in the low nibble of byte `i`; cell `2i + 1` in the high nibble.

## Invariants

- `NibbleArray.size === 4096`; backing length 2048.
- `get` returns 0-15; `set` rejects values > 15.
- Indices outside `[0, 4096)` throw `RangeError`.
- `serialize` returns a copy; `deserialize` requires exactly 2048 bytes.
- `SectionLightStorage` maps `(x, y, z)` via 021 `localIndex`; `fill(v)` sets both arrays; input
  arrays are copied (no aliasing).

## Requirements

### Requirement: nibble round-trip
`set`/`get` MUST round-trip every cell, including both nibbles of each byte.

#### Scenario: full sweep
- **GIVEN** a `NibbleArray`
- **WHEN** every index is set to `index % 16` and read back
- **THEN** each read equals `index % 16`, including high-nibble cells (odd indices).

### Requirement: bounds and value validation
Out-of-range indices and values > 15 MUST throw.

#### Scenario: invalid access
- **GIVEN** a `NibbleArray`
- **WHEN** `get(4096)`, `get(-1)`, and `set(0, 16)` run
- **THEN** each throws `RangeError`.

### Requirement: serialization round-trip
`serialize`/`deserialize` MUST round-trip byte-identically; wrong-length input MUST throw.

#### Scenario: round-trip and rejection
- **GIVEN** a `NibbleArray` with data
- **WHEN** `deserialize(serialize())` runs on a fresh array, and `deserialize(new Uint8Array(10))`
  runs
- **THEN** the fresh array equals the original, and the wrong-length call throws.

### Requirement: section light accessors
`SectionLightStorage` MUST expose sky/block light by local coordinate and `fill`.

#### Scenario: coordinate accessors
- **GIVEN** a `SectionLightStorage`
- **WHEN** `setSkyLight(3, 4, 5, 9)` and `setBlockLight(3, 4, 5, 14)` run, then reads and `fill(7)`
  run
- **THEN** the reads return 9 and 14, and after `fill(7)` every sky/block value is 7.

### Requirement: construction copies inputs
Constructing from `Uint8Array`s MUST copy them (later mutation of the inputs MUST NOT affect the
storage).

#### Scenario: no aliasing
- **GIVEN** input arrays passed to the constructor
- **WHEN** the inputs are mutated afterward
- **THEN** the storage's values are unchanged.

## Error and failure behavior

- Out-of-range index/value and wrong-length data throw `RangeError`.

## Performance and resource bounds

Get/set are O(1); 4 KiB per section.

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Bounds/value validation prevents corrupt light state.

## Observability

`size` exposes cell count; serialized bytes are inspectable.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Nibble round-trip | full sweep incl. both nibbles |
| Bounds and value validation | RangeError cases |
| Serialization round-trip | byte-identical; wrong length throws |
| Section light accessors | sky/block accessors + fill |
| Construction copies inputs | no aliasing |
