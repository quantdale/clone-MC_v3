# Verification: 032-render-vs-simulation-distance

Status: VERIFIED
Completion: 100% (5/5 tasks)
Advancement allowed: true

032 started only after 031 was VERIFIED (0d0f972). All gate commands pass on the implementation commit.

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Independent radii configuration | `CONFIG.simulationDistance` (==6) + `CONFIG.headless.simulationDistance` (==2); `RenderSimulationDistance.fromConfig` defaults verified | PASS |
| Pure classifier distinguishes the two radii | `isWithinRenderDistance(4,0,0,0)=true`, `isWithinSimulationDistance(4,0,0,0)=false`; diagonal Chebyshev case; inside-sim case | PASS |
| Radii must be non-negative | Negative `renderDistance`/`simulationDistance` throw | PASS |
| World keeps streaming on the rendering radius | `World` integration: `getRenderDistance()=4`, `getSimulationDistance()=2`; streaming unchanged | PASS |
| World exposes a simulation gate | `isChunkSimulating(3,0)=false` (rendered, not ticking), `isChunkSimulating(2,0)=true`, `false` before first stream | PASS |
| Runtime distinguishes the radii | `Game.runtimeSimulationDistance()` passed into `World`; `Environment` keeps render distance; E2E green (no regression) | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | 0 errors |
| `npx vitest run tests/unit/RenderSimulationDistance.test.ts` | PASS | 11/11 tests |
| `npm test` | PASS | 478/478 (467 prior + 11 new) |
| `npm run build` | PASS | `tsc --noEmit && vite build` clean (49 modules) |
| `npm run test:e2e` | PASS | 19/19 |

## Edge / adversarial validation

- Negative radius → constructor throws, no partial instance escapes (tested for both fields).
- `isChunkSimulating` before any `update` (stream center `null`) returns `false`.
- `World` built without `simulationDistance` falls back to `CONFIG.simulationDistance` (tested: equals CONFIG default).
- Chebyshev distance uses the max axis, so diagonal chunk `(2,1)` at distance 2 is rendered while `(3,0)` is not.

## Migration / compatibility validation

New config keys only; defaults equal the prior render distance. No stored/public data formats changed. Existing `World` call sites pass `renderDistance` only and gain the `simulationDistance` fallback; `Game` explicitly passes it.

## Performance / resource validation

Classification is O(1) arithmetic with no allocation. `World` holds a single `RenderSimulationDistance` instance; streaming hot paths are untouched.

## Regressions

478/478 unit + 19/19 e2e green. No regression vs 031 baseline (467 unit / 19 e2e).

## Incomplete tasks

None.

## Advancement Exception

Not applicable (100%).

## Final decision

VERIFIED. Advance to 033-vertical-streaming.
