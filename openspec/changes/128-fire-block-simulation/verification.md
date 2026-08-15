# Verification: 128-fire-block-simulation

Status: NOT VERIFIED
Completion: 0%
Advancement allowed: false

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 fire block id 36, non-solid, 16-age-state | `tests/unit/FireBehavior.test.ts`; `BlockStateRegistry.test.ts` | NOT RUN |
| REQ-2 isFlammable = {Wood, Leaves, Planks} only | `tests/unit/FireBehavior.test.ts` | NOT RUN |
| REQ-3 ignite places fire only on ignitable cells | `tests/unit/FireBehavior.test.ts` | NOT RUN |
| REQ-4 age sequence + burn support at end of life | `tests/unit/FireBehavior.test.ts` | NOT RUN |
| REQ-5 extinguish when unsupported or water-adjacent | `tests/unit/FireBehavior.test.ts` | NOT RUN |
| REQ-6 bounded spread, ignitable-only, roll-controlled | `tests/unit/FireBehavior.test.ts` | NOT RUN |
| REQ-7 deterministic + safe on non-fire/state-less/throwing | `tests/unit/FireBehavior.test.ts` | NOT RUN |

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
