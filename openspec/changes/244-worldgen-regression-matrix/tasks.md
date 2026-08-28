# Tasks: 244-worldgen-regression-matrix

> Authoring-time note: the implementing agent reconciles this package against the actual code per
> SPEC_AUTHORING_PROTOCOL.md final reconciliation. `verifyWorldgenMatrix`'s `structurePresent`
> path depends on the exact generator/context `TerrainGenerator` uses
> (`createDefaultStructureGenerator(seed)` + `getBiomeAt`/`getHeightAt` context).

## 1. Baseline / characterization

- [x] 1.1 Confirm entry gate: previous change VERIFIED; baseline `npm run typecheck`, `npm run
      lint`, `npm test`, `npm run build`, `npm run test:e2e` green; record baseline unit/E2E
      counts.
- [x] 1.2 Confirm the produced-world probe surface against the actual code: `TerrainGenerator`
      (`getHeightAt`, `getBiomeAt`, `generateChunk`), `Chunk.getLocal`, `StructureGenerator`
      (`createDefaultStructureGenerator`, `startAt`, `blocksForChunk`) and `StructurePlacement`
      context shape; characterize that the default `createDefaultStructureGenerator` finds its
      start for some seed via `startAt` (recording the start chunk/rotation to anchor structure
      fixtures); record any drift from design in `design.md` rather than silently diverging.

## 2. Implementation

- [x] 2.1 Add `src/worldgen/WorldgenRegressionMatrix.ts`: `MatrixFixtureKind`, `MatrixFixture`,
      strict `validateMatrixFixture` (kind-inconsistent `expected` and unsupported-version
      rejection, field-naming errors), `MatrixWorldProbe`, `WORLDGEN_MATRIX_VERSION = 'v1'`,
      `SUPPORTED_WORLDGEN_MATRIX_VERSIONS = ['v1']`.
- [x] 2.2 Implement `verifyWorldgenMatrix` (per-kind actual computation, deterministic
      pass/fail, never throws on mismatch, probe errors surfaced as failed entries with `error`).
- [x] 2.3 Implement `worldgenMatrixHash` (FNV-1a over canonical `version|key|kind|seed|x|y|z|actual`
      records in fixture order) and `fingerprintWorldgenState` (generation-relevant block ids +
      structure template/placement registries in registration order).
- [x] 2.4 Implement `createDefaultWorldgenMatrix` (`v1` catalog, 24–40 fixtures) with the pinned
      values, matrix hash, and registry fingerprint generated once by an authoring script from the
      verified implementation and embedded verbatim. (31 fixtures; hash 900732084; fingerprint
      `6e654848`; authoring tool kept at `scripts/worldgen/author-worldgen-matrix.test.ts` for
      future re-pins.)

## 3. Focused unit and edge/failure tests

- [x] 3.1 Validation tests: every kind valid; empty key/version, unknown kind,
      negative/fractional seed, non-integer coords, kind-inconsistent `expected`, and
      unsupported version all rejected with field-naming errors.
- [x] 3.2 Per-kind `verifyWorldgenMatrix` computation tests against a `TerrainGenerator`-backed
      probe, including a `structurePresent` path using the exact generator/context `TerrainGenerator`
      uses.
- [x] 3.3 Tests that the full `v1` catalog passes (every fixture `pass: true`), the matrix hash
      equals the pinned value, and the registry fingerprint of the default state equals the
      pinned value; plus matrix-hash stability (identical runs) and sensitivity (one fixture's
      actual changed → hash differs).
- [x] 3.4 Seed/coordinate boundary tests: seed 0, seed near 2^31-1, negative and large positive
      `x`/`z`, chunk-boundary `x`/`z ≡ 0 mod 16`, `y` 0 and `y` just below surface.
- [x] 3.5 Mismatch reporting without throwing (tampered fixture → `pass: false` with actual),
      and probe-error surfacing (a throwing probe → failed entry with `error`, verification
      continues).
- [x] 3.6 Registry-fingerprint sensitivity: a block-id remap, an altered template block set, and
      an altered placement `spacing` each change the fingerprint; unsupported matrix version
      throws.
- [x] 3.7 Coverage assertions from the fixtures spec: all four biome ids + origin plains guard,
      structure present + absent, coal/iron/no-ore, carved + not-carved, hash/surface/block
      continuity, catalog bounds (24–40) and determinism.

## 4. Integration / regression / final gate

- [x] 4.1 Confirm the new module does not modify `GoldenSeed.ts` (102) and is additive; run the
      full unit suite to confirm the 102 fixtures and all prior suites stay green.
- [x] 4.2 Run the baseline gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run
      build`, `npm run test:e2e`), record evidence in `verification.md`, update `tasks.md`, and
      advance to VERIFIED in program state.
