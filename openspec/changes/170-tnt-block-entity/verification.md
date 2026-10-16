# Verification: 170-tnt-block-entity

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 registration + single state | `tests/unit/TntPriming.test.ts` › `tnt registration` | PASS |
| REQ-2 fuse lengths (80/20) | `tests/unit/TntPriming.test.ts` › `tnt fuse ticks` | PASS |
| REQ-3 trigger combinations | `tests/unit/TntPriming.test.ts` › `tntShouldPrime` | PASS |
| REQ-4 primeTnt descriptor | `tests/unit/TntPriming.test.ts` › `primed TNT lifecycle` | PASS |
| REQ-5 fuse countdown/clamp | `tests/unit/TntPriming.test.ts` › `primed TNT lifecycle` | PASS |
| REQ-6 explodePrimedTnt | `tests/unit/TntPriming.test.ts` › `explodePrimedTnt` | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/TntPriming.test.ts` | PASS | 10 tests passed |
| `npm test` | PASS | **2310 passed (2310/2310)** — prior baseline + 10 new (TNT is stateless: only the BlockRegistry count needed updating) |
| `npm run build` | PASS | `tsc --noEmit && vite build` — 103 modules |
| `npm run test:e2e` | PASS | **22 passed (22/22)** headless Chromium |

## Edge/adversarial validation
- `tickPrimedTnt` with `1000` elapsed clamps at 0; `NaN`/negative elapsed are no-ops (fuse never
  corrupts).
- `tntShouldPrime` is total over all four boolean combinations.
- `explodePrimedTnt` inherits 169's non-finite short-circuits and is deterministic (repeated calls
  `toEqual`).

## Migration/compatibility validation
- One additive stateless block id + item id; the stateful-block characterization tests needed **no**
  edits (TNT falls into their single-state branch). No `Game.ts` edit; no schema/save-format change.

## Performance/resource validation
- `tickPrimedTnt` O(1); `explodePrimedTnt` inherits 169's bounded march (~24k queries at strength 4);
  one new stateless block state.

## Regressions
- Full unit suite 2310/2310; full e2e 22/22. Only the `BlockRegistry` count characterization changed
  (41→42).

## Incomplete tasks
- None. All 22 task items complete.

## Advancement Exception
Not applicable — completion is 100%, mandatory requirements pass, and required tests pass.

## Final decision
VERIFIED.
