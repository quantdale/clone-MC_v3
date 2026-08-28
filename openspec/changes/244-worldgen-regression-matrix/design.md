# Design: 244-worldgen-regression-matrix

## Context / current state

Worldgen output is deterministic and seed-driven, and the game's actual produced world is
written by `src/world/TerrainGenerator.ts` (consumed by `src/engine/Game.ts`, `src/world/World.ts`,
`src/world/WorldLife.ts`). `TerrainGenerator` deterministically derives, all from `(seed, world
coordinates)` and never `Math.random()`:

- **Height** via `getHeightAt` (`fbm2` over `NOISE_SCALE`, `NOISE_OCTAVES`, `HEIGHT_AMPLITUDE`,
  around `CONFIG.seaLevel = 32`).
- **Biome** via `getBiomeAt` → one of `'plains' | 'forest' | 'desert' | 'taiga'`; a protected
  spawn radius (`Math.hypot(x, z) <= 48`) is always `'plains'`, and beyond it climate `fbm2`
  fields (`seed+17011`, `seed+29021`, `BIOME_SCALE`) classify the column.
- **Ores** via `getOreAt` → `BlockId.CoalOre` (14) when `valueNoise3(seed+52031) > 0.82`, else
  `BlockId.IronOre` (15) when `worldY < seaLevel-8` and `valueNoise3(seed+52057) > 0.84`, in
  `[bedrockY+3, min(surfaceHeight-3, seaLevel-1))` and outside the spawn `0.66` radius; otherwise
  the cell stays `Stone` (3).
- **Caves** via `isCaveAt` → the cell becomes `Air` (0) when both `valueNoise3(seed+41011) >
  0.77` and `valueNoise3(seed+41027) > 0.48`, in `(bedrockY+1, surfaceHeight-3)` and
  `(bedrockY+1, seaLevel-1)` and outside the spawn `0.66` radius.
- **Lava** via `isLavaAt` → `BlockId.Lava` (18) in a rare deep band.
- **Trees** via the `TreeFeature` system (`buildTreeBlocks`, `createDefaultTreeConfiguredFeatures`)
  with owner-anchored canopy.
- **Structures** via `StructureGenerator` (default `createDefaultStructureGenerator(seed)`):
  the dry ruined well template (cobblestone id 16) placed by the `StructurePlacement` spacing /
  separation / salt / biome / surface-height model (spacing 12, separation 4, salt 40101,
  biomeKeys `['plains','forest','taiga']`, minSurfaceHeight 33).

`GoldenSeed.ts` (change 102) already pins four seams — `hash2`, `hash3`, `surface`, `block` —
through a `GoldenWorldProbe` implemented over `TerrainGenerator` (see
`tests/unit/GoldenSeed.test.ts::TerrainProbe`), with `GOLDEN_VERSION = 'v1'` and a 12-fixture
`createDefaultGoldenFixtures` set over seeds `{42, 1234, 9999}`. Those fixtures and their
verifier are VERIFIED and MUST NOT be modified by this change.

Important architectural fact: the standalone pipeline modules
(`DensityComposition`, `DensityNoise`, `ClimateSampler`, `BiomeSource`, `SurfaceRuleEngine`,
`CaveCarver`, `AquiferSystem`, `ConfiguredFeature`, `PlacedFeature`, `OreFeature`,
`VegetationFeature`, `GenerationPipeline`, `WorkerWorldgen`) exist and are independently tested
(085–100) but are **not** wired into production generation. Only `TreeFeature` and
`StructureGenerator` (via `StructurePlacement`/`StructureTemplate`) are consumed by
`TerrainGenerator`. Therefore the regression matrix MUST pin the actual produced world through
`TerrainGenerator`, not through the unwired standalone modules. The design calls this out so the
implementer does not accidentally validate the pipeline instead of the world the game renders.

There is no global worldgen data-version constant. `GOLDEN_VERSION = 'v1'` (102) and
`WORLDGEN_PROTOCOL_VERSION = 1` (worker envelope, unwired) are the only version tags. The
matrix therefore owns its own version scheme and defines a registry-state fingerprint, since
`BlockId` values (e.g. `CoalOre = 14`, `IronOre = 15`, `Cobblestone = 16`) are the persistent
save identity and a renumber would silently invalidate pinned block fixtures.

## Target state

A new additive module `src/worldgen/WorldgenRegressionMatrix.ts` that:

- Defines matrix fixture kinds for biome, structure, ore, and cave in addition to surface,
  block, hash2, and hash3.
- Provides a headless, deterministic `verifyWorldgenMatrix` over a
  `TerrainGenerator`-backed probe, reporting pass/fail per fixture and never throwing on value
  mismatches.
- Provides `worldgenMatrixHash` (one stable 32-bit digest per matrix) and
  `fingerprintWorldgenState` (one stable digest of the generation-relevant registry state).
- Provides the documented `v1` catalog `createDefaultWorldgenMatrix` and the
  `SUPPORTED_WORLDGEN_MATRIX_VERSIONS` policy (`['v1']` today), so future worldgen/registry
  changes must deliberately bump the version and re-pin.

## Invariants

- `kind` ∈ `{ hash2, hash3, surface, biome, block, ore, cave, structure }`; `key`/`version`
  non-empty strings; `seed` non-negative safe integer; `x`/`y`/`z` safe integers (negative
  allowed); `expected` kind-appropriate.
- `verifyWorldgenMatrix` computes each fixture's actual per kind in fixture order and reports
  `pass: actual === expected`; value mismatches never throw.
- A probe/generation exception during verification is recorded as a failed entry carrying the
  error text (never swallowed silently), and verification continues over the remaining fixtures.
- Identical inputs produce identical results; `worldgenMatrixHash` is stable for identical
  verification outputs and changes when any fixture's `actual` changes.
- `fingerprintWorldgenState` is deterministic over registration order and changes when any
  generation-relevant block id → resource id mapping or any structure template/placement config
  changes.
- Only fixtures whose `version` is in `SUPPORTED_WORLDGEN_MATRIX_VERSIONS` are enforced green by
  the suite.
- The probe reflects the actual produced world (`TerrainGenerator`), not the unwired pipeline
  modules.

## API and data model

```ts
// src/worldgen/WorldgenRegressionMatrix.ts (NEW, additive)
export type MatrixFixtureKind =
  | 'hash2'    // hash2(x, z, seed)                       -> number (uint32)
  | 'hash3'    // hash3(x, y, z, seed)                    -> number (uint32)
  | 'surface'  // world.surfaceHeight(seed, x, z)         -> number (height)
  | 'biome'    // world.biomeAt(seed, x, z)               -> string (biome id)
  | 'block'    // world.blockAt(seed, x, y, z)            -> number (block id)
  | 'ore'      // world.blockAt(...) must be an ore       -> number (CoalOre|IronOre|Stone control)
  | 'cave'     // world.blockAt(...) must be carved/solid -> number (Air|solid control)
  | 'structure';// world.structurePresent(seed, cx, cz)   -> string ('present'|'absent')

export interface MatrixFixture {
  key: string;
  kind: MatrixFixtureKind;
  version: string; // matrix version (e.g. 'v1'); must be in SUPPORTED_WORLDGEN_MATRIX_VERSIONS
  seed: number;    // non-negative safe integer
  x: number;       // world coordinate (safe integer; negative allowed)
  y: number;       // world coordinate (hash3/block/ore/cave only)
  z: number;       // world coordinate (safe integer; negative allowed)
  expected: number | string; // number for numeric kinds; biome id / 'present'|'absent' for string kinds
}

export interface MatrixWorldProbe {
  surfaceHeight(seed: number, x: number, z: number): number;
  biomeAt(seed: number, x: number, z: number): string;
  blockAt(seed: number, x: number, y: number, z: number): number;
  structurePresent(seed: number, chunkX: number, chunkZ: number): boolean;
}

export interface MatrixFixtureResult {
  key: string;
  kind: MatrixFixtureKind;
  pass: boolean;
  actual: number | string | null;
  error?: string; // set when the probe threw for this fixture
}

export const WORLDGEN_MATRIX_VERSION = 'v1';
export const SUPPORTED_WORLDGEN_MATRIX_VERSIONS: readonly string[] = ['v1'];

export function validateMatrixFixture(input: unknown): MatrixFixture;
export function verifyWorldgenMatrix(
  fixtures: readonly MatrixFixture[],
  world: MatrixWorldProbe,
): MatrixFixtureResult[];
export function worldgenMatrixHash(
  fixtures: readonly MatrixFixture[],
  world: MatrixWorldProbe,
): number;
export function fingerprintWorldgenState(options: {
  blockRegistry: BlockRegistry;
  templates: StructureTemplateRegistry;
  placements: StructurePlacementRegistry;
}): string;
export function createDefaultWorldgenMatrix(version?: string): MatrixFixture[];
```

Sketches describe intent and do not override normative spec requirements.

## Control / data flow

1. An **authoring script** (run during implementation, not shipped) constructs a
   `TerrainGenerator`-backed probe per seed, samples the concrete fixture coordinates, computes
   each fixture's `expected`, computes `worldgenMatrixHash` and `fingerprintWorldgenState`, and
   emits the `v1` catalog + both digests verbatim into `createDefaultWorldgenMatrix` and the
   pinned constants.
2. The unit suite builds a `TerrainGenerator`-backed probe (per-seed generator + chunk cache,
   mirroring `GoldenSeed.test.ts::TerrainProbe`) and asserts:
   - every `v1` catalog fixture passes;
   - `worldgenMatrixHash` equals the pinned value;
   - `fingerprintWorldgenState(createDefaultBlockRegistry(), default templates, default
     placements)` equals the pinned value.
3. Any future worldgen/registry change that alters a pinned outcome fails one or more fixtures
   and/or the hash/fingerprint, and MUST be resolved by bumping `WORLDGEN_MATRIX_VERSION`,
   re-running the authoring script, and updating `SUPPORTED_WORLDGEN_MATRIX_VERSIONS`.

## Detailed behavior

- **Matrix fixture kinds and actual computation:**
  - `hash2` → `hash2(x, z, seed)` (uint32, from `math/PRNG`).
  - `hash3` → `hash3(x, y, z, seed)` (uint32).
  - `surface` → `world.surfaceHeight(seed, x, z)` (the world Y of the surface block).
  - `biome` → `world.biomeAt(seed, x, z)`; `expected` MUST be one of `'plains' | 'forest' |
    'desert' | 'taiga'`.
  - `block` → `world.blockAt(seed, x, y, z)`; `expected` is a non-negative integer block id.
  - `ore` → `world.blockAt(seed, x, y, z)`; `expected` MUST be `BlockId.CoalOre`, `BlockId.IronOre`,
    or `BlockId.Stone` (no-ore control sampled at a deep-stone coordinate in the valid ore band).
  - `cave` → `world.blockAt(seed, x, y, z)`; `expected` MUST be `BlockId.Air` (carved) or a solid
    id (not-carved control sampled in the cave band).
  - `structure` → `world.structurePresent(seed, chunkX, chunkZ)`; `expected` MUST be `'present'`
    or `'absent'`. `chunkX`/`chunkZ` are derived from `x`/`z` as `Math.floor(x / 16)`,
    `Math.floor(z / 16)`; the fixture's `x`/`z` are the start-chunk-center world coordinates and
    `y` is ignored for this kind.
- **Probe implementation (headless, per seed):** mirror `GoldenSeed.test.ts::TerrainProbe` but
  add `biomeAt` → `TerrainGenerator.getBiomeAt`, and `structurePresent` → build
  `createDefaultStructureGenerator(seed)` and return `startAt(chunkX, chunkZ, ctx).length > 0`
  where `ctx = { biomeKey: (x,z) => getBiomeAt(x,z), surfaceY: (x,z) => getHeightAt(x,z) }` — the
  exact generator and context `TerrainGenerator` uses, so structure presence reflects the
  produced world. `blockAt` reads a generated, cached `Chunk` (`generateChunk` + `Chunk.getLocal`),
  which includes carved caves, ores, trees, and placed structures.
- **Verification:** per fixture in input order, compute actual (skipping none), push
  `{ key, kind, pass, actual }`. A thrown probe exception for a fixture produces
  `{ key, kind, pass: false, actual: null, error: <message> }` and verification continues.
- **Matrix hash:** FNV-1a 32-bit (matching `SeedRng.hashString`'s style) over the canonical
  string of every fixture in order:
  `version | key | kind | seed | x | y | z | String(actual)`, joined by `\n`. Stable for identical
  outputs; changes iff some `actual` changes.
- **Registry-state fingerprint:** FNV-1a 32-bit over two canonical sections: (a) the
  generation-relevant block ids `{ Bedrock, Grass, Dirt, Stone, Sand, Water, Gravel, CoalOre,
  IronOre, Lava, Wood, Leaves, Snow, Cobblestone }` in ascending numeric id order as
  `id:resourceId`; (b) every structure template in registration order as
  `key|w|h|d|blocksLength`, then every placement config in registration order as
  `key|templateKey|spacing|separation|salt|minSurfaceHeight|biomeKeys.join(',')`. Registration
  order is the order returned by `all()`.

## Failure modes

- `validateMatrixFixture` throws field-naming errors for malformed shapes and kind-inconsistent
  `expected` types.
- `verifyWorldgenMatrix` never throws on value mismatches; a probe/generation exception surfaces
  as a failed fixture entry with `error`, so generation crashes are visible and do not abort the
  whole report.
- A fixture whose `version` is not in `SUPPORTED_WORLDGEN_MATRIX_VERSIONS` is rejected by
  validation, so the suite cannot silently run a stale version.
- A registry/template/placement change that shifts block ids or structure output changes the
  fingerprint and/or specific fixtures; the run reports the failing fixtures, the matrix hash,
  and the current fingerprint so the exact break is diagnosed.

## Compatibility / migration

Additive. `GoldenSeed.ts` and all existing modules are untouched. The `v1` fixtures, matrix
hash, and registry fingerprint are generated once from the verified implementation by the
authoring script and embedded verbatim. A future deliberate change bumps `WORLDGEN_MATRIX_VERSION`
and updates `SUPPORTED_WORLDGEN_MATRIX_VERSIONS`.

## Performance / resource constraints

Verification is O(fixtures) and each block/ore/cave/`surface`/`biome` fixture samples a chunk
generated once and cached per seed (≤ number of distinct seed+column pairs). `structurePresent`
uses `startAt` (O(1) region query). The `v1` catalog is sized so the full suite stays within the
existing unit-suite runtime budget (~10s, ~1s per large file); the catalog MUST NOT grow beyond
the documented bounds in the fixtures spec without a rationale recorded in `tasks.md`.

## Testing seams

- `tests/unit/WorldgenRegressionMatrix.test.ts` (NEW):
  - validation matrix (every kind valid; empty key/version; unknown kind; negative/fractional
    seed; non-integer coords; kind-inconsistent `expected`; unsupported version);
  - per-kind actual computation against the headless probe;
  - the full `v1` catalog passes against a `TerrainGenerator`-backed probe;
  - `worldgenMatrixHash` stable across identical runs and changes when one fixture's actual
    differs;
  - `fingerprintWorldgenState` stable for the default state and sensitive to a block-id change,
    a template change, and a placement change;
  - mismatch reporting without throws (tampered fixture → `pass: false` with actual);
  - probe-error surfacing (a throwing probe → failed entry with `error`, verification continues);
  - determinism (identical inputs twice → identical reports and hash);
  - version policy (`SUPPORTED_WORLDGEN_MATRIX_VERSIONS` rejects unsupported versions, and the
    `v1` catalog is version `'v1'`).

## Observability / debugging

Reports are plain data: per-fixture `{key, kind, pass, actual, error?}`, plus a top-level matrix
hash and registry fingerprint the suite asserts. On failure the test output lists exactly which
fixtures moved and the current hash/fingerprint versus the pinned values.

## Affected files / symbols

- `src/worldgen/WorldgenRegressionMatrix.ts` — NEW.
- `tests/unit/WorldgenRegressionMatrix.test.ts` — NEW.
- This OpenSpec package. No existing production file is modified.

## Rejected alternatives

- *Extend `GoldenFixtureKind` in `GoldenSeed.ts` with the new kinds*: changes 102's VERIFIED
  contract and its fixture/verifier shape; rejected in favor of an additive sibling module.
- *Pin whole-chunk hashes (snapshot the full chunk)*: over-broad and brittle; targeted
  per-dimension fixtures name the seam that moved, matching 102's philosophy.
- *Wire the standalone pipeline modules (085–100) as the probe*: they are not the produced
  world; the matrix must guard the actual generator.
- *A throwing verifier*: pass/fail reports (as in 102) let future changes see exactly which
  pins moved, and probe errors are surfaced as failed entries rather than swallowed.

## Downstream dependencies

Future worldgen or registry changes MUST keep the supported matrix green or deliberately bump
`WORLDGEN_MATRIX_VERSION` and re-pin. This matrix is a prerequisite baseline for the final
parity reconciliation (248) and for the deterministic-replay suite (241) to rely on stable
generation.
