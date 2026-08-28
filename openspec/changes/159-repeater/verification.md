# Verification: 159-repeater

## Status
VERIFIED — 100%

## Task completion
6 / 6 implementation tasks, 14 / 14 test tasks, 6 / 6 verification tasks complete (26/26, 100%).

## Gate evidence
- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`, full project)
- unit (isolated): PASS 15/15 (`tests/unit/RedstoneRepeater.test.ts`)
- unit (full suite): PASS 182 files / 2157 tests (prior 2142 + 15 new)
- build: PASS (registry edits in the live graph; simulation module has no `Game.ts` consumer yet)
- e2e: PASS 22/22 (all pre-existing assertions unaffected)

## Requirement coverage
| Requirement | Test | Result |
|---|---|---|
| REQ-1 registration + 64 states | schema/default, placing item + cross-reference, exact-64-state case | PASS |
| REQ-2 delay tick mapping | all-four-delays case | PASS |
| REQ-3 delay cycling | wraparound case | PASS |
| REQ-4 lock predicate | locks-true / does-not-lock-false cases | PASS |
| REQ-5 output resolution | locked-holds / unlocked-follows cases | PASS |
| REQ-6 signal strength | powered/unpowered case | PASS |
| REQ-7 scheduling + ordering | not-due / fires-at-tick (all four delays) / same-tick determinism / non-finite-tick cases | PASS |
| REQ-8 state projection | full-state projection legal for the schema | PASS |

## Edge/adversarial validation
- **Locked-holds is asserted against a *changed* input in both directions**: `currentPowered: true`
  with `currentInput: false` still returns `true`, and the reverse — proving the locked branch
  truly ignores `currentInput` rather than merely happening to agree with it in one direction.
- **All four delay settings are exercised individually** for both "not due one tick early" and
  "fires exactly at its own tick cost" — not just the default delay — confirming
  `REPEATER_DELAY_TICKS` is wired correctly end to end through `scheduleRepeaterOutput`.
- **Same-tick determinism is asserted twice** (fixed order + repeatability), continuing 156-158's
  pattern for anything touching 047's queue.
- **State-projection legality is checked against the real schema** (`REPEATER_SCHEMA.legalValues`)
  rather than hand-verified, so the projection cannot silently drift from what 007 actually accepts.

## Migration/compatibility validation
- One additive block id (42) and one additive item id (42); none renumbered, confirmed by the
  exhaustive legacy-id table. One new simulation file. 047's `ScheduledTickQueue` is composed, not
  modified. No `Game.ts` edit; no schema/save-format change.
- Four characterization tests updated (155/157/158's precedent): block count 30 → 31; the
  stateful-block set gains `redstone_repeater`; the state-count formula extended by 64 plus a
  per-block exact-64-state assertion with all four state fields checked (registry 1358 → 1422
  states); one new legacy-id row. All passing, updated, not broken.

## Performance/resource validation
- Every function is O(1); `dueRepeaterOutputs` is 047's own bounded pop. 64 new block states — the
  largest single-block state count after redstone wire's 1296, still ~2% of the per-block cap.

## Regressions
None beyond the four documented characterization updates. Full 2157-test unit suite green; all 22
pre-existing e2e assertions pass unchanged.

## Incomplete tasks
None — 26/26 (100%).

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. Advance. 100% task completion, full gate green (typecheck, lint, 2157-unit suite,
production build, 22/22 e2e), no MUST/SHALL requirement unmet, no regression. `facing` is modeled
here (unlike 155/157/158's identical omission) because a repeater's facing is behavioral — it
determines which side is input/output versus lock input — not purely visual. Input-change tracking
is deliberately left to a future wiring change, since it already owns the real world and would
otherwise become a second source of truth for the same fact. Not yet emitting into a live circuit —
the same integration surface 156-158 deferred. Next change: 160-comparator.
