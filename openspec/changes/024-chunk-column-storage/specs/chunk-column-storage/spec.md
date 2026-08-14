# Spec: chunk-column-storage

## Contract

`chunk-column-storage` provides a `ChunkColumn` grouping `sectionCount` `ChunkSection`s at a fixed
(chunkX, chunkZ), with coordinate-routed block get/set, lazy air-section allocation, dirty-section
tracking, and deterministic serialization reusing 022/023.

## Definitions

- **ChunkColumn**: vertical stack of sections for one chunk column. Section index `sy ∈ [0, sectionCount)`.
- **minSectionY**: lowest section's Y index in section units; world Y maps to `sy = floor(Y/16) - minSectionY`.

## Invariants

- `getBlockState(x, worldY, z)` MUST equal the last `setBlockState(x, worldY, z, state)` at that coord.
- `sy = sectionIndex(worldY) - minSectionY` MUST be the in-column index; out-of-range MUST throw `RangeError`.
- Untouched sections MUST read as air and MUST NOT be materialized until written.
- A write MUST add its `sy` to the dirty set; `clearDirty` MUST empty the set.
- `serialize()` → `deserialize(..., sameRegistry, sameAirId)` MUST reproduce every written block and leave
  unwritten sections as air.

## Requirements

### Requirement: column defaults to air and is not dirty
A freshly constructed `ChunkColumn` MUST read air everywhere and report not dirty.

#### Scenario: fresh column
- **GIVEN** a new `ChunkColumn` of 4 sections
- **WHEN** `getBlockState(5, 0, 5)` and `getBlockState(15, 63, 0)` are read
- **THEN** both equal air and `isDirty` is `false`

### Requirement: get/set routes across vertical sections
`setBlockState`/`getBlockState` MUST reach the correct section and local Y.

#### Scenario: writes in different sections
- **GIVEN** a `ChunkColumn` of 4 sections
- **WHEN** `setBlockState(1, 0, 1, stone)`, `setBlockState(2, 20, 2, dirt)`, `setBlockState(3, 60, 3, stone)`
- **THEN** each coord reads back its set state and an untouched slot in a written section stays air

### Requirement: out-of-range world Y throws
`get`/`set` with a world Y outside `[minSectionY*16, (minSectionY+sectionCount)*16)` MUST throw `RangeError`.

#### Scenario: below and above range
- **GIVEN** a `ChunkColumn` of 4 sections at `minSectionY = 0`
- **WHEN** `getBlockState(0, -1, 0)` or `setBlockState(0, 64, 0, stone)` is called
- **THEN** a `RangeError` is thrown

### Requirement: dirty sections are tracked and cleared
Writes MUST mark their section dirty; `clearDirty` MUST reset tracking.

#### Scenario: dirty tracking
- **GIVEN** a `ChunkColumn` of 4 sections
- **WHEN** writes occur in sections 0 and 1
- **THEN** `isDirty` is `true` and `dirtySectionIndices()` includes 0 and 1; after `clearDirty`, `isDirty` is `false`

### Requirement: serialization is deterministic and round-trips
`serialize`/`deserialize` MUST reproduce written blocks and leave unwritten sections air.

#### Scenario: mixed column round-trip
- **GIVEN** a `ChunkColumn` with blocks set in sections 0, 1, and 3
- **WHEN** it is serialized then deserialized with the same registry and air id
- **THEN** every set block equals the original and unwritten section 2 reads as air

## Error and failure behavior

- Out-of-range `worldY` MUST throw `RangeError`.
- `deserialize` MUST throw on unknown `version`.
- Air-id/registry mismatch at `deserialize` yields wrong states without throwing (documented contract).

## Performance and resource bounds

- Empty column holds a small `Map`; written sections are 4-bit (2 KiB) when uniform. `get`/`set` are O(1).

## Compatibility and migration

Additive; serialization reuses 022's `SerializedPalettedContainer` per section.

## Security and integrity

No external input parsing beyond reusing 022's validated `deserialize`.

## Observability

Deterministic coordinate routing and explicit dirty tracking make column behavior testable in isolation.

## Verification mapping

- Air default, routing, range, dirty, serialization -> `tests/unit/ChunkColumn.test.ts`
- Full gate -> typecheck, lint, unit, build, e2e
