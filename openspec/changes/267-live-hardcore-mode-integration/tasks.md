# Tasks: 267-live-hardcore-mode-integration

## A. Control plane

- [x] T1. Control-plane entries: 267 row in `CHANGE_SEQUENCE.md`, 267
  authorization in `CHANGE_SEQUENCE_OVERRIDES.md`, `PROGRAM_STATE.json`/`.md`
  activation (`currentChange=267-...` ACTIVE, `lastCompleted=266`,
  258 BLOCKED). Session start `36c63f9`.
- [x] T2. Package quality gate (SPEC_AUTHORING_PROTOCOL): number/name matches
  sequence; previous change VERIFIED; one narrow outcome; proposal/design/spec
  structures complete; every MUST/SHALL has a scenario; tasks cover
  impl/unit/E2E/edge/regression/docs/gate; verification mapping declared; no
  vague placeholders; no later-change scope.

## B. Persistence

- [x] T3. `__hardcore__` + `__difficulty__` records: `WorldMetadataRepository`
  put/get pairs, `GamePersistence` initial values + saves + degrade-to-default
  load + reset snapshot/restore/delete, unit suite
  (`HardcorePersistence.test.ts`): round-trips, corrupt-payload degrade
  (wrong version / non-boolean / unknown key / unknown level), post-reset
  inert saves, absent ⇒ defaults.
- [x] T4. Archive passthrough: `WorldArchive` optional `hardcoreData` /
  `difficultyData` + validation, `WorldArchiver` export/import (+ report
  flags), unit cases (absent ⇒ null, malformed ⇒ pre-write throw, round-trip
  preserves).

## C. Live store + rules

- [x] T5. `Game` hardcore/difficulty store: fields + boot hydration,
  `isHardcore` / `setHardcore` (identity no-op, persist + toast + UI sync),
  `getDifficulty` (effective) / `getConfiguredDifficulty` /
  `setDifficulty` / `setDifficultyFromText` (hardcore lock ⇒ false no-op),
  `saveHardcore` / `saveDifficulty` guards; composition unit suite
  (`HardcoreModeIntegration.test.ts`): lock × 4 levels, death × 4 modes,
  identity rules, parse edges, serialize round-trips.
- [x] T6. Death routing + difficulty consumer: `onSurvivalEvent('death')`
  applies `respawnModeAfterDeath` via `setGameMode` before the unchanged
  `respawnPlayer()` reset (hardcore vs normal toast copy); `tickWithers`
  passes `getDifficulty()` to `scaledWitherDuration`; unit cases (hardcore
  death ⇒ spectator decision, normal death ⇒ passthrough, wither arg is the
  effective level). No 265/266 semantic change.

## D. UI

- [x] T7. World-settings section in `#gamerule` (`#hardcore-toggle` +
  `#difficulty-select` + CSS + Game sync incl. disabled-while-locked and
  status/refusal copy).
- [x] T8. HUD `#hardcore-badge` (hidden unless hardcore) synced with the
  store; `debugKillPlayer` E2E seam.

## E. Browser E2E

- [x] T9. E2E hardcore arc (new spec file): defaults off/normal/survival →
  set easy → enable hardcore → effective hard + difficulty edit refused →
  kill → spectator + hardcore toast + effective hard → reload persists
  hardcore + spectator + hard.
- [x] T10. E2E normal contrast + shared arc: kill without hardcore → still
  survival + normal respawn toast + reload persists non-hardcore; settings
  section through real DOM (toggle on/off, select change + disabled state).

## F. Gate

- [x] T11. Regression: 259–266 E2E unmodified + green; full unit suite green;
  no 259–266 source touched.
- [x] T12. Full gates: `typecheck`, `lint`, `test`, `build`, `test:e2e` green;
  file-audit clean; `validate-state` PASS.
- [x] T13. Reconciliation + `PARITY_MATRIX.md` C267 `exact` row + publish
  `origin/main` + final report (SHAs, completion, validations, blockers, next
  action).
