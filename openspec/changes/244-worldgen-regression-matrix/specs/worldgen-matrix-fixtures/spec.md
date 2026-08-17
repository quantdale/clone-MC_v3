# Spec: worldgen-matrix-fixtures

## Contract

`createDefaultWorldgenMatrix` MUST return a documented, deterministic matrix catalog (currently
version `'v1'`) whose fixtures together cover the full seed/coordinate/biome/structure/ore/cave
outcome space described in the sequence outcome, across the supported matrix versions. The
catalog MUST pin the actual produced world through a `TerrainGenerator`-backed probe, MUST be
generated once from the verified implementation by an authoring script and embedded verbatim,
and MUST NOT include any dimension outside the outcome (no tree/vegetation-specific or
rendering/visual fixtures). The suite MUST run green exactly the supported versions.

## Definitions

- **Seed set**: the matrix seeds. Today `{ 0, 1, 42, 1337, 1234, 9999 }` — `{42, 1234, 9999}`
  keep continuity with 102's `createDefaultGoldenFixtures`; `0`, `1`, and the default `1337` add
  boundary/default coverage.
- **Coordinate set**: the world coordinates sampled per seed/kind, MUST include the origin,
  positive and negative columns, far columns, and chunk-boundary columns (`x`/`z ≡ 0 mod 16`),
  plus `y` values covering bedrock (`y = 0`), deep stone, the ore band, the cave band, and the
  surface.
- **Biome id set**: `{ plains, forest, desert, taiga }`.
- **Structure**: the default `overworld/ruined_well` (cobblestone 16) with its default placement
  (spacing 12, separation 4, salt 40101, biomeKeys `['plains','forest','taiga']`,
  minSurfaceHeight 33).
- **Registry state**: `createDefaultBlockRegistry()`, `createDefaultStructureTemplates()`,
  `createDefaultStructurePlacements()` — the state generation actually uses.
- **Supported version**: a member of `SUPPORTED_WORLDGEN_MATRIX_VERSIONS` (today `['v1']`).

## Invariants

- Every catalog fixture carries a supported version and passes `validateMatrixFixture`.
- The catalog covers all four biome ids, structure present and absent, coal, iron, and no-ore
  controls, and carved and not-carved cave controls.
- The catalog covers the full seed set (every seed has at least one `surface`, `block`, and
  `biome` fixture) and both positive and negative coordinates plus a chunk-boundary column.
- Every `surface`/`biome` fixture is a pure function of `(seed, x, z)`; every `block`/`ore`/`cave`
  fixture is a pure function of `(seed, x, y, z)`; every `structure` fixture is a pure function
  of `(seed, chunkX, chunkZ)`.
- The catalog is bounded (see the bounds requirement) and deterministic across calls.
- The catalog contains no tree/vegetation-specific or rendering/visual fixtures.

## Requirements

### Requirement: seed set
`createDefaultWorldgenMatrix` MUST include fixtures for every seed in the seed set, and every
seed MUST be covered by at least one `surface`, one `block`, and one `biome` fixture.

#### Scenario: seed coverage
- **GIVEN** the `v1` catalog
- **WHEN** inspected by seed
- **THEN** for every seed in `{0, 1, 42, 1337, 1234, 9999}` there is at least one `surface`, one
  `block`, and one `biome` fixture, and no fixture uses a seed outside the set.

### Requirement: coordinate coverage
The catalog MUST include the origin, positive and negative columns, a far column, and a
chunk-boundary column, and MUST exercise negative and boundary coordinate handling.

#### Scenario: coordinate coverage
- **GIVEN** the `v1` catalog
- **WHEN** inspected by coordinate
- **THEN** it contains at least one fixture at the origin, at least one with negative `x` or `z`,
  at least one with positive `x` or `z` beyond 100, and at least one with `x ≡ 0 mod 16` and
  `z ≡ 0 mod 16`; and `y` values include `0` (bedrock), a deep-stone value, a cave-band value, an
  ore-band value, and the surface of a sampled column.

### Requirement: biome coverage
The catalog MUST pin each of the four biome ids for at least one seed, and MUST pin the
spawn-plains guarantee at the origin.

#### Scenario: biome coverage
- **GIVEN** the `v1` catalog
- **WHEN** inspected by `biome` fixtures
- **THEN** the set of `expected` biome ids is exactly `{ plains, forest, desert, taiga }`, and
  there is a `biome` fixture at `(0, 0)` whose `expected` is `'plains'` (the protected spawn
  radius).

#### Scenario: non-plains sampling
- **GIVEN** a `biome` fixture with `expected` `'forest'`, `'desert'`, or `'taiga'`
- **WHEN** verified against the probe
- **THEN** its column is outside the spawn radius and the probe's biome matches.

### Requirement: structure coverage
The catalog MUST include at least one `structure` fixture with `expected` `'present'` (a start
chunk where the default ruined-well placement succeeds) and at least one `structure` fixture with
`expected` `'absent'`, each pinned through the exact generator/context `TerrainGenerator` uses.

#### Scenario: structure present
- **GIVEN** a `structure` fixture with `expected` `'present'`
- **WHEN** verified against the probe
- **THEN** `StructureGenerator.startAt(chunkX, chunkZ, ctx)` returns at least one start for the
  fixture's chunk, the start's biome gate passes (biome in `['plains','forest','taiga']`), the
  surface gate passes (`surfaceY >= 33`), and the corresponding template blocks (cobblestone 16)
  are present at the generated chunk's cells (verified via a `block` fixture at a known
  structure cell or via `blocksForChunk`).

#### Scenario: structure absent
- **GIVEN** a `structure` fixture with `expected` `'absent'`
- **WHEN** verified against the probe
- **THEN** either the candidate start chunk's biome gate fails (biome not in
  `['plains','forest','taiga']`) or its surface gate fails (`surfaceY < 33`), or the chunk is not
  the start chunk for its region, and `startAt` returns no start.

#### Scenario: structure/registry state dependence
- **GIVEN** the default placement config `overworld/ruined_well` (spacing 12, separation 4, salt
  40101)
- **WHEN** a `structure` fixture is verified
- **THEN** the placement decision is deterministic for the seed and is covered by the registry
  fingerprint (a change to `spacing`/`separation`/`salt`/`biomeKeys`/`minSurfaceHeight` changes
  the fingerprint and is expected to change structure fixtures).

### Requirement: ore coverage
The catalog MUST include at least one `CoalOre` fixture, one `IronOre` fixture, and one no-ore
control (`Stone`) fixture, each sampled inside the valid ore band.

#### Scenario: coal fixture
- **GIVEN** an `ore` fixture with `expected` `BlockId.CoalOre`
- **WHEN** verified against the probe
- **THEN** the cell lies in `[bedrockY+3, min(surfaceHeight-3, seaLevel-1))`, outside the spawn
  `0.66` radius, and the probe's `blockAt` returns `BlockId.CoalOre`.

#### Scenario: iron fixture
- **GIVEN** an `ore` fixture with `expected` `BlockId.IronOre`
- **WHEN** verified against the probe
- **THEN** the cell also satisfies `worldY < seaLevel - 8`, and the probe's `blockAt` returns
  `BlockId.IronOre`.

#### Scenario: no-ore control
- **GIVEN** an `ore` fixture with `expected` `BlockId.Stone`
- **WHEN** verified against the probe
- **THEN** the cell is in the valid ore band and the probe's `blockAt` returns `BlockId.Stone`
  (neither coal nor iron), confirming the absence branch is pinned too.

### Requirement: cave coverage
The catalog MUST include at least one carved fixture (`expected` `BlockId.Air`) and at least one
not-carved control (a solid id), each sampled in the cave band.

#### Scenario: carved fixture
- **GIVEN** a `cave` fixture with `expected` `BlockId.Air`
- **WHEN** verified against the probe
- **THEN** the cell lies in `(bedrockY+1, min(surfaceHeight-3, seaLevel-1))`, outside the spawn
  `0.66` radius, and the probe's `blockAt` returns `BlockId.Air` because `isCaveAt` carved it.

#### Scenario: not-carved control
- **GIVEN** a `cave` fixture with a solid `expected`
- **WHEN** verified against the probe
- **THEN** the cell is in the cave band and the probe's `blockAt` returns the solid id (the
  not-carved branch is pinned, not just the carved branch).

### Requirement: hash and surface continuity
The catalog MUST include `hash2`, `hash3`, `surface`, and `block` fixtures (the 102 seams) so
the underlying hash layer and surface/block outputs stay pinned alongside the new dimensions.

#### Scenario: continuity fixtures
- **GIVEN** the `v1` catalog
- **WHEN** inspected by kind
- **THEN** it contains at least one `hash2`, one `hash3`, one `surface`, and one `block` fixture,
  each verified against the probe/direct `math/PRNG` calls.

### Requirement: supported versions and catalog bounds
The catalog MUST be versioned, the suite MUST run green exactly the supported versions, and the
catalog MUST stay within documented bounds.

#### Scenario: version policy
- **GIVEN** `SUPPORTED_WORLDGEN_MATRIX_VERSIONS` and the catalog
- **WHEN** the catalog is inspected
- **THEN** every fixture's `version` is in `SUPPORTED_WORLDGEN_MATRIX_VERSIONS`, and requesting
  `createDefaultWorldgenMatrix(version)` for a version not in the supported list throws a
  descriptive error.

#### Scenario: catalog bounds
- **GIVEN** the `v1` catalog
- **WHEN** its size is measured
- **THEN** the total fixture count is `>= 24` and `<= 40`, and repeated construction returns an
  identical array.

#### Scenario: determinism and validation
- **GIVEN** the `v1` catalog
- **WHEN** constructed twice and each fixture is validated
- **THEN** both arrays are equal and every fixture passes `validateMatrixFixture`.

## Error and failure behavior

- A requested version outside `SUPPORTED_WORLDGEN_MATRIX_VERSIONS` throws a descriptive error.
- A catalog fixture that does not match the produced world reports `pass: false` (never throws)
  and is diagnosed by the matrix-hash change and the failing fixture's actual value.
- A registry-state change is diagnosed by the registry-fingerprint change even when individual
  fixtures still pass.

## Performance and resource bounds

The `v1` catalog is bounded to 24–40 fixtures. With one chunk generated per distinct seed+column
pair, the full suite stays within the existing unit-suite runtime budget; a size increase above
the bound requires a recorded rationale in `tasks.md`.

## Compatibility and migration

Additive. The catalog is generated from the verified implementation by the authoring script and
embedded verbatim. A deliberate change to any pinned outcome MUST bump
`WORLDGEN_MATRIX_VERSION`, re-pin, and update `SUPPORTED_WORLDGEN_MATRIX_VERSIONS`; previously
supported versions may be retained as a data file for archaeology but are no longer enforced
green once removed from the supported list.

## Security and integrity

Pinned values/hash/fingerprint are authoring-script generated from the verified implementation,
never hand-tuned, so a regression cannot be silently hidden in the pins.

## Observability

The catalog is plain data; the suite asserts every fixture passes, the matrix hash equals the
pinned value, and the registry fingerprint equals the pinned value. Failures name the fixture
keys that moved.

## Verification mapping

- `tests/unit/WorldgenRegressionMatrix.test.ts` — seed/coordinate/biome/structure/ore/cave/
  continuity coverage, structure present/absent, ore and cave controls, bounds (24–40),
  determinism, version policy, full catalog pass against the `TerrainGenerator`-backed probe.
