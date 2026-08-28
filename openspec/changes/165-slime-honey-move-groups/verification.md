# Verification: 165-slime-honey-move-groups

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| `sticky_piston` shares `piston`'s `PISTON_SCHEMA` instance and default; item places it; enumerates exactly 12 states | `tests/unit/PistonStickyGroups.test.ts` "sticky piston registration" describe block | PASS |
| `wouldDrag` resolves the three compatibility cases (non-sticky, same-kind, different-kind) | "wouldDrag" describe block | PASS |
| `expandStickyGroup` grows through same-kind chains, stops at non-sticky passengers and different sticky kinds, fails on immovable, fails over the group-size limit | "expandStickyGroup" describe block (5 tests) | PASS |
| `orderGroupForMove` produces a safe execution order for a non-linear (L-shaped) group, verified end-to-end through 164's `executePistonPush` | "orderGroupForMove + executePistonPush — non-linear group" describe block | PASS |
| `extendPushPlanWithStickyGroup` passes through unchanged for a non-sticky plan and correctly grows a sticky-containing plan | "extendPushPlanWithStickyGroup" describe block | PASS |
| `planStickyRetract` handles no-op success, single-block pull, sticky cascade, and immovable failure | "planStickyRetract" describe block (4 tests) | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npx vitest run tests/unit/PistonStickyGroups.test.ts` | PASS | 18/18 tests, isolated run |
| `npx tsc --noEmit` | PASS | no output, zero errors |
| `npx eslint .` | PASS | no output, zero warnings/errors |
| `npx vitest run --testTimeout=30000` (full suite) | PASS | 188 test files, 2249 tests — up from the prior 2231 baseline (+18 from this change), zero regressions |
| `npm run build` | PASS | `tsc --noEmit && vite build`; 103 modules transformed, built in 1.50s |
| `npm run test:e2e` | PASS | 22/22 Playwright assertions passed in 2.1m (background run b51gat8ev), unaffected by this change |

## Edge/adversarial validation
- The L-shaped group test is the strongest single check in this change: it doesn't just call `orderGroupForMove` and inspect the array, it feeds the result straight through 164's real `executePistonPush` against an in-memory store and asserts the *exact* final positions and store size — proving the projection-based ordering generalization actually holds for a non-linear shape, not just a theoretical argument in design.md.
- The "non-sticky passenger doesn't further expand" test specifically constructs a scenario where a naive implementation (expanding from every group member regardless of its own stickiness) would incorrectly pull in a second, unrelated slime block — confirming only sticky positions extend the frontier.
- The "different sticky kind stops expansion" test directly exercises vanilla's easy-to-invert slime-does-not-stick-to-honey rule with a concrete slime→honey adjacency, not just the unit-level `wouldDrag` check.
- `extendPushPlanWithStickyGroup`'s no-op case asserts reference equality (`toBe`, not `toEqual`) against the input plan, catching an implementation that reconstructs an equivalent-but-distinct object where the spec requires the exact same one.

## Migration/compatibility validation
Purely additive: one new `BlockId`/`ItemId` (49), reusing the existing `PISTON_SCHEMA` instance (no new schema), one new module. No existing block, item, or schema definition was altered. Characterization tests (`BlockRegistry.test.ts`, `BlockPropertySchema.test.ts`, `BlockStateRegistry.test.ts`, `BlockItemSeparation.test.ts`) updated to include the new block/item and re-verified green.

## Performance/resource validation
`expandStickyGroup` is O(`maxGroupSize`) `PistonWorld`/`StickyWorld` calls (bounded by 163's `PISTON_PUSH_LIMIT`), independent of world size. `orderGroupForMove` is a single O(n log n) sort over the (small, bounded) group.

## Regressions
None. Full unit suite (2249 tests) and e2e suite (22 assertions) both green after this change, matching the pre-change baseline plus the 18 new tests.

## Incomplete tasks
None. All tasks.md items checked.

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. Advancement to 166-hopper-transfer is permitted. This closes the piston sub-arc
(163-165); the whole arc remains additive/unconsumed, matching 154-164's precedent.
