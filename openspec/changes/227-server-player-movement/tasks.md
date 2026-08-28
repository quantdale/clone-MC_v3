# Tasks: 227-server-player-movement

## Group 1: Implementation and focused tests

- [x] Implement `src/simulation/MovementAuthority.ts` — `Position`, `MovementAuthorityOptions`,
      `MovementResult`, `RejectionInfo`, and `MovementAuthority` with option validation
      (`MovementAuthority: <detail>` throws), `spawn`, `submitIntent` (Euclidean speed bound +
      strict tick ordering, correction on violation), `teleport`, getters, and `reset()`.
- [x] Unit tests: construction — pristine state, valid default, every `maxSpeedPerTick`
      rejection class (0, negative, Infinity).
- [x] Unit tests: spawn — sets position/lastTick, resets counters, malformed coords/tick
      rejected without state change, re-spawn re-places.
- [x] Unit tests: acceptance — in-bounds newer-tick intent accepted (position/lastTick/
      acceptedCount/lastRejection updated), exact speed-boundary acceptance, 3D displacement.
- [x] Unit tests: corrections — stale tick (equal and older) corrected with reason and
      unchanged state, speed-limit corrected, pre-spawn intents stale.
- [x] Unit tests: malformed intents throw — non-finite coords, non-integer/negative tick,
      state untouched.
- [x] Unit tests: teleport/reset — teleport repositions and resets ordering, reset restores
      pristine state, identical schedules produce identical state at every step.

## Group 2: Integration and regression

- [x] `npm run typecheck` and `npm run lint` clean.
- [x] Full unit suite `npm test` green (expect 2950 + new count; full run at
      `--testTimeout=15000` to avoid the documented grid-sweep load flake).
- [x] `npm run build` and `npm run test:e2e` green (22/22).

## Group 3: State, docs, publication

- [x] Update `openspec/PROGRAM_STATE.json` (currentChange 227 VERIFIED, completedTasks,
      validationResults entry with the feature head) and `openspec/PROGRAM_STATE.md`
      (checkpoint block + "What 227 implemented" section; next 228-client-prediction-
      reconciliation).
- [x] Commit feature + state advance, push to `origin/main`, verify published head matches
      local HEAD, and report the session.
