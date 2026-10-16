# Verification: 139-passive-wander-ai

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 WanderGoal target is walkable and non-water | `tests/unit/PassiveWanderAI.test.ts` ("WanderGoal.canUse") | PASS |
| REQ-2 WanderGoal steers toward target, stops at arrival | `tests/unit/PassiveWanderAI.test.ts` ("WanderGoal.tick / arrival / stop") | PASS |
| REQ-3 WanderGoal times out after maxDurationTicks | `tests/unit/PassiveWanderAI.test.ts` ("WanderGoal — duration timeout") | PASS |
| REQ-4 LookGoal changes yaw only at its chance | `tests/unit/PassiveWanderAI.test.ts` ("LookGoal") | PASS |
| REQ-5 determinism given identical RNG/state | `tests/unit/PassiveWanderAI.test.ts` ("determinism") | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean (fixed an empty-interface lint error by using a type alias for `ResolvedWanderOptions` instead of an empty `extends` interface) |
| `npm test` | PASS | 1798/1798 (prior 1789 + 9 new `PassiveWanderAI.test.ts`) |
| `npm run build` | PASS | `tsc --noEmit && vite build`, 83 modules (unchanged — no consumer yet) |
| `npm run test:e2e` | PASS | 21/21 Playwright, headless Chromium |

## Edge/adversarial validation
- The all-water world test calls `canUse()` 20 times (with `startChance: 1` bypassing the random-start
  gate every time) and confirms every single call returns `false`, not just one — ruling out a
  lucky/unlucky single-attempt pass.
- The arrival test uses `radius: 0`, which collapses the wander target to the entity's own current
  column exactly, deterministically producing a zero-distance "already arrived" state without
  depending on any RNG-driven target position — a robust way to test arrival without needing access
  to the goal's private target field.
- The steering test explicitly asserts `vy` is unchanged (still `-3`, its pre-tick value) while
  confirming `vx`/`vz` gained nonzero magnitude, directly verifying the "never writes vy" invariant.
- The timeout test uses `arrivalRadius: 1e-9` to make an accidental arrival negligibly unlikely for
  the fixed seed used, isolating the timeout path from the arrival path.
- `LookGoal`'s two branch tests use `changeChance: 1` and `changeChance: 0` specifically because
  `nextFloat()` always returns a value in `[0, 1)` — `< 1` is unconditionally true and `< 0` is
  unconditionally false, deterministically forcing each branch without needing to predict the RNG's
  actual output value.
- The determinism test constructs two fully independent `EntityManager`/entity/goal instances (not
  the same objects reused) with identically-seeded `SeedRng`s and confirms both `canUse()` results
  and both final velocities are equal, confirming no incidental cross-instance state leaked into the
  outcome.

## Migration/compatibility validation
- One new, additive file (`src/simulation/PassiveWanderAI.ts`); `git diff` confirms no edits to
  `GoalSelector`, `EntityManager`, `NavigationGridQuery`, or `SeedRng`. No schema/save-format change;
  no migration.

## Performance/resource validation
- `WanderGoal.canUse()`'s target search is bounded at 10 attempts (`MAX_TARGET_ATTEMPTS`), confirmed
  by the all-water test terminating (returning `false`) rather than looping indefinitely.

## Regressions
- Full unit suite green (1798/1798); no existing test file was touched, so no prior behavior could
  regress.
- Full e2e suite green (21/21) — nothing in `Game`/rendering/interaction consumes the new module.

## Incomplete tasks
None. All 5 tasks (1.1-5.1) complete with evidence.

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. All MUST/SHALL requirements have passing scenario evidence; the full baseline gate
(typecheck, lint, unit, build, e2e) is green; no regression, migration, or determinism risk is open.
Advance to 140.
