# Verification: 280-death-respawn-ui

Status: NOT VERIFIED
Progress: 9/10 (90%)
Advancement allowed: false

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Safe cause mapping | `tests/unit/DeathRespawnPresentation.test.ts` | PASS (3/3 focused) |
| Normal respawn card | `tests/unit/DeathRespawnPresentation.test.ts`, `tests/unit/SurvivalSystem.test.ts`, `tests/e2e/death-respawn.spec.ts` | PASS (2/2 browser) |
| Hardcore spectator card | `tests/unit/DeathRespawnPresentation.test.ts`, `tests/e2e/death-respawn.spec.ts` | PASS (2/2 browser) |
| Lifecycle and persistence non-interference | `tests/unit/DeathRespawnPanel.test.ts`, `tests/e2e/death-respawn.spec.ts`, full 259–279 regression | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` |
| `npm run lint` | PASS | 0 errors, 85 existing non-failing warnings |
| `npm test` | PASS | 442 files; 5243 passed + 1 skipped (5244 total) |
| `npm run build` | PASS | 244 modules; existing chunk-size advisory only |
| `npm run test:e2e` | PASS | Exact no-retry run: 102/102, including visual matrix 60/60, memory/resource coverage, and both 280 tests |
| file-audit | PASS | 2862 rows; reviewed manifest |
| `npm run validate-state` | PASS | state validator green |

## Edge/adversarial validation

PASS — closed reason map, malformed input, missing inner DOM, repeated
dismissal, pointer-lock/container lifecycle, and real DOM dismissal are
covered. Game treats a missing root death element as presentation-only
degradation.

## Migration/compatibility validation

PASS — no persistence/schema code changed; the full death/save regression
including 267 hardcore, 274 bed spawn, and 278/279 pagehide paths is green.

## Performance/resource validation

PASS — presentation work is limited to death, dismiss, and lifecycle events;
no tick/render path writes the card. The full production build and 60-cell
visual matrix remain green.

## Regressions

PASS — the dedicated 259–279 regression produced 36/37 direct passes; its one
known software-WebGL spectator descent threshold miss (`33.2 < 30`) reproduced
in isolation and is unrelated to 280. The exact full suite then passed 102/102
on the same tree, including all affected 259–279 journeys.

## Incomplete tasks

T10 remains: reconcile C280, mark 280 VERIFIED, publish, and checkpoint 281
spec-first.

## Advancement Exception

Not applicable; target completion is 100%.

## Final decision

NOT VERIFIED — implementation and gates are complete, but C280 reconciliation,
publication, and the 281 spec-first checkpoint remain.
