# Verification: 198-sleep-and-time-skip

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 night window | `tests/unit/SleepFramework.test.ts` › night window and sleep permission | PASS |
| REQ-2 bed entry | › bed entry | PASS |
| REQ-3 leaving a bed | › leaving a bed | PASS |
| REQ-4 spawn query | › spawn query | PASS |
| REQ-5 all players sleep | › occupancy | PASS |
| REQ-6 night skip | › night skip | PASS |
| REQ-7 persistence | › persistence | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/SleepFramework.test.ts` | PASS | 17 tests passed |
| `npm test` | PASS | **2614 passed (2614/2614)** — prior 2597 + 17 new, additive-only file |
| `npm run build` | PASS | `tsc --noEmit && vite build` — 103 modules |
| `npm run test:e2e` | PASS | **22 passed (22/22)** headless Chromium |

## Edge/adversarial validation
- Night-window boundaries pinned (12541/12542/23459/23460/0); storm overrides day.
- Occupancy rejects double-beds structurally; counts/total edges pinned.
- Spawn survives waking; spawn query null until set.
- Every deserialization rejection named (incl. NaN in spawn).

## Migration/compatibility validation
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource validation
- All operations O(1).

## Regressions
- Full unit suite 2614/2614; full e2e 22/22. No production or characterization test changed.

## Incomplete tasks
- None. All 20 task items complete.

## Advancement Exception
Not applicable — completion is 100%, mandatory requirements pass, and required tests pass.

## Final decision
VERIFIED.
