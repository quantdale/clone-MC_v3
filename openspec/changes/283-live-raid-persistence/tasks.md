# Tasks: 283-live-raid-persistence

All tasks are unchecked until implementation begins. This authoring session completes only
T1's package half and the `OVERRIDE_DRAFT.md` snippet; live control-plane edits
(`CHANGE_SEQUENCE.md`, `CHANGE_SEQUENCE_OVERRIDES.md`, `PROGRAM_STATE.*`) happen at
activation on `origin/main` **after Change 282 is VERIFIED**. No `src/` or `tests/` file is
touched by this package.

## A. Control plane and specification

- [x] T1. Author the complete 283 package (proposal, design, tasks, verification,
  `specs/live-raid-persistence/spec.md`) and `OVERRIDE_DRAFT.md` on branch
  `wt/283-live-raid-persistence` without editing the live overrides/state files; at
  activation after 282 VERIFIED, apply the draft ADDENDUM, add the `CHANGE_SEQUENCE.md`
  row, and set `PROGRAM_STATE` with 282 as last completed, 258 BLOCKED, 259–282 VERIFIED.
  **Done 2026-09-23:** package committed at `56c2313`; CHANGE_SEQUENCE row + OVERRIDE
  addendum applied; PROGRAM_STATE set to 283 ACTIVE 1/13 with sessionStartHead
  `a463e0fe8571576fc10a5bda49dead34b0eac61a`, lastCompletedChange 282, nextChange 284.
- [x] T2. Pass the SPEC_AUTHORING_PROTOCOL quality gate: number/name matches the sequence,
  every MUST/SHALL has a scenario, invalid/duplicate/stale/reload/failure behavior is
  explicit, tasks cover impl/unit/E2E/edge/regression/docs/gate, verification mapping is
  declared, no vague placeholders, no later-change scope, and no production code changes
  before the package validates.
  **Done 2026-09-23:** all 18 protocol checkboxes PASS — `283-live-raid-persistence` matches
  `CHANGE_SEQUENCE.md`; 6 requirements / 11 scenarios cover invalid, duplicate, stale,
  reload, and failure; tasks T3–T13 cover impl/unit/E2E/edge/regression/docs/gate;
  verification maps R-1..R-8; zero TODO/TBD placeholders in normative sections; no 284
  spawning scope; post-activation language reconciled in proposal/verification.

## B. Persistence codec and namespace

- [x] T3. Add `src/simulation/RaidPersistence.ts`: `serializeRaidPayload`,
  `deserializeRaidPayload` (never throws; null on defect), `validatePersistedRaid` (throws
  pre-write on malformed/stale), `RAID_STORE_VERSION`; unit suite covers round-trip,
  every `deserializeRaid` rejection class, absent/non-object ⇒ null, wrong
  `schemaVersion` ⇒ rejected at both boundaries.
  **Done 2026-09-23:** module + `tests/unit/RaidPersistence.test.ts` — 43/43 pass;
  typecheck/lint clean on the new files; RAID_STORE_VERSION mirrors RAID_RECORD_VERSION.
- [x] T4. Add `WorldMetadataRepository.putRaidData`/`getRaidData` for
  `__raid__:<worldId>` (weather precedent); unit: put/get round-trip, absent ⇒ null,
  overwrite replaces the single record (duplicate-key rule).
  **Done 2026-09-23:** repository methods + deleteRaw doc; suite 48/48 green including
  put/get, absent, overwrite single-key, deleteRaw, and per-world isolation.
- [x] T5. Add `GamePersistence.initialRaidValue` bulk-load (corrupt ⇒ null),
  `saveRaid` guarded like `saveWeather`, and reset snapshot/restore/delete for the
  `__raid__` key; unit: hydrate valid, degrade corrupt, save idempotent, reset deletes and
  restores on failure, post-reset save is inert.
  **Done 2026-09-23:** bulk-load + getter + guarded `saveRaid` (null deletes key) + reset
  snapshot/delete/restore; suite 60/60 green (valid hydrate, absent, 5 corrupt classes ⇒
  null+error, null-clear, overwrite idempotent, reset delete, post-reset inert, dispose guard).

## C. Archive passthrough (fail-closed migration)

- [x] T6. Add optional `WorldArchive.raidData` + validation via `validatePersistedRaid`
  when present; `WorldArchiver` export/import + `raidDataImported` report flag; unit:
  absent ⇒ null import, malformed ⇒ pre-write throw with no store write, valid ⇒ round-trip
  preserves the payload.
  **Done 2026-09-23:** optional field + fail-closed `validateWorldArchive` (non-object and
  `deserializeRaid`/`schemaVersion` classes), archiver export/import + `raidDataImported`;
  suite 66/66 (absent ⇒ null, malformed ⇒ throw + zero writes, valid round-trip).

## D. Live Game wiring

- [x] T7. Boot-hydrate `Game.raidState` from `initialRaidValue` through
  `deserializeRaidPayload` (late-load parity with sleep/weather); add `saveRaid()` at
  autosave, dispose, and pagehide with the existing persistence guards; null state clears
  the record; composition unit: hydrate active, save round-trip, guards, dispose hide still
  works, `getRaidState()` exposes restored state.
  **Done 2026-09-23:** Game hydrate + late-load, `saveRaid()` at autosave/dispose/pagehide
  (dispose saves BEFORE clear so reload restores), null clears; `LiveRaidPersistence.test.ts`
  7/7 (hydrate equal, absent null, round-trip, null-clear, dispose order, double-save guard,
  corrupt degrade) + RaidPersistence 66 still green = 73/73.
- [x] T8. Confirm 282 feedback is unchanged: `#raid-feedback` still projects from
  `getRaidState()`, pause still freezes ticks, dispose still hides the bar; no new HUD, no
  entity spawning, no settlement detection.
  **Done 2026-09-23:** RaidFeedbackView + RaidStateMachine untouched vs origin/main; Game
  keeps one fixed-tick `tickRaidFeedback` (pause freezes via driver), dispose saves-then-
  clears+syncs bar; no spawning/settlement/258 code; raid suites 119/119 (LiveRaidFeedback,
  RaidFeedbackView, RaidStateMachine, LiveRaidPersistence, RaidPersistence).

## E. Browser E2E

- [x] T9. Add `tests/e2e/raid-persistence.spec.ts`: start raid → `pagehide` reload → same
  wave/remaining/omen restored and bar visible; reset → reload → `getRaidState()` null and
  bar hidden; corrupt-record fixture → boot succeeds with null state (fail-closed runtime).
  **Done 2026-09-23:** 4 tests green against the production bundle — reload restores equal
  state + visible ACTIVE bar; reset deletes `__raid__` (null + hidden NONE); corrupt
  `{schemaVersion:99}` degrades to null with `#loading`/`#error` hidden; 282 feedback
  reload test rewritten to expect 283 restore. Focused E2E raid-persistence +
  raid-feedback = 8/8 passed (1.2m). typecheck/lint 0 errors.
- [x] T10. Archive leg: export with active raid → import restores; export without → import
  null; malformed `raidData` fixture refuses import (fail-closed migration).
  **Done 2026-09-23:** 4th test in `raid-persistence.spec.ts` covers the full archive
  leg — export without raid (`raidData` null) / with raid (`schemaVersion===1`),
  `importWorldBackup` round-trip (`raidDataImported: true` + reload restores), empty
  import (`raidDataImported: false`), malformed `status:'NOPE'` refused with zero partial
  writes, final reload boots clean. `GamePersistence.importWorldBackup` added (symmetric
  to `exportWorldBackup`, JSON.parse → `WorldArchiver.importWorld` → ok/error).

## F. Regression and gate

- [x] T11. Regression: 282 raid-feedback journeys stay green; 259–282 source untouched
  except the additive storage/Game seams; no 258 headed work, no GPU evidence, 258 remains
  BLOCKED.
  **Done 2026-09-23:** `git diff origin/main --name-only` outside openspec = only
  `.gitignore`, `src/simulation/RaidPersistence.ts` (new), `src/storage/{GamePersistence,
  WorldArchive,WorldArchiver,WorldMetadataRepository}.ts`, `src/engine/Game.ts`, tests —
  `NO_OUT_OF_SCOPE_FILES` (rendering/ui/input/networking/world/entities untouched); no
  spawning/settlement/258 code in the diff; 282+283 unit regression 149/149 (7 files:
  LiveRaidFeedback, RaidFeedbackView, RaidStateMachine, LiveRaidPersistence,
  RaidPersistence, WorldArchiver, GamePersistence); focused raid E2E (incl. all four
  raid-feedback journeys) 8/8; PROGRAM_STATE still records 258 BLOCKED / 259–282 VERIFIED;
  no GPU/headed evidence claimed.
- [x] T12. Full gates: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e`, file-audit, `npm run validate-state`; record exact outputs in
  `verification.md`.
  **Done 2026-09-23:** typecheck exit 0; lint 0 errors / 85 pre-existing `no-explicit-any`
  warnings; unit 449 files 5351 passed + 1 skipped (5352); build 3.87s (249 modules);
  file-audit 2892 rows PASS (sha `75d564f6…`); validate-state PASS. Full E2E 110 passed /
  2 failed — both classified non-blocking: enchanting:227 flake (isolated re-run 2/2 PASS),
  visual-regression:176 baseline-equivalent drift (30 fail / 30 pass matching two independent
  30/30 baselines; one-cell swap, 25/30 fractions byte-identical; all raid E2E green).
  Evidence recorded in `verification.md` Commands + E2E failure classification sections.
- [x] T13. Reconcile artifacts, mark C283 exact/VERIFIED only at 100%, update
  `PARITY_MATRIX.md` C283 row, commit and publish to `origin/main` per
  `REVIEW_HANDOFF.md`, and report session_start_head → published_head with next action.
  **Done 2026-09-23:** `PARITY_MATRIX.md` C283 exact/VERIFIED row + Scope/heading/Summary/
  coverage reconciled to 001–283 (exact 269, total 285, split = 283); post-terminal 283
  note; `verification.md` VERIFIED 13/13 with advancement allowed; PROGRAM_STATE 13/13 100%
  VERIFIED (`mandatoryRequirementsPass`/`requiredTestsPass`/`advancementAllowed: true`,
  `lastCompletedChange` 283); validate-state + file-audit PASS; committed and published to
  `origin/main` (published_head recorded in PROGRAM_STATE); session_start_head
  `a463e0fe8571576fc10a5bda49dead34b0eac61a`; next action checkpointed toward 284 without
  implementing it; 258 stays BLOCKED.
