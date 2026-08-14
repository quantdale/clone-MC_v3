# Spec: section-coordinates

## Contract

`section-coordinates` provides deterministic conversion between world coordinates and 16×16×16 section
coordinates (section index + in-section local index), correct for negative, zero, and positive
coordinates, plus in-section local index packing/unpacking. No storage is included.

## Definitions

- **SECTION_SIZE**: 16. **SECTION_VOLUME**: 4096.
- **SectionCoord**: `{ sectionX, sectionY, sectionZ }` — integer section indices.
- **LocalCoord**: `{ localX, localY, localZ }` — in `[0, 16)`.

## Invariants

- `localCoord(coord)` MUST be in `[0, 16)` for every integer `coord`.
- `sectionIndex(coord)` MUST equal `Math.floor(coord / 16)` for every integer `coord`.
- `sectionIndex(coord) * 16 + localCoord(coord)` MUST equal `coord` for every integer `coord`.
- `localIndex(lx, ly, lz)` MUST equal `lx + ly*16 + lz*256` and be in `[0, SECTION_VOLUME)`.
- `localFromIndex(localIndex(...))` MUST return the original `(lx, ly, lz)`.

## Requirements

### Requirement: section index is correct for negative coordinates
`sectionIndex` MUST use floor division so that negative coordinates map to the correct (negative)
section.

#### Scenario: negative coordinate maps to the correct section
- **GIVEN** `coord = -1`
- **WHEN** `sectionIndex(-1)` is computed
- **THEN** it equals `-1` (not `0`)

#### Scenario: boundary at -16
- **GIVEN** `coord = -16`
- **WHEN** `sectionIndex(-16)` and `localCoord(-16)` are computed
- **THEN** section is `-1` and local is `0`

### Requirement: local coordinate is always non-negative
`localCoord` MUST normalize the modulo result into `[0, 16)` even for negatives.

#### Scenario: local for -1 is 15
- **GIVEN** `coord = -1`
- **WHEN** `localCoord(-1)` is computed
- **THEN** it equals `15`

### Requirement: world-to-section/local round-trips
`worldToSectionLocal`, `worldToSection`, and `worldToLocal` MUST satisfy
`section*16 + local === coord` on every axis.

#### Scenario: identity holds across a coordinate sweep
- **GIVEN** coordinates spanning negatives, zero, and positives
- **WHEN** each is split into section+local and recomposed
- **THEN** the recomposed value equals the original

### Requirement: local index packs and unpacks exactly
`localIndex` and `localFromIndex` MUST be exact inverses within `[0, SECTION_VOLUME)`.

#### Scenario: corner and center positions
- **GIVEN** `(0,0,0)`, `(15,15,15)`, `(8,8,8)`
- **WHEN** each is packed then unpacked
- **THEN** the original triple is recovered

## Error and failure behavior

Inputs are integer coordinates; out-of-range locals are the caller's responsibility (this change only
provides math). No exceptions are expected for integer inputs.

## Performance and resource bounds

O(1) arithmetic; no allocations beyond tiny returned objects.

## Compatibility and migration

Purely additive math; no persisted or call-site changes.

## Security and integrity

Pure coordinate math; no external input.

## Observability

Deterministic, side-effect-free functions make conversions testable in isolation.

## Verification mapping

- All conversion/round-trip/index invariants -> `tests/unit/SectionCoordinate.test.ts`
- Full gate -> typecheck, lint, unit, build, e2e
