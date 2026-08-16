# Tasks: 228-client-prediction-reconciliation

## Group 1: Implementation and focused tests

- [x] Implement `src/simulation/MovementReconciler.ts` — `Position`, `PendingIntent`,
      `MovementReconcilerOptions`, and `MovementReconciler` with option validation
      (`MovementReconciler: <detail>` throws), `predict`, `reconcile` (stale no-op, snapping and
      replaying surviving intents), getters (`predicted`, `confirmedTick`, `pendingCount`, `pending`),
      and `reset()`.
- [x] Unit tests: construction — pristine state, default options, invalid `maxPending` rejection
      classes (0, negative, non-integer, non-finite).
- [x] Unit tests: prediction — single and sequential predictions advancing `predicted` and `pending`,
      buffer-full rejection at `maxPending` with no state mutation.
- [x] Unit tests: reconciliation — confirmation matching prediction, correction snapping and
      replaying newer intents in order, correction with no surviving intents, stale corrections
      (equal and older ticks) as silent no-ops.
- [x] Unit tests: malformed input validation — non-finite coordinates in predict/reconcile,
      non-integer/negative ticks in predict/reconcile, prediction tick `<= confirmedTick` rejected,
      all throwing without state change.
- [x] Unit tests: reset and determinism — reset restoring pristine state, identical predict/reconcile
      schedules producing identical snapshots across instances.

## Group 2: Integration and regression

- [x] `npm run typecheck` and `npm run lint` clean.
- [x] Full unit suite `npm test` green (expect 2966 + new tests; run at `--testTimeout=15000` to avoid
      documented grid-sweep load flake).
- [x] `npm run build` and `npm run test:e2e` green (22/22).

## Group 3: State, docs, publication

- [x] Update `openspec/PROGRAM_STATE.json` (currentChange 228 VERIFIED, completedTasks,
      validationResults entry with the feature head) and `openspec/PROGRAM_STATE.md`
      (checkpoint block + "What 228 implemented" section; next 229-entity-replication).
- [x] Commit feature + state advance, push to `origin/main`, verify published head matches local HEAD,
      and report the session.
