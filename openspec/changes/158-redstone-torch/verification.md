# Verification: 158-redstone-torch

## Status
VERIFIED — 100%

## Task completion
6 / 6 implementation tasks, 17 / 17 test tasks, 6 / 6 verification tasks complete (29/29, 100%).

## Gate evidence
- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`, full project)
- unit (isolated): PASS 22/22 (`tests/unit/RedstoneTorch.test.ts`)
- unit (full suite): PASS 181 files / 2142 tests (prior 2120 + 22 new)
- build: PASS (registry edits in the live graph; simulation module has no `Game.ts` consumer yet)
- e2e: PASS 22/22 (all pre-existing assertions unaffected)

## Requirement coverage
| Requirement | Test | Result |
|---|---|---|
| REQ-1 registration + 2 states | schema/default, placing item + cross-reference, exact-2-state cases | PASS |
| REQ-2 inversion | unpowered-lights / powered-extinguishes / pure-inversion cases | PASS |
| REQ-3 signal strength | lit/unlit emission case | PASS |
| REQ-4 delay + ordering | not-due, fires-at-tick, same-tick determinism (repeatable), non-finite-tick cases | PASS |
| REQ-5 burnout threshold | past-limit / at-limit / spread-beyond-window cases | PASS |
| REQ-6 recovery | still-burnt-out-during-recovery / recovered-after-quiet / extended-by-continued-toggling cases | PASS |
| REQ-7 per-torch isolation | second-torch-unaffected / untracked-torch-reads-false cases | PASS |
| REQ-8 state projection | lit-flag projection legal for the schema | PASS |

## Edge/adversarial validation
- **Burnout is asserted at both sides of its boundary**: exactly `BURNOUT_TOGGLE_LIMIT` toggles does
  *not* burn out, and `BURNOUT_TOGGLE_LIMIT + 1` does — pinning the "strictly greater than"
  semantics documented in design.md, not just "roughly works".
- **Window pruning is asserted directly**, not just inferred from behavior: after 50 toggles spaced
  beyond the window, `toggleCount` reports exactly 1 retained — proving per-torch memory does not
  grow unbounded over a long session.
- **Recovery timing is asserted on both sides**: still burnt out one tick before
  `BURNOUT_RECOVERY_TICKS` elapses, recovered exactly at that boundary.
- **Extension-during-recovery is asserted as its own case**: a further toggle partway through the
  recovery window pushes the recovery point out, confirming a torch still being driven by a live
  loop cannot recover mid-loop (the specific behavior design.md's Rejected alternatives called out
  as the reason recovery is measured from the *last* toggle, not burnout onset).
- **Same-tick scheduling determinism is asserted twice** (fixed order + repeatability), continuing
  156/157's pattern for anything touching 047's queue.
- All tests use the exported constants (`BURNOUT_TOGGLE_LIMIT + 1`, etc.) rather than hard-coded
  numbers, so retuning the heuristic cannot silently invalidate them (per the proposal's Risks).

## Migration/compatibility validation
- One additive block id (41) and one additive item id (41); none renumbered, confirmed by the
  exhaustive legacy-id table. One new simulation file. 047's `ScheduledTickQueue` is composed, not
  modified. No `Game.ts` edit; no schema/save-format change.
- Four characterization tests updated (155/157's precedent): block count 29 → 30; the stateful-block
  set gains `redstone_torch`; the state-count formula +2 plus a per-block exact-2-state assertion
  (registry 1356 → 1358 states); one new legacy-id row. All passing, updated, not broken.

## Performance/resource validation
- Every function is O(1) amortised; per-torch memory bounded by `BURNOUT_TOGGLE_LIMIT` retained
  ticks regardless of session length (proven by the 50-toggle pruning test). 2 new block states.

## Regressions
None beyond the four documented characterization updates. Full 2142-test unit suite green; all 22
pre-existing e2e assertions pass unchanged.

## Incomplete tasks
None — 29/29 (100%).

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. Advance. 100% task completion, full gate green (typecheck, lint, 2142-unit suite,
production build, 22/22 e2e), no MUST/SHALL requirement unmet, no regression. Burnout is
deliberately kept outside `torchShouldBeLit` — the inversion is a one-line rule that stays
trivially correct in isolation, while burnout is a stateful heuristic the caller applies on top,
so a future bug can never be ambiguous about which rule caused an unlit torch. Not yet emitting
into a live circuit — needs an interaction/collision hook plus a `RedstonePowerSource` adapter over
the real `World`, the same integration surface 156/157 deferred. Next change: 159-repeater.
