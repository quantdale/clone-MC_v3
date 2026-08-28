# Design: 102-worldgen-golden-seeds

## Context / current state

Worldgen is deterministic (hash2/hash3, TerrainGenerator heights/blocks/trees/structures), but
nothing pins its output. Regression risk grows with every future change.

## Target state

A validated fixture model + deterministic verifier + a pinned `v1` fixture set that the test
suite runs; any future worldgen behavior change that alters a pinned value fails the suite.

## Invariants

- `kind` one of `hash2`/`hash3`/`surface`/`block`; `key`/`version` non-empty strings; `seed`
  non-negative integer; `x`/`y`/`z`/`expected` integers (expected non-negative).
- `verifyGoldenFixtures` computes `hash2(x, z, seed)`, `hash3(x, y, z, seed)`,
  `world.surfaceHeight(seed, x, z)`, or `world.blockAt(seed, x, y, z)` per kind and reports
  `pass: actual === expected`; mismatches never throw.
- Fixture order in reports follows input order; identical inputs produce identical reports.
- `GOLDEN_VERSION = 'v1'`; `createDefaultGoldenFixtures` returns exactly the documented set.

## API and data model

```ts
// src/worldgen/GoldenSeed.ts (NEW)
export type GoldenFixtureKind = 'hash2' | 'hash3' | 'surface' | 'block';
export interface GoldenFixture {
  key: string;
  kind: GoldenFixtureKind;
  version: string;
  seed: number;
  x: number;
  y: number; // hash3 / block only
  z: number;
  expected: number;
}
export const GOLDEN_VERSION = 'v1';
export function validateGoldenFixture(input: unknown): GoldenFixture;
export class GoldenFixtureRegistry {
  register(fixture: GoldenFixture): void;
  get(key: string): GoldenFixture | null;
  has(key: string): boolean;
  get size(): number;
  all(): GoldenFixture[];
  clear(): void;
}
export interface GoldenWorldProbe {
  surfaceHeight(seed: number, x: number, z: number): number;
  blockAt(seed: number, x: number, y: number, z: number): number;
}
export interface GoldenFixtureResult { key: string; kind: GoldenFixtureKind; pass: boolean; actual: number; }
export function verifyGoldenFixtures(
  fixtures: readonly GoldenFixture[],
  world: GoldenWorldProbe,
): GoldenFixtureResult[];
export function createDefaultGoldenFixtures(): GoldenFixture[];
```

## Control / data flow

1. 102 embeds the pinned fixture set (values generated once from the verified implementation).
2. Tests run `verifyGoldenFixtures(createDefaultGoldenFixtures(), terrainProbe)` and assert all
   pass; a tampered fixture must produce a failing report entry.

## Detailed behavior

- Default fixture set (v1): three hash2 fixtures, three hash3 fixtures, three surface
  fixtures, and three block fixtures across seeds {42, 1234, 9999} and coordinates including
  negatives. Values are pinned numbers from the current implementation (authoring script
  output embedded verbatim in `createDefaultGoldenFixtures`).
- Surface fixtures use `world.surfaceHeight`; block fixtures use `world.blockAt` at the
  surface height of the same column (the surface block id).

## Failure modes

- Validation throws descriptive errors; registry operations reject atomically; verification
  never throws (reports mismatches).

## Compatibility / migration

Additive.

## Performance / resource constraints

Verification O(fixtures); each block/surface probe generates one chunk in tests (cached per
seed).

## Testing seams

- `tests/unit/GoldenSeed.test.ts` (NEW): validation matrix; registry lifecycle/atomicity;
  hash fixtures against direct `hash2`/`hash3` calls; a terrain-backed probe
  (TerrainGenerator per seed) verifying the full default set passes; a tampered fixture
  reports `pass: false` without throwing; determinism of reports.

## Observability / debugging

Reports are plain data; tests assert exact entries.

## Affected files / symbols

- `src/worldgen/GoldenSeed.ts` — NEW.
- `tests/unit/GoldenSeed.test.ts` — NEW.

## Rejected alternatives

- *Snapshot whole chunks*: over-broad and brittle; targeted hash/landmark fixtures catch
  regressions at the seams that matter.
- *Throwing verifier*: a pass/fail report lets future changes see exactly which pins moved.

## Downstream dependencies

Future worldgen changes must keep the v1 fixtures green (or bump the version and re-pin
deliberately).
