# Verification: 245-visual-regression-matrix

Status: NOT VERIFIED
Completion: 0%
Advancement allowed: false

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 capture-harness: per-cell deterministic capture | Pending implementation + `tests/e2e/visual-regression.spec.ts` | NOT VERIFIED |
| REQ-2 capture-harness: deterministic state assembly | Pending VITE_E2E boot/hook seam + e2e capture checks | NOT VERIFIED |
| REQ-3 capture-harness: golden lifecycle | Pending verify vs `UPDATE_SNAPSHOTS=1` runs | NOT VERIFIED |
| REQ-4 capture-harness: screen filter and full-matrix runs | Pending 60-cell matrix run + `SCREEN_FILTER` run | NOT VERIFIED |
| REQ-5 capture-harness: failure reporting | Pending injected-mismatch e2e assertions | NOT VERIFIED |
| REQ-1 golden-comparison: exact-mode equality | Pending `tests/unit/GoldenCompare.test.ts` › exact mode | NOT VERIFIED |
| REQ-2 golden-comparison: pixel-diff tolerance boundary | Pending › pixel-diff boundaries | NOT VERIFIED |
| REQ-3 golden-comparison: dimension mismatch | Pending › dimension mismatch | NOT VERIFIED |
| REQ-4 golden-comparison: missing golden | Pending › missing golden | NOT VERIFIED |
| REQ-5 golden-comparison: malformed input | Pending › decode error | NOT VERIFIED |
| REQ-6 golden-comparison: determinism | Pending › determinism | NOT VERIFIED |
| REQ-1 matrix-manifest: screen list | Pending `tests/unit/VisualMatrix.test.ts` › screens | NOT VERIFIED |
| REQ-2 matrix-manifest: quality profile axis | Pending › quality profiles | NOT VERIFIED |
| REQ-3 matrix-manifest: resolution axis | Pending › resolutions | NOT VERIFIED |
| REQ-4 matrix-manifest: cell enumeration and golden paths | Pending › cells and golden paths | NOT VERIFIED |
| REQ-5 matrix-manifest: manifest validation | Pending › validation | NOT VERIFIED |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | NOT RUN | Run at the final gate |
| npm run lint | NOT RUN | Run at the final gate |
| npm test | NOT RUN | Run at the final gate |
| npm run build | NOT RUN | Run at the final gate |
| npm run test:e2e | NOT RUN | Includes the 60-cell visual matrix |

## Edge/adversarial validation
- Missing golden fails in verify mode and writes only under `UPDATE_SNAPSHOTS=1`.
- `SCREEN_FILTER` narrows the run; the full 60-cell matrix passes when unset.
- Corrupt-golden decode-error and dimension-mismatch paths are distinct failures.
- One failing cell does not halt the remaining cells; all rows are reported.
- Normal release build has no `__voxelGame`/quality-seam exposure when `VITE_E2E`
  is absent.

## Migration/compatibility validation
- Pending: confirm shipped bundle is unchanged (VITE_E2E-only seam), no schema/
  save-format/registry/public-API change, and goldens are new non-shipped files.

## Performance/resource validation
- Pending: full matrix runs on a single worker within a bounded budget; comparison
  is O(w×h) with a byte-identity fast path; captures are released per cell.

## Regressions
- Pending: full baseline gate and prior e2e suite remain green alongside the matrix.

## Incomplete tasks
All tasks pending — implementation has not begun.

## Advancement Exception
Not applicable — completion is 0% and no requirement is verified.

## Final decision
Pending. This change advances only after all tasks complete and the baseline gate
passes.
