# Tasks: 274-live-sleep-bed-integration

## A. Control plane

- [x] T1. Control-plane entries: 274 row in `CHANGE_SEQUENCE.md`, 274
  authorization in `CHANGE_SEQUENCE_OVERRIDES.md` (274–277 campaign; 258
  BLOCKED), `PROGRAM_STATE.json`/`.md` activation (`currentChange=274-...`
  ACTIVE, `lastCompleted=273`, 258 BLOCKED). Session start `f903fd2`.
- [x] T2. Package quality gate (SPEC_AUTHORING_PROTOCOL): number/name matches
  sequence; previous change VERIFIED; one narrow outcome; proposal/design/spec
  structures complete; every MUST/SHALL has a scenario; tasks cover
  impl/unit/E2E/edge/regression/docs/gate; verification mapping declared; no
  vague placeholders; no later-change scope.

## B. Content + persistence

- [x] T3. `__sleep__` record: `WorldMetadataRepository` putSleepData /
  getSleepData, `GamePersistence` initialSleepValue + saveSleep +
  degrade-to-default load (wake-on-boot) + reset snapshot/restore/delete,
  unit suite (`SleepPersistence.test.ts`): round-trips, corrupt-payload
  degrade (wrong version / non-boolean / bad spawn / unknown key /
  non-object), post-reset inert saves, absent ⇒ defaults.
- [x] T4. Archive passthrough: `WorldArchive` optional `sleepData` +
  validation, `WorldArchiver` export/import (+ report flag), unit cases
  (absent ⇒ defaults, malformed ⇒ pre-write throw, round-trip preserves).
- [x] T5. Bed block + bed item: `BlockRegistry` bed block (next free id,
  placeable/breakable/passable low block, procedural tile) + `ItemRegistry`
  bed item (next free id, links to the bed block); unit pins on ids, flags,
  and place→block mapping.

## C. Live store + rules

- [x] T6. `Game` sleep store: field + boot hydration (wake-on-boot),
  `getSleepState`, `useBedAt` (canSleep gate → enterBed/leaveBed routing →
  saveSleep → UI/toast), single-player night skip (`canSkipNight(1,1)` ⇒
  `skipNight`), bed-use hook in the existing use dispatch (266 gates apply);
  composition unit suite (`SleepIntegration.test.ts`): gate × (night/day),
  enter/leave/occupied/same-bed identity/bed-switch matrix, skip math,
  serialize round-trips, wake-on-boot.
- [x] T7. Bed-aware respawn: `respawnPlayer()` target = `spawnPoint(sleep)
  ?? worldSpawn` through the existing spawn-safety path; 267 mode routing
  unchanged; unit cases (bed target, world-spawn target, hardcore death ⇒
  spectator + bed target).

## D. UI

- [x] T8. Toasts (enter / leave / refusal) + HUD `#sleep-indicator`
  (DOM/CSS/text, original assets only) synced with the store; `debugSetTimeOfDay`
  E2E seam (245 precedent).

## E. Browser E2E

- [x] T9. E2E sleep arc (new spec file): daytime use refused → force night
  (seam) → place bed → use → sleeping + spawn set + clock 0 + toast/HUD →
  leave keeps spawn → reload persists spawn (awake) → kill → respawn at bed.
- [x] T10. E2E contrast + shared arc: no bed ⇒ respawn at world spawn;
  hardcore death ⇒ spectator (267) + bed-aware target; reload-while-sleeping
  ⇒ booted awake with spawn kept; HUD/toast real-DOM legs.

## F. Gate

- [x] T11. Regression: 259–273 E2E unmodified + green; full unit suite
  green; no 259–273 source touched.
- [x] T12. Full gates: `typecheck`, `lint`, `test`, `build`, `test:e2e`
  green; file-audit clean; `validate-state` PASS.
- [x] T13. Reconciliation + `PARITY_MATRIX.md` C274 `exact` row + publish
  `origin/main` + final report (SHAs, completion, validations, blockers,
  next action).
