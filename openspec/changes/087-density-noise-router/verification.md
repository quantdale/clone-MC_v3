# Verification: 087-density-noise-router

Status: VERIFIED
Completion: 100%
Advancement allowed: true

087 started only after 086 was VERIFIED (69dace3 / c38352c).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Hash noise | `DensityNoise.test.ts`: deterministic and in [0, 1) across three coordinate/seed cases; varies with coordinates and seed | PASS |
| Value noise | lattice exactness at integer coords (incl. negatives); exact period wrap (64 per axis); 200-sample range check within [-1, 1]; determinism across instances | PASS |
| fbm | 50-sample bound within ±(1 + 0.5 + 0.25 + 0.125); deterministic | PASS |
| Node evaluation | constants; yGradient clamped at both ends and linear mid-ramp; noise node equals `noise.sample(x·sx+ox, …)`; add/multiply/scale/offset/min/max/clamp hand-computed (8, 15, 10, 3, 3, 5, 4, 6); nested tree `((4/8·2−1)+1)·0.5 = 0.5` | PASS |
| Validation | valid 7-type tree accepted; unknown type, NaN/absent value, degenerate yGradient, inverted clamp, missing b rejected; 70-deep tree rejected with `/depth/i` | PASS |
| Purity | repeated evaluation equal; tree JSON unchanged after evaluation | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/DensityNoise.test.ts tests/unit/DensityComposition.test.ts` | PASS | 7/7 + 7/7 |
| `npm test` | PASS | 100 files, 990/990 (975 baseline + 15 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.34s |
| `npm run test:e2e` | PASS | 19/19 (1.4m) |

## Edge / adversarial validation

- Value noise covers negative integer lattice coords and per-axis periods.
- yGradient clamps outside the ramp; clamp nodes handle both directions.
- Validation matrix covers unknown types, missing/NaN fields, degenerate ranges, and the 64-depth cap.
- fbm bounded analytically (amplitude sum) across 50 samples.

## Migration / compatibility validation

Additive: `src/worldgen/DensityNoise.ts`, `src/worldgen/DensityComposition.ts`, and two test files. No existing modules touched.

## Performance / resource validation

Evaluation O(1) per node (8 lattice hashes per noise sample); validation O(nodes). Unit suite duration unchanged (~8s, 100 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 990/990 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 087 reusable deterministic 3D density/noise composition primitives are in place. Advance to 088-overworld-density-terrain.
