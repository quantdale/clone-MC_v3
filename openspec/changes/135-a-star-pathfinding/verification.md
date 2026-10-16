# Verification: 135-a-star-pathfinding

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 null exactly for unstandable start | `tests/unit/AStarPathfinding.test.ts` ("findPath — start validity") | PASS |
| REQ-2 reachable goal found within budget | `tests/unit/AStarPathfinding.test.ts` ("findPath — reachable goal") | PASS |
| REQ-3 unreachable goal yields best-effort partial | `tests/unit/AStarPathfinding.test.ts` ("findPath — unreachable goal (walled off)") | PASS |
| REQ-4 maxExpansions bounds the search | `tests/unit/AStarPathfinding.test.ts` ("findPath — maxExpansions bound") | PASS |
| REQ-5 cancellation aborts and reports | `tests/unit/AStarPathfinding.test.ts` ("findPath — cancellation") | PASS |
| REQ-6 determinism across repeated calls | `tests/unit/AStarPathfinding.test.ts` ("findPath — determinism") | PASS |
| REQ-7 isPathStale detects a blocking change | `tests/unit/AStarPathfinding.test.ts` ("isPathStale") | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1759/1759 (prior 1749 + 10 new `AStarPathfinding.test.ts`) |
| `npm run build` | PASS | `tsc --noEmit && vite build`, 83 modules (unchanged — no consumer yet) |
| `npm run test:e2e` | PASS | 21/21 Playwright, headless Chromium |

## Edge/adversarial validation
- The walled-off-room fixture verified that the search correctly stays bounded within the reachable
  region (no ceiling needed — an upward move naturally fails the support check once it leaves the
  floor's footprint) rather than needing a fully enclosed box, confirming `canStandAt`'s support rule
  does the containment work by itself.
- The `maxExpansions` test uses a 50-cell corridor with a budget of `3`, confirming the cap actually
  prevents reaching an otherwise-trivially-reachable goal (not just a theoretical bound).
- The cancellation test uses `isCancelled: () => true` (cancels on the very first check), confirming
  the search aborts before any real expansion work and still returns a well-formed result rather than
  throwing.
- Determinism verified by calling `findPath` twice with the exact same arguments on the same world
  and asserting `nodes` deep-equality and equal `expanded` counts — confirms the fixed neighbor order
  and `seq`-tiebreak produce byte-identical results, not just "a" valid path each time.
- `isPathStale`'s three cases were verified together: fresh (no change) is `false`; blocking a node
  actually returned by the search (`path.nodes[2]`, confirmed mid-corridor, not an endpoint) flips it
  to `true`; blocking a node before `fromIndex` (already "passed") correctly does not count, verifying
  the index boundary is honored precisely rather than checking the whole path unconditionally.

## Migration/compatibility validation
- One new, additive file (`src/simulation/AStarPathfinding.ts`); `git diff` confirms no edits to
  `NavigationGridQuery`, `VoxelShape`, `BlockRegistry`, or any other module. No schema/save-format
  change; no migration.

## Performance/resource validation
- `findPath` is bounded by `maxExpansions` (verified directly); each expansion generates exactly 6
  neighbor candidates via the fixed offset list; the linear-scan pop-min is O(open-set length) per
  expansion, consistent with the documented `O(maxExpansions^2)` worst case for the small, bounded
  defaults this change targets.

## Regressions
- Full unit suite green (1759/1759); no existing test file was touched, so no prior behavior could
  regress.
- Full e2e suite green (21/21) — nothing in `Game`/rendering/interaction consumes the new module.

## Incomplete tasks
None. All 5 tasks (1.1-5.1) complete with evidence.

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. All MUST/SHALL requirements have passing scenario evidence; the full baseline gate
(typecheck, lint, unit, build, e2e) is green; no regression, migration, or determinism risk is open.
Advance to 136.
