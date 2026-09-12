# Spec: chunksection-isempty

## Contract

`ChunkSection.isEmpty()` reports whether a 16³ section contains only air, and
`nonAirCount()` reports the exact number of non-air slots. The mesher empty
fast-path relies on `isEmpty()` to skip genuinely empty sections only.

## Definitions

- **airId**: the `BlockStateId` passed (or defaulted) at `ChunkSection`
  construction; the section's default/empty value.
- **mono palette**: a backing store with `paletteSize === 1`, i.e. every slot
  indexes palette ordinal 0.
- **mono-air / mono-non-air**: mono palette whose single entry is / is not
  `airId`.

## Invariants

- INV-1: `isEmpty()` is true ⟺ all `SECTION_VOLUME` slots hold `airId`.
- INV-2: `nonAirCount()` equals the count of slots with `id !== airId`.
- INV-3: serialization round-trips preserve both verdicts slot-for-slot.

## Requirements

### Requirement: EMPTY-1 — all-air sections report empty

`ChunkSection.isEmpty()` MUST return `true` for a fresh section, a
`fill(air)` section, and a deserialized mono-air section; `nonAirCount()`
MUST return 0 for each.

#### Scenario: fresh section is empty

- **GIVEN** `new ChunkSection(0, registry)` with default air
- **WHEN** `isEmpty()` / `nonAirCount()` are called with no writes
- **THEN** `isEmpty()` is `true` and `nonAirCount()` is `0`.

#### Scenario: fill(air) on a fresh section is empty

- **GIVEN** a fresh section with `fill(air)` (palette never leaves `[air]`)
- **WHEN** `isEmpty()` / `nonAirCount()` are called
- **THEN** `isEmpty()` is `true` and `nonAirCount()` is `0`.

#### Scenario: re-emptied section is conservative but exact

- **GIVEN** a section with `fill(stone)` then `fill(air)` (stale palette
  `[air, stone]` — palettes never shrink)
- **WHEN** `isEmpty()` / `nonAirCount()` are called
- **THEN** `isEmpty()` is `false` (safe direction: the mesher meshes an
  all-air section to nothing) and `nonAirCount()` is exactly `0`.

#### Scenario: deserialized mono-air is empty

- **GIVEN** a payload with palette `[air.id]` and all-zero storage
- **WHEN** deserialized and queried
- **THEN** `isEmpty()` is `true` and `nonAirCount()` is `0`.

### Requirement: EMPTY-2 — mono-non-air sections report non-empty

`ChunkSection.isEmpty()` MUST return `false` for any section whose single
palette entry is not `airId`; `nonAirCount()` MUST return `SECTION_VOLUME`.

#### Scenario: deserialized mono-stone is not empty

- **GIVEN** a payload with palette `[stone.id]` and all-zero storage
- **WHEN** deserialized and queried
- **THEN** `isEmpty()` is `false` and `nonAirCount()` is `SECTION_VOLUME`
  (4096).

#### Scenario: live fill(stone) is not empty

- **GIVEN** a fresh section with `fill(stone)`
- **WHEN** `isEmpty()` / `nonAirCount()` are called
- **THEN** `isEmpty()` is `false`, `nonAirCount()` is `4096`, and every slot
  reads `stone.id`.

### Requirement: EMPTY-3 — mixed sections report non-empty with exact counts

`ChunkSection.isEmpty()` MUST return `false` for multi-entry palettes, and
`nonAirCount()` MUST equal the exact number of non-air slots.

#### Scenario: partial writes count exactly

- **GIVEN** a fresh section with 50 distinct slots set to stone
- **WHEN** `nonAirCount()` is called
- **THEN** it returns `50` and `isEmpty()` is `false`.

#### Scenario: single non-air slot is not empty

- **GIVEN** a fresh section with one slot set to stone
- **WHEN** queried
- **THEN** `isEmpty()` is `false` and `nonAirCount()` is `1`.

### Requirement: EMPTY-4 — round-trip preserves verdicts

Serializing then deserializing a section MUST preserve `isEmpty()` and
`nonAirCount()` for all-air, all-stone, and mixed shapes.

#### Scenario: round-trip verdict table

- **GIVEN** three sections (fresh air, `fill(stone)`, mixed stone/dirt/air)
- **WHEN** each is serialized and deserialized
- **THEN** every restored section matches the original slot-for-slot and the
  `isEmpty()`/`nonAirCount()` verdicts are identical.

### Requirement: EMPTY-5 — mesher fast-path skips only true air

`ChunkMesher.meshSection` MUST return all-null streams for sections satisfying
INV-1 and MUST produce non-null geometry for a solid mono-non-air section.

#### Scenario: air section meshes to nothing

- **GIVEN** a fresh all-air section
- **WHEN** `meshSection` runs
- **THEN** all five streams (`opaque`, `transparent`, `cutout`,
  `translucent`, `fluid`) are null.

#### Scenario: solid mono-stone section meshes to geometry

- **GIVEN** a deserialized mono-stone section (the EMPTY-2 shape)
- **WHEN** `meshSection` runs with the standard test neighbor sampler
- **THEN** the result is not all-null (opaque geometry present) — pre-fix it
  was all-null via the wrong fast-path.

### Requirement: EMPTY-6 — custom airId honored

`isEmpty()` MUST compare against the section's own `airId`, not a global.

#### Scenario: custom air section

- **GIVEN** `new ChunkSection(0, registry, stone.id)` filled with stone
- **WHEN** queried
- **THEN** `isEmpty()` is `true` (stone is this section's empty value).

## Error and failure behavior

No new throws. Malformed payloads keep existing `PalettedContainer`
validation (version/capacity mismatch throws, unchanged). A zero-entry
palette (unreachable via public API) fails closed to `isEmpty() === false`,
routing `nonAirCount()` to the exact scan — the safe direction.

## Performance and resource bounds

`isEmpty()` stays O(1) with zero allocation (one extra indexed read only on
the single-palette path). `nonAirCount()` keeps its exact-scan profile.
No change to serialized size or mesher hot-path costs for live-built
sections.

## Compatibility and migration

No format, signature, or behavioral change beyond the corrected verdict.
Previously-misclassified sections now mesh and count — the intended fix.

## Security and integrity

Not applicable: no I/O, parsing of untrusted input, or privilege boundary
involved. The deserialized-payload path reuses existing validation.

## Observability

Unit tests assert every scenario above; verification.md records the
pre/post verdict table and gate evidence.

## Verification mapping

- EMPTY-1..EMPTY-4, EMPTY-6 → `tests/unit/ChunkSection.test.ts` 273 block.
- EMPTY-5 → existing `ChunkMesher` empty-section coverage (audited) plus the
  mono-stone geometry assertion in the 273 block or mesher suite.
- All → `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e` (zero golden churn), file-audit, `npm run
  validate-state`.
