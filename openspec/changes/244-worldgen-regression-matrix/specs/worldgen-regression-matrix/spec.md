# Spec: worldgen-regression-matrix

## Contract

`WorldgenRegressionMatrix` MUST pin the actual produced worldgen outcomes (biome, structure,
ore, cave, surface, block, and the underlying `hash2`/`hash3` layer) for given seeds and
coordinates, across supported matrix versions and a pinned registry state. It MUST verify them
headlessly and deterministically against the produced world (`TerrainGenerator`-backed probe),
reporting per-fixture pass/fail without throwing on value mismatches, surfacing probe errors as
failed entries, and producing a stable top-level matrix hash plus a registry-state fingerprint
for determinism-break diagnosis. It MUST be additive and MUST NOT modify the `GoldenSeed.ts`
(102) contract.

## Definitions

- **Matrix fixture**: a pinned worldgen outcome — `key` + `kind` + `version` + `seed` +
  coordinates + `expected` — for one of `hash2`, `hash3`, `surface`, `biome`, `block`, `ore`,
  `cave`, or `structure`.
- **Kind**:
  - `hash2` / `hash3` — two-/three-coordinate `math/PRNG` hashes.
  - `surface` — world Y of the surface block at a column (`TerrainGenerator.getHeightAt`).
  - `biome` — the biome id at a column (`TerrainGenerator.getBiomeAt`), from
    `{ plains, forest, desert, taiga }`.
  - `block` — the block id at a world cell (`TerrainGenerator.generateChunk` + `Chunk.getLocal`).
  - `ore` — a block id that MUST be `CoalOre`, `IronOre`, or the no-ore control `Stone`.
  - `cave` — a block id that MUST be `Air` (carved) or a solid not-carved control.
  - `structure` — `'present'` or `'absent'` for a structure start at the fixture's chunk
    (`StructureGenerator.startAt` with the exact context `TerrainGenerator` uses).
- **Matrix version**: the tag on every fixture (`'v1'` today). A fixture is only enforced when
  its version is in `SUPPORTED_WORLDGEN_MATRIX_VERSIONS`.
- **Matrix hash**: a deterministic 32-bit FNV-1a digest over every fixture's canonical
  `version|key|kind|seed|x|y|z|actual` record in fixture order.
- **Registry-state fingerprint**: a deterministic digest over the generation-relevant block ids
  and the structure template/placement registries (see Design).
- **Probe**: a `MatrixWorldProbe` implementation over the produced world (`TerrainGenerator`),
  not the unwired standalone pipeline modules.

## Invariants

- `seed` is a non-negative safe integer; `x`/`y`/`z` are safe integers (negative allowed);
  `key`/`version` are non-empty strings; `expected` is kind-appropriate.
- `verifyWorldgenMatrix` computes every fixture in input order and reports `pass: actual ===
  expected`; value mismatches never throw.
- A probe exception becomes a failed entry with an `error` field and does not abort the report.
- Identical inputs produce identical reports and an identical matrix hash.
- `fingerprintWorldgenState` is deterministic over registration order and sensitive to any
  generation-relevant block-id or template/placement change.
- Only fixtures in supported versions are enforced green.

## Requirements

### Requirement: matrix fixture validation
`validateMatrixFixture` MUST accept exactly the documented fixture shape and MUST reject
malformed or kind-inconsistent fixtures with errors naming the offending field.

#### Scenario: valid fixtures
- **GIVEN** a fixture of each of the eight kinds with valid fields (numeric `expected` for
  numeric kinds; a biome id / `'present'`|`'absent'` for string kinds) and a supported version
- **WHEN** validation runs
- **THEN** each passes (narrowed) and the returned value equals the input.

#### Scenario: rejection matrix
- **GIVEN** an empty `key`/`version`, an unknown kind, a negative or fractional `seed`,
  non-integer `x`/`y`/`z`, a `biome`/`structure` fixture whose `expected` is not a string, a
  numeric-kind fixture whose `expected` is not a non-negative integer, and a fixture whose
  `version` is not in `SUPPORTED_WORLDGEN_MATRIX_VERSIONS`
- **WHEN** validation runs
- **THEN** it throws a descriptive error naming the offending field/version and no partial
  state is created.

#### Scenario: seed/coordinate boundaries
- **GIVEN** fixtures with `seed` 0, a seed near the 32-bit boundary, negative `x`/`z`, positive
  large `x`/`z`, `x`/`z` exactly on a chunk boundary (`x mod 16 == 0` and `z mod 16 == 0`), and
  `y` 0 and `y` just below the surface
- **WHEN** validation and verification run
- **THEN** all such fixtures are accepted and verified against the probe.

### Requirement: verification
`verifyWorldgenMatrix` MUST produce exact per-fixture results over the produced world.

#### Scenario: per-kind computation
- **GIVEN** fixtures of every kind whose `expected` equals the probe's deterministic output for
  that kind at the fixture's seed/coordinates
- **WHEN** verification runs with the probe
- **THEN** every entry reports `pass: true` and `actual` equals `expected`.

#### Scenario: mismatch report
- **GIVEN** a fixture with a tampered `expected`
- **WHEN** verification runs
- **THEN** the entry reports `pass: false` with the actual value and no throw occurs; remaining
  fixtures are still reported.

#### Scenario: probe error surfacing
- **GIVEN** a probe whose `blockAt` throws for a particular fixture's chunk
- **WHEN** verification runs
- **THEN** that fixture reports `pass: false`, `actual: null`, and an `error` containing the
  message, and verification continues over the remaining fixtures.

#### Scenario: report determinism
- **GIVEN** identical fixtures and probe
- **WHEN** verification runs twice
- **THEN** the reports are identical.

### Requirement: matrix hash
`worldgenMatrixHash` MUST produce a single stable digest that changes iff some fixture's
`actual` changes.

#### Scenario: hash stability
- **GIVEN** the `v1` catalog and the probe
- **WHEN** the hash is computed twice
- **THEN** both values are identical.

#### Scenario: hash sensitivity
- **GIVEN** a catalog in which one fixture's `actual` differs from the baseline (e.g. a height
  changed by 1)
- **WHEN** the hash is computed
- **THEN** the hash differs from the baseline hash, identifying a determinism break without
  inspecting per-fixture detail.

### Requirement: registry-state fingerprint
`fingerprintWorldgenState` MUST be deterministic over registration order and MUST change when
any generation-relevant block id mapping or any structure template/placement config changes.

#### Scenario: fingerprint stability
- **GIVEN** the default block registry, default structure templates, and default structure
  placements
- **WHEN** the fingerprint is computed twice
- **THEN** both values are identical.

#### Scenario: registry-state sensitivity
- **GIVEN** a block registry whose `CoalOre` id is remapped to a different value, a structure
  template with an altered block set, and a placement config with an altered `spacing`
- **WHEN** the fingerprint is computed for each
- **THEN** each resulting fingerprint differs from the default fingerprint, so a registry-state
  change fails the pinned value even when the noise math is unchanged.

### Requirement: determinism and independence
The verifier MUST be deterministic and MUST NOT depend on module/registration state outside the
fixture set and probe.

#### Scenario: repeated runs
- **GIVEN** the full supported catalog
- **WHEN** verification and hash run repeatedly on fresh probe instances
- **THEN** the reports and hash are identical across runs.

## Error and failure behavior

- Validation throws field-naming errors; verification never throws on value mismatches.
- Probe/generation exceptions surface as failed entries with `error` text and do not abort the
  report.
- Unsupported fixture versions are rejected at validation, preventing a stale version from
  silently running.

## Performance and resource bounds

Verification is O(fixtures); each block/ore/cave/surface/biome fixture generates one chunk
cached per seed+column. The `v1` catalog is bounded (see `worldgen-matrix-fixtures` spec) so the
full suite remains within the existing unit-suite runtime budget.

## Compatibility and migration

Additive. `GoldenSeed.ts` (102) and all existing modules are untouched. A future deliberate
worldgen/registry change MUST bump `WORLDGEN_MATRIX_VERSION`, re-pin fixtures/hash/fingerprint
via the authoring script, and update `SUPPORTED_WORLDGEN_MATRIX_VERSIONS`.

## Security and integrity

Not applicable beyond integrity of pinned values: values/hash/fingerprint are generated by the
authoring script from the verified implementation and embedded verbatim (never hand-tuned), so a
regression cannot be silently hidden by editing the pins.

## Observability

Reports are plain data — per-fixture `{key, kind, pass, actual, error?}`, plus the pinned matrix
hash and registry fingerprint. Failures list exactly which fixtures moved and the current
hash/fingerprint versus the pinned values.

## Verification mapping

- `tests/unit/WorldgenRegressionMatrix.test.ts` — validation matrix (incl. boundaries and
  unsupported versions), per-kind computation, full `v1` catalog pass, matrix-hash stability and
  sensitivity, registry-fingerprint stability and sensitivity, mismatch reporting, probe-error
  surfacing, determinism, version policy.
