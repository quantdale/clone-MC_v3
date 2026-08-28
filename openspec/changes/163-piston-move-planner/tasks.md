# Tasks: 163-piston-move-planner

## Implementation
- [x] `src/simulation/PistonMovePlanner.ts`: `PistonWorld` interface (`isImmovable`/`isPushable`/
      `isDestroyedByPush`).
- [x] `classifyPistonBlock` (immovable takes precedence over an inconsistent pushable report).
- [x] `PISTON_PUSH_LIMIT = 12`; `PistonBlockedReason`; `PistonPushPlan`.
- [x] `planPistonPush` (bounded walk, farthest-first `blocksToMove` ordering, at-most-one-entry
      `blocksToDestroy`, immovable/exceeded-limit blocking).

## Tests
- [x] `tests/unit/PistonMovePlanner.test.ts`: `classifyPistonBlock` returns `movable`.
- [x] Returns `terminates-clear`.
- [x] Returns `terminates-destroy`.
- [x] Immovable takes precedence over an inconsistent `isPushable = true` report.
- [x] `planPistonPush` immediate clear termination moves nothing.
- [x] Several movable blocks then clear termination, correct farthest-first ordering.
- [x] Immediate destroy termination.
- [x] Several movable blocks then destroy termination.
- [x] Immovable at the first position blocks entirely.
- [x] Immovable after some movable blocks blocks entirely (nothing moves).
- [x] Exactly at `PISTON_PUSH_LIMIT` succeeds.
- [x] One more than the limit fails with `exceeded-limit`.
- [x] All six `Direction` values walk the geometrically correct line.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2205/2205 baseline) — 186 files / 2218 tests green.
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      164-piston-execution).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
