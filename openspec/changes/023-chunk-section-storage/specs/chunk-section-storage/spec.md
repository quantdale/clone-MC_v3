# Spec: chunk-section-storage

## Contract

`chunk-section-storage` provides a `ChunkSection` holding 4096 block states in a paletted container
keyed by `BlockStateId` (from 007). It defaults to air, supports slot/coordinate get/set, bulk fill,
empty detection, non-air counting, and deterministic serialization reusing 022.

## Definitions

- **ChunkSection**: one 16×16×16 vertical slice; `SECTION_VOLUME = 4096` slots.
- **air id**: `BlockStateRegistry.getDefaultState(BlockId.Air).id`.

## Invariants

- A `ChunkSection` MUST hold exactly `SECTION_VOLUME` block states.
- The default slot value MUST be the air state id.
- `getState(i)` MUST equal the last `set(i, state)` / `setStateId(i, id)` value.
- `getStateAt(x,y,z)` MUST equal `getState(localIndex(x,y,z))`.
- `isEmpty()` MUST be true iff every slot is air.
- `serialize()` → `deserialize(..., sameRegistry, sameAirId)` MUST reproduce every slot value.

## Requirements

### Requirement: section defaults to air and reports empty
A freshly constructed `ChunkSection` MUST be empty with air at every slot.

#### Scenario: fresh section
- **GIVEN** a new `ChunkSection` of index 0
- **WHEN** `getState(0)` is read
- **THEN** it equals the air state and `isEmpty()` is `true` and `nonAirCount()` is `0`

### Requirement: set/get round-trips by slot and by coordinate
`set`/`get` MUST persist and resolve the stored block state, including boundary coordinates.

#### Scenario: store and read back a state
- **GIVEN** a `ChunkSection`
- **WHEN** `set(100, stone)` then `getState(100)`
- **THEN** the returned state id equals `stone.id`

#### Scenario: boundary coordinate
- **GIVEN** a `ChunkSection`
- **WHEN** `setAt(15, 15, 15, stone)` then `getStateAt(15, 15, 15)`
- **THEN** the returned state id equals `stone.id`

### Requirement: fill replaces every slot
`fill(state)` MUST set all 4096 slots to `state`.

#### Scenario: full fill
- **GIVEN** a `ChunkSection`
- **WHEN** `fill(stone)` is applied
- **THEN** `isEmpty()` is `false`, `nonAirCount()` is `SECTION_VOLUME`, and every `getState(i)` equals `stone`

### Requirement: non-air count reflects stored states
`nonAirCount()` MUST count slots whose state is not air.

#### Scenario: partial fill
- **GIVEN** a `ChunkSection` with 50 slots set to `stone`
- **WHEN** `nonAirCount()` is read
- **THEN** it equals `50`

### Requirement: serialization is deterministic and round-trips
`serialize`/`deserialize` MUST reproduce all slots for matching registry and air id.

#### Scenario: mixed section round-trip
- **GIVEN** a `ChunkSection` with `stone`/`dirt`/`air` set at known slots
- **WHEN** it is serialized then deserialized with the same registry and air id
- **THEN** every queried slot equals the original

## Error and failure behavior

- Out-of-range local indices MUST propagate `RangeError` from the underlying 022 storage.
- `deserialize` relies on the caller supplying a matching `airId`; a mismatch yields wrong states
  without throwing (documented contract).

## Performance and resource bounds

- Empty section storage is 4 bits/slot (2 KiB, all zeros) via the single-entry palette.
- `get`/`set` are O(1); `fill`/`nonAirCount` are O(4096).

## Compatibility and migration

Additive; serialization reuses 022's `SerializedPalettedContainer`.

## Security and integrity

No external input parsing beyond reusing 022's validated `deserialize`.

## Observability

Deterministic, registry-resolved get/set makes section behavior testable in isolation.

## Verification mapping

- Empty/set/boundary/fill/nonAir/serialization -> `tests/unit/ChunkSection.test.ts`
- Full gate -> typecheck, lint, unit, build, e2e
