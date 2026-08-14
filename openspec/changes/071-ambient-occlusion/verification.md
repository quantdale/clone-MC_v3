# Verification: 071-ambient-occlusion

Status: VERIFIED
Completion: 100%
Advancement allowed: true

071 started only after 070 was VERIFIED (06356e9 / 182608d).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Quad data model | `OpaqueFaceQuad.vertexAO` (4-tuple, 070 corner order, values in {0,1,2,3}) required on all producers; GreedyMesher single-cube test asserts `vertexAO.length === 4`; AmbientOcclusion "fixed corner order" test asserts distinct per-position values `[0, 3, 2, 2]` | PASS |
| Minecraft AO table | AmbientOcclusion tests: both sides → 0; side+diagonal → 1; side only → 2; diagonal only → 2; none → 3; front cell `(fu,fv)` never consulted (opaque front cell → still 3) | PASS |
| Out-of-section cells never occlude | "treats out-of-section cells as non-occluding": corner (0,0) and (16,16) → 3 even with an opaque in-section front cell; section-edge corners in the GreedyMesher/Worker tests stay 3 | PASS |
| Fractional corners | "snaps fractional corner coordinates with floor()": slab-top face (y=0.5, layer y=1), corner (1.5,1.5) → fu=1/fv=1 → side1 (0,1,1) opaque → 2; all-OOB fractional corner → 3 | PASS |
| Determinism and orthogonality | AmbientOcclusion determinism test; GreedyMesher fixture-matrix `toEqual` determinism now covers `vertexAO`; 070 `vertexLights` assertions unchanged and green (orthogonality) | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/AmbientOcclusion.test.ts` | PASS | 10/10 |
| `npm test` | PASS | 83 files, 804/804 (792 baseline + 12 new: AmbientOcclusion 10, GreedyMesher AO 1, TemplateMesher AO 1); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.46s |
| `npm run test:e2e` | PASS | 19/19 (1.7m) |

## Edge / adversarial validation

- All five AO table cases plus front-cell exclusion (opaque `(fu,fv)` never changes the level).
- Out-of-section side/corner cells at corners (0,0) and (16,16) never occlude; the in-section front cell also never occludes.
- Fractional corners snap with `floor()` (1.5 → fu=1) on slab-top faces; fractional all-OOB corners stay 3.
- Integration: a 2×2 block with an occluder in the up-face outward layer → `vertexAO [2,3,3,3]` (GreedyMesher); full cube with diagonal occluder → `[3,3,3,2]` (TemplateMesher); worker payload occluder cell → `[3,3,3,2]` with unchanged light `[12,6,6,3]` (orthogonality).
- Worker equivalence fixture (greedy vs `processMeshSectionRequest`) now compares full quads including AO.

## Migration / compatibility validation

`OpaqueFaceQuad` gained a required field; every producer (062 greedy/naive, 063 template, 065 worker) and test call site in the repository emits/asserts it. No worker payload or stored-data changes. 070 `vertexLights` values unchanged.

## Performance / resource validation

AO adds at most 3 opacity reads per corner (12 per quad), bounds-guarded. Unit suite duration unchanged (~8.6s, 83 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 804/804 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 071 per-corner ambient occlusion (Minecraft 0-3 table, outward-layer 3-cell neighborhood) enters every generated mesh, orthogonal to 070 light. Advance to 072-biome-tint-rendering.
