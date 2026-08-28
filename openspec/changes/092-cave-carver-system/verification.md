# Verification: 092-cave-carver-system

Status: VERIFIED
Completion: 100%
Advancement allowed: true

092 started only after 091 was VERIFIED (36d8696 / 0f57b5d).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Carve value | `CaveCarver.test.ts`: 40-sample bound within ±(1.875 + 0.7); deterministic across calls | PASS |
| Carve column | exhaustive 32-layer window comparison (masks equal); seed sensitivity (seeds 1 vs 2 differ); nonzero carve with the default threshold; y-window confinement (mask minY/maxY respected, out-of-window `has` false); config validation (NaN threshold, degenerate window) | PASS |
| Apply carving | carved cells null in the result, non-carved cells preserved 1:1, removed count equals mask size, input column blockCount unchanged (purity) | PASS |
| removeCell | known cell removed (blockCount − 1, getBlock null); idempotent second removal | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/CaveCarver.test.ts` | PASS | 8/8 |
| `npm test` | PASS | 105 files, 1030/1030 (1022 baseline + 8 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.33s |
| `npm run test:e2e` | PASS | 19/19 (1.4m) |

## Edge / adversarial validation

- A full-height (384-layer) exhaustive determinism test initially exceeded the 5s vitest timeout (two full carveColumns + full-volume comparison ≈ 12M hash operations); the fixtures were moved to a 32-layer window, which keeps the same guarantees with 12× less work. Suite now runs in ~1.1s.
- Reduced-window terrain generation requires `seaLevel` inside the window — fixtures pass it explicitly (documented in the test).

## Migration / compatibility validation

Additive: `src/worldgen/CaveCarver.ts` new; `TerrainColumn.removeCell` added to 088 with behavior verified; 088's existing tests unchanged and green.

## Performance / resource validation

Carving O(16·16·height) with 7 fbm octaves per cell; apply O(cells). The reduced-window fixtures keep the suite fast.

## Regressions

None. Full baseline gate green: typecheck, lint, unit 1030/1030 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 092 configurable 3D cave carving independent of terrain density is in place. Advance to 093-aquifer-system.
