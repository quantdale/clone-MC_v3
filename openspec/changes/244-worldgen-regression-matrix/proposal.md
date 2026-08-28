# Proposal: 244-worldgen-regression-matrix

## Problem

Change 102 pinned only the hash/surface/block seams (`GoldenSeed.ts`, 12 fixtures across
`hash2`/`hash3`/`surface`/`block`). The higher-level worldgen outcomes that determine what a
player actually sees and digs — the biome classification of a column, whether a cave carves a
cell, where coal/iron ore appears, and whether/where a structure start is placed — are not
pinned at all. A future change to `TerrainGenerator`, `StructureGenerator`,
`StructurePlacement`, `StructureTemplate`, or the `BlockRegistry` could silently change any of
these without failing any test. There is also no notion of a *supported worldgen version* or a
pinned *registry-state fingerprint*, so "the same seed+coordinates still produces the same
world" is only informally guaranteed.

## Goals

- A `WorldgenRegressionMatrix` model (NEW, additive alongside `GoldenSeed.ts`) with fixture
  kinds covering **biome**, **structure**, **ore**, and **cave** in addition to the 102
  `surface`/`block`/`hash2`/`hash3` kinds, so the full seed/coordinate/biome/structure/ore/cave
  outcome space is pinned.
- `verifyWorldgenMatrix`: deterministic per-fixture pass/fail reporting over a headless
  `TerrainGenerator`-backed probe (no DOM, no WebGL), never throwing on value mismatches, and
  surfacing probe/generation errors as failed entries.
- `worldgenMatrixHash`: a single deterministic 32-bit digest over the whole matrix (per
  version) used as the top-level determinism-break signal.
- `fingerprintWorldgenState`: a deterministic registry-state digest over the generation-relevant
  block ids and the structure template/placement registries, so a block-id renumber or a
  template/placement change fails the suite even when the noise math is untouched.
- `createDefaultWorldgenMatrix`: a documented `v1` matrix catalog pinning concrete seeds,
  positive/negative/boundary coordinates, all four biomes, structure present/absent cases, and
  ore/cave present/absent cases, generated once from the verified implementation and embedded
  verbatim.
- A **supported-versions** contract: `WORLDGEN_MATRIX_VERSION = 'v1'` and an explicit
  `SUPPORTED_WORLDGEN_MATRIX_VERSIONS` list that the suite runs green; a deliberate
  worldgen/registry change MUST bump the version, re-pin fixtures/hash/fingerprint, and update
  the supported list.

## Non-goals

- Changing any worldgen algorithm or behavior (the matrix pins the current output).
- Pinning dedicated tree/vegetation dimensions (not in the sequence outcome); tree/foliage
  coverage is transitive via `block` fixtures sampled at forest/taiga columns.
- Rendering, visual screenshots, or quality/resolution matrices (change 245).
- Cross-version *migration* of worlds (the matrix is a test-surface concept, not save data).

## Preconditions

- The immediately preceding change in the sequence is VERIFIED and advancement is allowed.
- Baseline gate green at the entry commit: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run test:e2e`.

## Dependencies

- `GoldenSeed.ts` (102) and its `GoldenWorldProbe` seam and `createDefaultGoldenFixtures` —
  reused conceptually; the new matrix module is additive and MUST NOT modify 102's contract.
- `math/PRNG` `hash2`/`hash3` for the hash-kind fixtures.
- `world/TerrainGenerator` (`getHeightAt`, `getBiomeAt`, `generateChunk`) as the headless world
  probe.
- `worldgen/StructureGenerator` (`createDefaultStructureGenerator`, `startAt`,
  `blocksForChunk`), `worldgen/StructurePlacement` (`StructurePlacementContext`), and
  `worldgen/StructureTemplate` for structure fixtures.
- `world/BlockRegistry` (`BlockId`) and `world/Chunk` for block/registry-state fixtures.
- No dependency on concurrent sibling change directories (243/245); this package describes its
  own contracts precisely and relies on the final reconciliation step.

## Proposed change

- `src/worldgen/WorldgenRegressionMatrix.ts` (NEW): `MatrixFixtureKind`,
  `MatrixFixture`, strict `validateMatrixFixture`, `MatrixWorldProbe`,
  `verifyWorldgenMatrix`, `worldgenMatrixHash`, `fingerprintWorldgenState`,
  `WORLDGEN_MATRIX_VERSION`, `SUPPORTED_WORLDGEN_MATRIX_VERSIONS`,
  `createDefaultWorldgenMatrix`.
- `tests/unit/WorldgenRegressionMatrix.test.ts` (NEW): validation matrix, registry-free
  verification, full `v1` catalog passes against a `TerrainGenerator`-backed probe, matrix-hash
  stability, registry-fingerprint stability and sensitivity, mismatch reporting without throws,
  probe-error surfacing, determinism, and version support policy.
- This OpenSpec package.

## Compatibility and migration

Additive: a new module + test file; no existing module is modified and 102's `GoldenSeed.ts`
contract is unchanged. No stored/public data format changes; no world migration.

## Risks

- Pinned values, matrix hash, and registry fingerprint MUST be generated once from the verified
  implementation by an authoring script and embedded verbatim (never hand-tuned), so the
  fixtures cannot silently drift or bake in an error.
- A later legitimate worldgen/registry change will fail the suite; this is intended, and the
  version-bump + re-pin path is specified as the required resolution.

## Rollback strategy

Revert the commit. The change is additive with no production consumers yet, so rollback is a
no-op for existing behavior.

## Definition of Done

- `validateMatrixFixture` accepts exactly the documented fixture shape and rejects malformed or
  kind-inconsistent fixtures with field-naming errors.
- `verifyWorldgenMatrix` reports exact per-fixture pass/fail (mismatches never throw), computes
  `actual` per kind through the headless probe, surfaces probe errors as failed entries, and is
  deterministic for identical inputs.
- The `v1` catalog (`createDefaultWorldgenMatrix`) covers all four biomes, structure
  present/absent, coal/iron/no-ore, carved/not-carved, seed/coordinate positive+negative
  boundary cases, and passes against the current implementation.
- `worldgenMatrixHash` is stable across identical runs and breaks when any fixture's actual
  value changes.
- `fingerprintWorldgenState` is stable for the current registry state and changes when a
  generation-relevant block id or structure template/placement config changes.
- `SUPPORTED_WORLDGEN_MATRIX_VERSIONS` contains exactly the versions the suite runs green
  (currently `['v1']`).
- Full gate green; 244 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 244 suite; E2E stays at its pre-change count.
