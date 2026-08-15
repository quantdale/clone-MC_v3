# Verification: 134-navigation-grid-query

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 classifyNode identifies each kind correctly | `tests/unit/NavigationGridQuery.test.ts` ("classifyNode") | PASS |
| REQ-2 cost ordering + isPassable partition | `tests/unit/NavigationGridQuery.test.ts` ("nodeCost / isPassable") | PASS |
| REQ-3 canStandAt requires passable body + support | `tests/unit/NavigationGridQuery.test.ts` ("canStandAt") | PASS |
| REQ-4 movementCost reflects occupancy + feet cost | `tests/unit/NavigationGridQuery.test.ts` ("movementCost") | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1749/1749 (prior 1736 + 13 new `NavigationGridQuery.test.ts`) |
| `npm run build` | PASS | `tsc --noEmit && vite build`, 83 modules (unchanged — no consumer yet) |
| `npm run test:e2e` | PASS | 21/21 Playwright, headless Chromium |

## Edge/adversarial validation
- The collision-shape-takes-priority scenario is verified directly: a cell with block id `Water` but
  an explicitly overridden non-empty collision shape classifies `Blocked`, not `Water`.
- `canStandAt` verified across five distinct scenarios: solid ground with clear headroom (`true`),
  obstructed headroom (`false`), no ground and not water (`false`), floating in water with no ground
  (`true`), and a lava feet cell with solid ground below (`false` — lava is never passable regardless
  of support).
- The cost-ordering and `isPassable`-partition requirements are each verified as a single assertion
  chain covering all five `PathNodeType` values together, directly matching the spec's stated
  invariant rather than testing pairs in isolation.
- `movementCost` verified for both finite outcomes (`Open`, `Water`) and both `Infinity` outcomes
  (obstructed headroom, no ground/no water).

## Migration/compatibility validation
- One new, additive file (`src/simulation/NavigationGridQuery.ts`); `git diff` confirms no edits to
  `VoxelShape`, `CollisionResolver`, `BlockRegistry`, `FluidState`, or any other module. No
  schema/save-format change; no migration.

## Performance/resource validation
- `classifyNode` is O(1) (one collision-shape lookup, one block-id lookup); `canStandAt` is
  O(height) lookups; `movementCost` is O(height) (delegates to `canStandAt`, then one more O(1)
  `classifyNode` call) — all confirmed by direct inspection of the implementation (no loops beyond
  the documented `height` iteration).

## Regressions
- Full unit suite green (1749/1749); no existing test file was touched, so no prior behavior could
  regress.
- Full e2e suite green (21/21) — nothing in `Game`/rendering/interaction consumes the new module.

## Incomplete tasks
None. All 5 tasks (1.1-5.1) complete with evidence.

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. All MUST/SHALL requirements have passing scenario evidence; the full baseline gate
(typecheck, lint, unit, build, e2e) is green; no regression, migration, or determinism risk is open.
Advance to 135.
