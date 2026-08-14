# Spec: paletted-container

## Contract

`paletted-container` provides a generic, compact, deterministic storage primitive. Values are
de-duplicated into a runtime palette; each slot stores the ordinal of its value in a bit-packed
integer array whose width grows with the palette. The container serializes deterministically and
round-trips exactly.

## Definitions

- **Palette**: ordered list mapping ordinal → value; ordinals are stable and append-only.
- **bitsPerEntry**: bit width of each slot in the backing array, within `[MIN_PALETTE_BITS=4, MAX_PALETTE_BITS=16]`.
- **capacity**: number of slots (default `SECTION_VOLUME = 4096`).

## Invariants

- `bitsPerEntry` MUST stay within `[4, 16]`.
- Equal values (`keyOf` equal) MUST share a single palette ordinal.
- `get(i)` MUST equal the last `set(i, v)` value for every slot `i`.
- When the palette grows beyond `2^bitsPerEntry`, `bitsPerEntry` MUST widen to
  `max(4, ceil(log2(paletteSize)))` and all existing ordinals MUST remain valid.
- `serialize()` then `deserialize()` MUST reproduce every slot value and the palette size exactly.

## Requirements

### Requirement: palette de-duplicates equal values
`PalettedContainer` MUST map equal values to one palette ordinal.

#### Scenario: repeated sets share the palette entry
- **GIVEN** a container with default value `-1`
- **WHEN** `set(0, 7)`, `set(1, 7)`, `set(2, 7)` are applied
- **THEN** each `get` returns `7` and `paletteSize` is `2`

### Requirement: bit width grows with palette size
`PalettedContainer` MUST widen `bitsPerEntry` automatically as distinct values are added.

#### Scenario: growth past 16 entries
- **GIVEN** a container of capacity 64 with default `0` (initial `bitsPerEntry = 4`)
- **WHEN** 17 distinct non-default values are stored
- **THEN** `paletteSize` is `18` and `bitsPerEntry` is `5`
- **AND** every stored value is retrievable unchanged

### Requirement: values are stored and retrieved unchanged
`get` MUST return exactly the value last `set` at the same index, regardless of magnitude or sign.

#### Scenario: large and negative values
- **GIVEN** a container with default `0`
- **WHEN** `set(0, 100000)`, `set(1, -5)`, `set(2, 0xffff)`
- **THEN** `get(0)`, `get(1)`, `get(2)` equal `100000`, `-5`, `0xffff`

### Requirement: serialization is deterministic and round-trips
`serialize` MUST produce a versioned structure and `deserialize` MUST reconstruct an identical container.

#### Scenario: full-volume round-trip
- **GIVEN** a container filled with `i % 33` across all `SECTION_VOLUME` slots
- **WHEN** it is serialized then deserialized with matching options
- **THEN** every slot equals `i % 33`, `bitsPerEntry` and `paletteSize` match

### Requirement: malformed serialized data is rejected
`deserialize` MUST reject unknown versions and capacity mismatches.

#### Scenario: unsupported version
- **GIVEN** a serialized blob with `version = 999`
- **WHEN** `deserialize` is called
- **THEN** it throws

#### Scenario: capacity mismatch
- **GIVEN** a serialized blob for capacity `8` and options for capacity `16`
- **WHEN** `deserialize` is called
- **THEN** it throws

## Error and failure behavior

- `get`/`set` with out-of-range indices MUST throw `RangeError`.
- `deserialize` MUST throw on unknown `version` or `capacity` mismatch.
- Values wider than the current palette width are never stored directly; only small ordinals are packed.

## Performance and resource bounds

- `get`/`set` are O(1). `resize` is O(capacity).
- Storage is `ceil(capacity * bits / 32) * 4` bytes (e.g. 2 KiB for a 4096-slot section at 4 bits).

## Compatibility and migration

Purely additive. Serialization carries an explicit `version` for forward compatibility.

## Security and integrity

No external input parsing beyond `deserialize`, which validates version and capacity before use.

## Observability

Deterministic, side-effect-free functions and a plain serialization shape make storage testable in isolation.

## Verification mapping

- Palette de-dup, growth, retrieval, serialization -> `tests/unit/PalettedContainer.test.ts`
- Full gate -> typecheck, lint, unit, build, e2e
