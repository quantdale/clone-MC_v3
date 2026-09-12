# Tasks: 269-composed-game-dispose-worker-terminate

## A. Control plane

- [x] T1. Control-plane entries: 269 row in `CHANGE_SEQUENCE.md`, 269
  authorization in `CHANGE_SEQUENCE_OVERRIDES.md`, `PROGRAM_STATE.json`/`.md`
  activation (`currentChange=269-...` ACTIVE, `lastCompleted=268`,
  258 BLOCKED). Session start `9cab4d9`.
- [x] T2. Package quality gate (SPEC_AUTHORING_PROTOCOL): number/name matches
  sequence; previous change VERIFIED; one narrow outcome; proposal/design/spec
  structures complete; every MUST/SHALL has a scenario; tasks cover
  impl/unit/integration/edge/regression/docs/gate; verification mapping
  declared; no vague placeholders; no later-change scope.

## B. Audit (characterization before code)

- [x] T3. Record the dispose-gap audit: `MeshWorkerClient` has no dispose;
  `World.dispose` has no flag/guard; `Game.start` + ten UI listeners lack
  disposed guards; pool/worldgen/persistence dispose already proven;
  production composes no worldgen runtime (harness only); panels are
  element-scoped (equivalent shutdown). Evidence: file:line citations in
  design.md (done) — no code changed in this task.

## C. Implementation

- [x] T4. `MeshWorkerClient.dispose()` (`src/rendering/WorkerMeshing.ts`):
  idempotent; abandon-all (clear timeouts, cancel pool jobs, drop maps,
  fire no callbacks); post-dispose `requestSection` throws,
  `handleMessage` → null, `cancel` → false, `cancelByToken` → 0.
- [x] T5. `World.dispose()` hardening (`src/world/World.ts`): `disposed`
  flag + early return; dispose the mesh client before nulling; disposed
  guards on `ensureWorkerMeshing` (→ false) and `submitWorkerMeshJob`
  (no-op).
- [x] T6. `Game` hardening (`src/engine/Game.ts`): `start()` no-ops when
  disposed; ten UI click/change listener bodies no-op when disposed
  (recovery backup/reset, gamerule/recipebook/advancements/creative open,
  gamemode chip + select, hardcore toggle, difficulty select). No
  pre-dispose behavior change.
- [x] T7. Risk register: R-6 row → CLOSED by Change 269 with evidence
  pointer; no other row touched.

## D. Tests

- [x] T8. Unit: `tests/unit/MeshWorkerClientDispose.test.ts` (new) —
  double-dispose safe, zero callbacks fired at/after dispose, timeouts
  cleared (fake timers), pool job cancelled, submit throws, message →
  null, cancel → false / cancelByToken → 0.
- [x] T9. Unit/integration: `tests/unit/WorldDispose.test.ts` (new) —
  double dispose safe with meshing on (fake-worker `terminate` exactly
  once per slot, `workerCount: 0`, `pendingCount: 0`) and off; deferred
  fake-worker delivery after dispose attaches nothing and throws nothing.
- [x] T10. Focused e2e: `tests/e2e/game-dispose.spec.ts` (new) — green headless (1 passed) — boot via
  the shared `waitForGame` pattern, evaluate double `dispose()`, expect
  zero page/console errors; UI-open + `start()` inert after dispose.

## E. Gate

- [x] T11. `PARITY_MATRIX.md` C269 `exact` row + summary counts reconciled
  + post-terminal note (258 stays BLOCKED/rowless; 259–268 untouched).
- [x] T12. Full gate green (`validate-state`, `typecheck`, `lint`, unit
  `test`, `build`, `test:e2e` incl. the new dispose spec), mark 269
  VERIFIED with requirement evidence, publish `origin/main`, final report
  (SHAs, completion, validations, blockers, next action). Gates: unit 422 files
  5054+1; e2e 83/83 (30 game.spec + 1 dispose + 52 rest); build 2.74s.
