# Proposal: 102-worldgen-golden-seeds

## Problem

Worldgen correctness relies on determinism (hashes, heights, block placement), but no pinned
regression surface exists: an accidental change to a hash or generation rule could go unnoticed.

## Goals

- `GoldenFixture` model: key, kind (`hash2`/`hash3`/`surface`/`block`), version, seed,
  coordinates, expected value — strictly validated.
- `verifyGoldenFixtures`: deterministic pass/fail report over fixtures (no throws for
  mismatches), using `hash2`/`hash3` from `math/PRNG` and a caller-supplied world probe
  (surface height / block-at for a seed).
- `createDefaultGoldenFixtures`: a documented `v1` fixture set pinned to the current
  implementation across positive/negative coordinates and several seeds.
- `GoldenFixtureRegistry` (003 pattern): atomic duplicate/invalid rejection.

## Non-goals

- Changing any worldgen algorithm (fixtures pin the current behavior).
- Cross-version migration logic (the version field is metadata that future changes bump).

## Preconditions

- Change 101 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 101 baseline (1130 unit / 19 e2e).

## Dependencies

- `hash2`/`hash3` from `math/PRNG`, 003 registry patterns, `TerrainGenerator` as the test
  world probe.

## Proposed change

- `src/worldgen/GoldenSeed.ts` (NEW): `GoldenFixtureKind`, `GoldenFixture`,
  `validateGoldenFixture`, `GoldenFixtureRegistry`, `GoldenWorldProbe`, `GoldenFixtureResult`,
  `verifyGoldenFixtures`, `GOLDEN_VERSION`, `createDefaultGoldenFixtures`.
- `tests/unit/GoldenSeed.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Pinned values must be generated once from the verified implementation and never hand-tuned;
  the authoring script output is embedded verbatim.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Validation accepts exactly the documented fixture shape and rejects malformed ones.
- `verifyGoldenFixtures` reports exact pass/fail per fixture (mismatches never throw), and the
  default `v1` fixture set passes against the current implementation.
- The registry rejects duplicates and invalid fixtures atomically.
- Full gate green; 102 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 102 suite; E2E stays 19/19.
