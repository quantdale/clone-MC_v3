# Verification: 132-entity-chunk-tracking

Status: NOT VERIFIED
Completion: 0%
Advancement allowed: false

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 forgetChunk evicts regardless of lifecycle, frees ids | `tests/unit/EntityManager.test.ts` | NOT RUN |
| REQ-2 selectTickingEntities filters by predicate | `tests/unit/EntityChunkTracking.test.ts` | NOT RUN |
| REQ-3 deactivateChunk persists then forgets | `tests/unit/EntityChunkTracking.test.ts` | NOT RUN |
| REQ-4 activateChunk matches deserializeChunk's contract | `tests/unit/EntityChunkTracking.test.ts` | NOT RUN |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | NOT RUN | |
| `npm run lint` | NOT RUN | |
| `npm test` | NOT RUN | |
| `npm run build` | NOT RUN | |
| `npm run test:e2e` | NOT RUN | |

## Edge/adversarial validation
(to be filled after running)

## Migration/compatibility validation
(to be filled after running)

## Performance/resource validation
(to be filled after running)

## Regressions
(to be filled after running)

## Incomplete tasks
All tasks pending.

## Advancement Exception
Not applicable unless completion is 90-99.99%.

## Final decision
NOT VERIFIED — implementation not yet complete.
