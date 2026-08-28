# Spec: worldgen-golden-seeds

## Contract

`validateGoldenFixture` MUST accept exactly the documented fixture shape and MUST reject
malformed ones with descriptive errors. `verifyGoldenFixtures` MUST compute each fixture's
actual value per its kind (`hash2(x, z, seed)` / `hash3(x, y, z, seed)` /
`world.surfaceHeight(seed, x, z)` / `world.blockAt(seed, x, y, z)`) and MUST report
`pass: actual === expected` per fixture in input order, never throwing on mismatches.
`GoldenFixtureRegistry` MUST store only validated fixtures, reject duplicates and invalid
inputs atomically, and expose get/has/size/all/clear. `createDefaultGoldenFixtures` MUST return
the documented v1 set, pinned to the current implementation.

## Definitions

- **Fixture**: key + kind + version + seed + coordinates + expected value.
- **Kind**: `hash2` (two-coordinate hash), `hash3` (three-coordinate hash), `surface`
  (terrain surface height at a column), `block` (block id at a world cell).
- **GOLDEN_VERSION**: `'v1'`.

## Invariants

- `key`/`version` non-empty strings; `seed` non-negative integer; `x`/`y`/`z` integers;
  `expected` non-negative integer; `kind` documented.
- Identical inputs produce identical reports; mismatch reports never throw.
- Registry operations never leave partial state.

## Requirements

### Requirement: fixture validation
`validateGoldenFixture` MUST implement the documented acceptance rules.

#### Scenario: valid fixtures
- **GIVEN** a fixture of each kind with valid fields
- **WHEN** validation runs
- **THEN** each passes (narrowed).

#### Scenario: rejection matrix
- **GIVEN** an empty key/version, an unknown kind, a negative/fractional seed, non-integer
  coordinates, and a negative expected value
- **WHEN** validation runs
- **THEN** it throws a descriptive error naming the offending field.

### Requirement: verification
`verifyGoldenFixtures` MUST produce exact per-fixture reports.

#### Scenario: hash fixtures
- **GIVEN** hash2 and hash3 fixtures whose expected values equal direct `hash2`/`hash3` calls
- **WHEN** verification runs with a probe
- **THEN** every entry passes.

#### Scenario: surface and block fixtures
- **GIVEN** surface and block fixtures backed by a terrain probe (TerrainGenerator per seed)
- **WHEN** verification runs
- **THEN** every entry passes against the current implementation.

#### Scenario: mismatch report
- **GIVEN** a fixture with a tampered expected value
- **WHEN** verification runs
- **THEN** the entry reports `pass: false` with the actual value and no throw occurs.

#### Scenario: report determinism
- **GIVEN** identical fixtures and probe
- **WHEN** verification runs twice
- **THEN** the reports are identical.

### Requirement: registry
`GoldenFixtureRegistry` MUST store validated fixtures with atomic rejection.

#### Scenario: lifecycle
- **GIVEN** valid registrations
- **WHEN** register/get/has/size/all/clear run
- **THEN** lookups round-trip, size tracks registrations, all preserves order, and clear
  empties.

#### Scenario: atomic rejection
- **GIVEN** a duplicate key and an invalid fixture
- **WHEN** registration runs
- **THEN** it throws and the registry state is unchanged.

### Requirement: defaults
`createDefaultGoldenFixtures` MUST return the documented v1 set deterministically.

#### Scenario: default set
- **GIVEN** the default builder
- **WHEN** inspected
- **THEN** it returns fixtures of all four kinds across seeds {42, 1234, 9999} and
  coordinates including negatives, all version `'v1'`, and repeated construction is equal.

## Error and failure behavior

- Validation and registration throw descriptive errors; verification never throws.

## Performance and resource bounds

Verification O(fixtures); each surface/block probe generates one chunk in tests (cached per
seed).

## Compatibility and migration

Additive. Future changes that alter pinned behavior MUST bump `GOLDEN_VERSION` and re-pin
deliberately.

## Security and integrity

Not applicable.

## Observability

Reports are plain data; tests assert exact entries.

## Verification mapping

- `tests/unit/GoldenSeed.test.ts` — validation matrix, registry lifecycle/atomicity, hash
  fixtures vs direct calls, terrain-backed full-set verification, mismatch reports,
  determinism, defaults.
