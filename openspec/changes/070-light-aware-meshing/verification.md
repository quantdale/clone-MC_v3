# Verification: 070-light-aware-meshing

Status: VERIFIED
Completion: 100%
Advancement allowed: true

070 started only after 069 was VERIFIED (321a591 / c4abc37).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Quad data model | `OpaqueFaceQuad.vertexLights` (4-tuple, fixed corner order) required on all producers; GreedyMesher "six 1x1 quads" asserts `vertexLights.length === 4`; VertexLighting "fixed corner order" test asserts `[(minU,minV), (maxU,minV), (minU,maxV), (maxU,maxV)]` with distinct hand-computed values `[(7,6), (9,10), (9,7), (11,11)]`; all values integers in [0,15] | PASS |
| Corner sampling rule | VertexLighting tests: open-air corner averages 4 cells `{sky:6, block:5}`; opaque cells contribute 0 and count (`{sky:4, block:4}` vs 5.33 if skipped); section edges skip out-of-section cells (corner (0,0) → single cell `{sky:9}`); all-out-of-section corner → `(0,0)`; fractional corners use the containing cell (`upFace(0.5)` → layer 1, single cell) | PASS |
| Outward layer selection | Integer max face → layer at `planeCoord` (up face y=1); integer min face → `planeCoord - 1` (down face y=-1, verified with a negative-Y world and with a y>=0 world giving (0,0)); fractional slab top (y=0.5) → `cellY + 1 = 1` (VertexLighting fractional test + TemplateMesher "slab top samples the cell above") | PASS |
| Worker payload carries light | WorkerMeshing tests: malformed arrays rejected (wrong length, 16, -1, 7.5 fractional); "lights quads from the payload light arrays" asserts corner values `[12, 6, 6, 3]` from a single lit cell; equivalence fixture: `processMeshSectionRequest` output equals `greedyMergeOpaqueFaces` with `sectionLightSampler(payload)` | PASS |
| Determinism | Repeated calls produce deeply equal quads (VertexLighting determinism test; GreedyMesher fixture-matrix `toEqual` determinism check now covers `vertexLights` too) | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/VertexLighting.test.ts` | PASS | 9/9 |
| `npm test` | PASS | 82 files, 792/792 (779 baseline + 13 new: VertexLighting 9, GreedyMesher light 1, TemplateMesher light 1, WorkerMeshing light 2); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.46s |
| `npm run test:e2e` | PASS | 19/19 (1.6m) |

## Edge / adversarial validation

- Corner with zero in-section sample cells (up face at section top, outward layer y=16) → `(0, 0)`, never NaN.
- Opaque sample cells count as 0 in the average (test distinguishes counted-0 from skipped: 4 vs 5.33).
- Fractional in-plane corners (`{floor(c)}` only) on the slab top face; fractional-plane outward-layer fallback (`cellY + 1`).
- Negative-Y worlds (minY=-2) for min-face layer `planeCoord - 1`.
- Worker light-array validation covers wrong length, out-of-range (16, -1), and fractional values; validation mirrors the existing `cells` check (throw, no partial result).
- Greedy-vs-naive equivalence now compares quads including `vertexLights` across the 062 fixture matrix.

## Migration / compatibility validation

`OpaqueFaceQuad` gained a required field; every producer (062 greedy/naive, 063 template, 065 worker) and every test call site in the repository was updated in this change. Worker payload shape changed (two required 4096-value arrays); no external producers exist. No stored data or serialization changes.

## Performance / resource validation

Corner sampling is at most 4 cell reads per corner (16 per quad); the worker validates the light arrays in one pass. Unit suite duration unchanged (~8s, 82 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 792/792 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 070 per-vertex light enters every generated mesh (greedy, naive, template, worker) with a deterministic corner-sampling rule and validated worker light payloads. Advance to 071-ambient-occlusion.
