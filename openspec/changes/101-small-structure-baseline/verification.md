# Verification: 101-small-structure-baseline

Status: VERIFIED
Completion: 100%
Advancement allowed: true

101 started only after 100 was VERIFIED (a63b599 / 8e9d805).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Defaults | `StructureGenerator.test.ts`: template registry contains exactly `overworld/ruined_well` (size 5x3x5, 56 cobblestone blocks, hollow center, y=1/2 outer rings only); placement registry exactly the documented config (spacing 12/separation 4/salt 40101/biomeKeys plains+forest+taiga/minSurfaceHeight 33); repeated construction equal; default generator maxExtent 5 | PASS |
| Fail-fast construction | placement referencing a missing template throws /missing template/ | PASS |
| Deterministic blocks | `startAt` returns the exact start for the start chunk (known vector: (3,0) rotation 180) and [] otherwise; `blocksForChunk` returns 56 rotated blocks at exact world coords ((52,40,4) and (48,42,0) present, hollow center (50,40,2) absent); neighbor-chunk slicing: 20-wide template yields 16 blocks in the start chunk and 4 in the next chunk at exact rotated coords (67..64); overwrite order: later placement wins at the overlap; identical inputs twice -> identical | PASS |
| Terrain integration | end-to-end test: with seed 1234, a well start is found via the real biome/height context, the start chunk is generated, and the rotated corner block is `Cobblestone` at the exact world cell | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/StructureGenerator.test.ts` | PASS | 11/11 |
| `npm test` | PASS | 114 files, 1130/1130 (1119 baseline + 11 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.27s |
| `npm run test:e2e` | PASS | 19/19 (1.3m) |

## Edge / adversarial validation

- Defaults asserted exactly (template block count, ids, hollow center, config values) and
  deterministically.
- Rotation applied through the whole pipeline (template -> transform -> world coords) with
  exact cells; neighbor-chunk slicing verified with a template wider than a chunk; overwrite
  semantics verified at a shared cell; fail-fast construction verified.
- The dry-well design preserves the existing "never places water above sea level" invariant
  (no water block in the template).

## Migration / compatibility validation

Additive; `TerrainGenerator` constructor gains an optional third parameter (defaulted to the
seed's default generator), so all existing call sites and tests are unchanged. Worlds gain
deterministic structures; all pre-existing TerrainGenerator tests pass unchanged.

## Performance / resource validation

Per chunk: 9x9 window of O(1) placement queries for the default well (reach = ceil(5/16) = 1),
up to 57 writes. Unit suite duration unchanged (~10s, 114 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 1130/1130 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 101 the first generated structure (ruined well) is in place end-to-end through the
template system. Advance to 102-worldgen-golden-seeds.
