# Verification: 244-worldgen-regression-matrix

Status: VERIFIED
Completion: 100% (15/15 tasks)
Advancement allowed: yes (no exception used)

## Baseline (task 1.1)

Entry commit `0783031c47b518bdbf0fe2ea84c4b9eb8123b3fa` (243 VERIFIED, published). Full gate
green at entry: typecheck PASS, lint PASS, unit 285 files / 3694 passed + 1 skipped, build
PASS, e2e 35/35. Baseline unit count 3694 (+1 skipped); baseline E2E count 35.

## Probe characterization (task 1.2)

Verified against source:

- `TerrainGenerator` (`src/world/TerrainGenerator.ts`): `getHeightAt(x,z)`, `getBiomeAt(x,z)`
  (→ `'plains'|'forest'|'desert'|'taiga'`), `generateChunk(chunk)`; `isCaveAt` public;
  `getOreAt`/`isLavaAt` private — block fixtures therefore read generated chunks.
- `Chunk.getLocal(lx,ly,lz)` returns the raw block id (no bounds check); chunks are
  `new Chunk(cx, 0, cz)` + `generateChunk`, cached per seed+column in the probe.
- Structures: `TerrainGenerator`'s default third ctor arg is
  `createDefaultStructureGenerator(seed)`; it calls `structures.blocksForChunk(cx,cz,{biomeKey,
  surfaceY})`. The probe's `structurePresent` therefore builds
  `createDefaultStructureGenerator(seed)` and evaluates
  `startAt(chunkX, chunkZ, { biomeKey: (x,z)=>gen.getBiomeAt(x,z), surfaceY: (x,z)=>gen.getHeightAt(x,z) }).length > 0`
  — the exact generator/context the produced world uses. `structures` itself is private on
  `TerrainGenerator`, so the probe constructs its own instance with the same seed (identical
  configuration).
- Authoring run (deterministic discovery over seeds {0,1,42,1337,1234,9999}): found all four
  biomes outside the spawn radius (forest/desert/taiga first hits on seed 0), coal at (−256,15,
  −216), iron at (−256,3,−256), stone control at (−256,6,−256) [seed 0], carved cave at
  (−256,23,−192), not-carved control at (−256,2,−256) [seed 0], structure present for seed 42 at
  chunk (−35,40) and absent at chunk (−40,−40). Catalog: **31 fixtures** (within the 24–40
  bound), matrix hash **900732084**, registry fingerprint **`6e654848`** — embedded verbatim in
  `createDefaultWorldgenMatrix` / `PINNED_V1_MATRIX_HASH` / `PINNED_WORLDGEN_STATE_FINGERPRINT`.
- Design drift: none requiring design changes. The fingerprint selects generation-relevant
  blocks by resource path (then records `legacyId:path` ascending), which makes the required
  block-id-remap sensitivity testable without renumbering a const enum.

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| Matrix fixture validation (REQ-1) | WorldgenRegressionMatrix.test.ts: "validateMatrixFixture accepts a fixture of every kind..."; rejection matrix naming each field; unsupported-version rejection | PASS |
| Verification over produced world (REQ-2) | per-kind computation tests incl. structurePresent via createDefaultStructureGenerator+startAt with the TerrainGenerator context | PASS |
| Matrix hash stability/sensitivity (REQ-3) | hash stable across calls; differs when a mock probe shifts surfaceHeight by +1 | PASS |
| Registry-state fingerprint (REQ-4) | stable twice; changes on coal_ore id remap / added template block / placement spacing change | PASS |
| Determinism and independence (REQ-5) | two fresh probes produce deep-equal reports and identical hash | PASS |
| Seed set coverage (F-REQ-1) | catalog covers exactly {0,1,42,1337,1234,9999}, each seed with >=1 surface+block+biome fixture | PASS |
| Coordinate coverage (F-REQ-2) | origin, negative, far-positive (>100), chunk-boundary columns; y=0 bedrock, ore band, cave band, surface-adjacent | PASS |
| Biome coverage (F-REQ-3) | biome expecteds exactly {plains,forest,desert,taiga} plus plains at (0,0) spawn guard | PASS |
| Structure coverage (F-REQ-4) | present (seed 42 chunk -35,40) + absent fixtures through the real generator/context | PASS |
| Ore coverage (F-REQ-5) | CoalOre(14)/IronOre(15)/Stone(3) control fixtures in the valid ore band | PASS |
| Cave coverage (F-REQ-6) | carved Air(0) + not-carved Stone(3) control in the cave band | PASS |
| Hash/surface/block continuity (F-REQ-7) | >=1 each of hash2/hash3/surface/block verified against PRNG/probe | PASS |
| Supported versions and catalog bounds (F-REQ-8) | 36 fixtures within [24,40]; createDefaultWorldgenMatrix('v9') throws; two constructions deep-equal | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | PASS | clean incl. module + suite |
| npm run lint | PASS | eslint . clean |
| npx vitest run tests/unit/WorldgenRegressionMatrix.test.ts | PASS | 25 passed / 0 failed |
| npm test | PASS | 3719 passed + 1 skipped (+25 vs baseline 3694) |
| npm run build | PASS | dist emitted |
| npm run test:e2e | PASS | 35 passed (7.0m); unchanged by this additive change |

## Edge/adversarial validation
Covered by the suite: boundary seeds (0, 2147483646) and coordinates (+/-100000, chunk-boundary),
mismatch reporting without throws, probe-error surfacing (failed entry with error, verification
continues), registry-fingerprint sensitivity (id remap / template block / placement spacing),
unsupported-version rejection at validation and catalog request.

## Migration/compatibility validation
Confirmed additive: `git status -- src/worldgen/GoldenSeed.ts src/math/ src/world/TerrainGenerator.ts`
is empty; full unit suite green including the 102 GoldenSeed fixtures.

## Performance/resource validation
36-fixture catalog verifies in well under a second against the cached probe (suite file total
~1.3s); authoring self-check runs in seconds. Within the unit-suite runtime budget.

## Regressions
None: full unit suite green (3719 passed + 1 skipped vs baseline 3694 + 1 skipped); build green;
e2e unchanged by this additive change.

## Incomplete tasks
None. All 15 tasks complete with evidence above (4.2's state advance recorded in
PROGRAM_STATE.json/md).

## Advancement Exception
Not applicable until completion is 90-99.99%.

## Final decision
VERIFIED — 15/15 tasks (100%), every MUST/SHALL requirement reconciled with passing evidence,
full gate green (typecheck, lint, unit 286 files / 3719 passed + 1 skipped, build, e2e 35/35),
no unresolved blocker, no advancement exception used. Change 245 (visual-regression-matrix)
is eligible to activate.

## Re-pin note
The catalog was regenerated once during implementation to satisfy the fixtures spec's per-seed
biome coverage (seeds 1/1337/1234/9999 gained biome fixtures): final catalog is 36 fixtures with
matrix hash 1789027111 (fingerprint unchanged, 6e654848). The authoring tool lives at
scripts/worldgen/author-worldgen-matrix.test.ts (run via scripts/worldgen/vitest.author.config.ts).
