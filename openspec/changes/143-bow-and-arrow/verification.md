# Verification: 143-bow-and-arrow

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 bowPullProgress reference points | `tests/unit/BowAndArrow.test.ts` ("bowPullProgress") | PASS |
| REQ-2 computeFireVelocity scales/directs correctly | `tests/unit/BowAndArrow.test.ts` ("computeFireVelocity") | PASS |
| REQ-3 computeArrowDamage non-negative/monotonic | `tests/unit/BowAndArrow.test.ts` ("computeArrowDamage") | PASS |
| REQ-4 canFireBow ammo gate | `tests/unit/BowAndArrow.test.ts` ("canFireBow") | PASS |
| REQ-5 LandedArrowTracker delay+radius gating | `tests/unit/BowAndArrow.test.ts` ("LandedArrowTracker") | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1842/1842 (prior 1827 + 15 new `BowAndArrow.test.ts`) |
| `npm run build` | PASS | `tsc --noEmit && vite build`, 83 modules (unchanged — no consumer yet) |
| `npm run test:e2e` | PASS | 21/21 Playwright, headless Chromium |

## Edge/adversarial validation
- `computeFireVelocity` is verified with both a unit direction and a non-unit direction (`(2,0,0)`)
  to confirm normalization actually happens (not just a lucky pass with a pre-normalized input), plus
  the zero-length degenerate case, plus a partial-draw magnitude cross-check against
  `computeArrowSpeed` directly for a non-axis-aligned direction `(0,1,0)`.
- `canFireBow` is verified with a negative `arrowCount` (`-1`), not just `0`, confirming the gate
  isn't merely a falsy/truthy check that would incorrectly treat `-1` as ammo.
- `LandedArrowTracker.collectNearby`'s three requirement scenarios (collected, delay-blocked,
  radius-blocked) each independently confirm the arrow is still retrievable via `getArrow` when not
  collected, not just that the returned id list is empty.
- `clear()` is verified to both empty the tracker and reset id minting (a subsequent `addLandedArrow`
  returns id `0` again), confirming full state reset, not just map clearing.

## Migration/compatibility validation
- One new, additive file (`src/simulation/BowAndArrow.ts`); `git diff` confirms no edits to
  `ProjectileCore`, `ItemEntityManager`, `Inventory`, or any other module. No schema/save-format
  change; no migration.

## Performance/resource validation
- All pure formulas are O(1) (confirmed by inspection — no loops). `collectNearby` is O(n) over
  currently-tracked arrows, matching 112's `ItemEntityManager.collectPlayerDrops` cost model.

## Regressions
- Full unit suite green (1842/1842); no existing test file was touched, so no prior behavior could
  regress.
- Full e2e suite green (21/21) — nothing in `Game`/rendering/interaction consumes the new module.

## Incomplete tasks
None. All 5 tasks (1.1-5.1) complete with evidence.

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. All MUST/SHALL requirements have passing scenario evidence; the full baseline gate
(typecheck, lint, unit, build, e2e) is green; no regression, migration, or determinism risk is open.
Advance to 144.
