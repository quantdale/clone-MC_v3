# Verification: 142-projectile-core

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 gravity/drag order on a clear tick | `tests/unit/ProjectileCore.test.ts` ("stepProjectile — gravity/drag ordering") | PASS |
| REQ-2 block collision embeds and reports the resting cell | `tests/unit/ProjectileCore.test.ts` ("stepProjectile — block collision") | PASS |
| REQ-3 entity collision takes priority, reports the id | `tests/unit/ProjectileCore.test.ts` ("stepProjectile — entity collision priority") | PASS |
| REQ-4 owner immunity then hittable | `tests/unit/ProjectileCore.test.ts` ("stepProjectile — owner immunity") | PASS |
| REQ-5 expiration freezes physics | `tests/unit/ProjectileCore.test.ts` ("stepProjectile — expiration") | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1827/1827 (prior 1821 + 6 new `ProjectileCore.test.ts`) |
| `npm run build` | PASS | `tsc --noEmit && vite build`, 83 modules (unchanged — no consumer yet) |
| `npm run test:e2e` | PASS | 21/21 Playwright, headless Chromium |

## Edge/adversarial validation
- A spec-wording refinement was made mid-implementation: `hitBlock` reports the *resting* cell
  (`floor` of the resolved embedded position) rather than assuming it always identifies the specific
  solid neighbor cell, since `CollisionResolver.move` clamps to a face boundary without returning
  which cell was solid. This was corrected in `design.md`/`spec.md` before finalizing, per AGENTS.md's
  "amend the spec first" rule, and the test asserts the exact documented relationship
  (`hitBlock === floor(result.state.{x,y,z})`) rather than a hardcoded cell guess.
  Independently, a sanity assertion confirms the resting `y` is at or above the floor's actual top
  face, so the test still verifies genuine, correct collision (not just internal self-consistency).
- The entity-vs-block priority test deliberately sets up a world where the floor *would* collide
  the same tick, and places the target exactly at the tick's raw (unclamped) destination point,
  confirming the entity check runs against the pre-clamp destination and wins the priority contest
  as documented (not merely "an entity was placed somewhere near the projectile").
- Owner-immunity is verified at both sides of the boundary: `ageTicks: 0` (post-increment 1, within
  the default 5-tick window) is not hit, and `ageTicks: 5` (post-increment 6, past the window) is
  hit — using the exact same target position in both cases, isolating the immunity-window logic from
  any positional difference.
- The expiration test uses `toEqual({ ...state, ageTicks: 1201 })` — a full structural comparison
  against the original input state with only `ageTicks` changed — rather than checking individual
  fields, ruling out any accidental partial mutation.

## Migration/compatibility validation
- One new, additive file (`src/simulation/ProjectileCore.ts`); `git diff` confirms no edits to
  `CollisionResolver`, `VoxelShape`, or any other module. No schema/save-format change; no migration.

## Performance/resource validation
- One `CollisionResolver.move` call per tick (skipped entirely when an entity hit already fired,
  confirmed by the priority test implicitly since the block-colliding floor never causes a thrown
  error or altered result when bypassed); O(m) distance checks over the supplied `targets` array
  (`m` bounded by whatever the caller passes, per the documented convention).

## Regressions
- Full unit suite green (1827/1827); no existing test file was touched, so no prior behavior could
  regress.
- Full e2e suite green (21/21) — nothing in `Game`/rendering/interaction consumes the new module.

## Incomplete tasks
None. All 5 tasks (1.1-5.1) complete with evidence.

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. All MUST/SHALL requirements have passing scenario evidence; the full baseline gate
(typecheck, lint, unit, build, e2e) is green; no regression, migration, or determinism risk is open.
Advance to 143.
