# Spec: biome-tint

## Contract

Model faces MUST be able to declare a tint attribute (`tintindex`) with exactly the kinds
`grass` | `foliage` | `water`; `validateBlockModel` MUST accept and preserve it and MUST reject
unknown values. `biomeTintColor(biome, kind)` MUST return the biome's `grassColor` for `grass`, its
`foliageColor` for `foliage`, and its `waterColor` for `water`, falling back to the shared
`DEFAULT_WATER_COLOR` when `waterColor` is absent. `biomeTint` MUST additionally return the RGB
split. All resolver functions MUST be pure and deterministic.

## Definitions

- **TintKind**: `'grass' | 'foliage' | 'water'`.
- **BiomeTint**: `{ kind: TintKind; color: BiomeColor; rgb: BiomeColorRGB }` with
  `rgb === biomeColorToRGB(color)`.
- **tintindex**: an optional `TintKind` on `BlockModelFace` declaring the biome tint applied to that
  face (MC-style tint attribute); absent means untinted.

## Invariants

- `biomeTintColor(biome, 'grass') === biome.grassColor`.
- `biomeTintColor(biome, 'foliage') === biome.foliageColor`.
- `biomeTintColor(biome, 'water') === (biome.waterColor ?? DEFAULT_WATER_COLOR)`.
- Same inputs → same outputs (no state, no randomness, no position dependence).
- Validation accepts exactly the three kinds and preserves the field on round-trip.

## Requirements

### Requirement: face tint attribute
`BlockModelFace.tintindex` MUST be an optional `TintKind`; `validateBlockModel` MUST preserve it and
MUST reject non-string or unknown values.

#### Scenario: valid kinds accepted
- **GIVEN** faces with `tintindex: 'grass'`, `'foliage'`, and `'water'`
- **WHEN** `validateBlockModel` runs
- **THEN** each face keeps its `tintindex` verbatim and validation succeeds.

#### Scenario: unknown kind rejected
- **GIVEN** a face with `tintindex: 'leaves'` (or a number/null)
- **WHEN** `validateBlockModel` runs
- **THEN** it throws a descriptive error naming the invalid value.

#### Scenario: absent attribute unchanged
- **GIVEN** a model without `tintindex`
- **WHEN** `validateBlockModel` runs
- **THEN** faces carry no `tintindex` and validation succeeds exactly as before.

### Requirement: tint resolution
`biomeTintColor` MUST map each kind to the corresponding biome color field with the water fallback.

#### Scenario: grass and foliage
- **GIVEN** the plains biome (`grassColor 0x7cbd6b`, `foliageColor 0x4b9c3a`)
- **WHEN** `biomeTintColor(plains, 'grass')` and `biomeTintColor(plains, 'foliage')` run
- **THEN** they return `0x7cbd6b` and `0x4b9c3a`.

#### Scenario: water with explicit color
- **GIVEN** the swampland biome (`waterColor 0x4e7a4e`)
- **WHEN** `biomeTintColor(swampland, 'water')` runs
- **THEN** it returns `0x4e7a4e`.

#### Scenario: water fallback
- **GIVEN** a biome without `waterColor` (e.g., plains)
- **WHEN** `biomeTintColor(plains, 'water')` runs
- **THEN** it returns `DEFAULT_WATER_COLOR` (`0x3f76e4`).

### Requirement: attribute payload
`biomeTint` MUST return `{ kind, color, rgb }` with `rgb` equal to `biomeColorToRGB(color)`.

#### Scenario: tint attribute for a face
- **GIVEN** the forest biome and kind `'grass'` (`grassColor 0x79c05a`)
- **WHEN** `biomeTint(forest, 'grass')` runs
- **THEN** it returns `{ kind: 'grass', color: 0x79c05a, rgb: { r: 0x79, g: 0xc0, b: 0x5a } }`.

### Requirement: purity and coverage
The resolver MUST be deterministic, and every default biome MUST resolve every kind.

#### Scenario: all biomes × all kinds
- **GIVEN** `createDefaultBiomeRegistry()` (10 biomes)
- **WHEN** `biomeTintColor` runs for each biome and each kind
- **THEN** every result is an integer in `[0, 0xFFFFFF]`, water results equal the definition's
  `waterColor` or the default, and repeated calls return identical values.

## Error and failure behavior

- Invalid `tintindex` fails at model validation with a descriptive error (no partial acceptance).
- Resolver has no error path: the kind union is closed and biomes are registry-validated
  (precondition documented; `grassColor`/`foliageColor` are mandatory in 016).

## Performance and resource bounds

`biomeTintColor` is O(1) and allocation-free; `biomeTint` allocates one object. Validation adds one
string check per face.

## Compatibility and migration

Additive: optional field, new exported constant, new module. Models without `tintindex` validate and
behave identically. No serialized-data changes.

## Security and integrity

Not applicable: no I/O, no stored data, strict validation of the new field.

## Observability

Resolver outputs are plain values asserted exactly in tests; validation errors name the offending
value.

## Verification mapping

- `tests/unit/BlockModel.test.ts` — `tintindex` acceptance/rejection/round-trip/absence.
- `tests/unit/BiomeTint.test.ts` — grass/foliage/water resolution incl. swampland water and plains
  fallback; `biomeTint` payload with exact `rgb`; determinism; all-10-biomes × 3-kinds coverage.
