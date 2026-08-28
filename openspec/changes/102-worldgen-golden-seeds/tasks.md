# Tasks: 102-worldgen-golden-seeds

> VERIFIED. Entry gate confirmed (101 VERIFIED; baseline 1130 unit / 19 e2e green).

- [x] 1. Confirm entry gate (101 VERIFIED; baseline 1130 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/GoldenSeed.ts` (`GoldenFixtureKind`, `GoldenFixture`, strict `validateGoldenFixture`, `GoldenFixtureRegistry` with atomic rejection and `all()`, `GoldenWorldProbe`, `GoldenFixtureResult`, deterministic `verifyGoldenFixtures` (never throws), `GOLDEN_VERSION = 'v1'`, `createDefaultGoldenFixtures` with values pinned from the current implementation).
- [x] 3. Generate the pinned values with an authoring script (hash2/hash3 + TerrainGenerator-backed heights/blocks across seeds 42/1234/9999 and positive/negative coordinates), embed them verbatim; add `tests/unit/GoldenSeed.test.ts` (validation matrix, registry lifecycle/atomicity, full default set passes via a terrain probe, tampered fixture reports fail without throwing, report determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
