# Tasks: 283-live-raid-persistence

All tasks are unchecked until implementation begins. This authoring session completes only
T1's package half and the `OVERRIDE_DRAFT.md` snippet; live control-plane edits
(`CHANGE_SEQUENCE.md`, `CHANGE_SEQUENCE_OVERRIDES.md`, `PROGRAM_STATE.*`) happen at
activation on `origin/main` **after Change 282 is VERIFIED**. No `src/` or `tests/` file is
touched by this package.

## A. Control plane and specification

- [ ] T1. Author the complete 283 package (proposal, design, tasks, verification,
  `specs/live-raid-persistence/spec.md`) and `OVERRIDE_DRAFT.md` on branch
  `wt/283-live-raid-persistence` without editing the live overrides/state files; at
  activation after 282 VERIFIED, apply the draft ADDENDUM, add the `CHANGE_SEQUENCE.md`
  row, and set `PROGRAM_STATE` with 282 as last completed, 258 BLOCKED, 259–282 VERIFIED.
- [ ] T2. Pass the SPEC_AUTHORING_PROTOCOL quality gate: number/name matches the sequence,
  every MUST/SHALL has a scenario, invalid/duplicate/stale/reload/failure behavior is
  explicit, tasks cover impl/unit/E2E/edge/regression/docs/gate, verification mapping is
  declared, no vague placeholders, no later-change scope, and no production code changes
  before the package validates.

## B. Persistence codec and namespace

- [ ] T3. Add `src/simulation/RaidPersistence.ts`: `serializeRaidPayload`,
  `deserializeRaidPayload` (never throws; null on defect), `validatePersistedRaid` (throws
  pre-write on malformed/stale), `RAID_STORE_VERSION`; unit suite covers round-trip,
  every `deserializeRaid` rejection class, absent/non-object ⇒ null, wrong
  `schemaVersion` ⇒ rejected at both boundaries.
- [ ] T4. Add `WorldMetadataRepository.putRaidData`/`getRaidData` for
  `__raid__:<worldId>` (weather precedent); unit: put/get round-trip, absent ⇒ null,
  overwrite replaces the single record (duplicate-key rule).
- [ ] T5. Add `GamePersistence.initialRaidValue` bulk-load (corrupt ⇒ null),
  `saveRaid` guarded like `saveWeather`, and reset snapshot/restore/delete for the
  `__raid__` key; unit: hydrate valid, degrade corrupt, save idempotent, reset deletes and
  restores on failure, post-reset save is inert.

## C. Archive passthrough (fail-closed migration)

- [ ] T6. Add optional `WorldArchive.raidData` + validation via `validatePersistedRaid`
  when present; `WorldArchiver` export/import + `raidDataImported` report flag; unit:
  absent ⇒ null import, malformed ⇒ pre-write throw with no store write, valid ⇒ round-trip
  preserves the payload.

## D. Live Game wiring

- [ ] T7. Boot-hydrate `Game.raidState` from `initialRaidValue` through
  `deserializeRaidPayload` (late-load parity with sleep/weather); add `saveRaid()` at
  autosave, dispose, and pagehide with the existing persistence guards; null state clears
  the record; composition unit: hydrate active, save round-trip, guards, dispose hide still
  works, `getRaidState()` exposes restored state.
- [ ] T8. Confirm 282 feedback is unchanged: `#raid-feedback` still projects from
  `getRaidState()`, pause still freezes ticks, dispose still hides the bar; no new HUD, no
  entity spawning, no settlement detection.

## E. Browser E2E

- [ ] T9. Add `tests/e2e/raid-persistence.spec.ts`: start raid → `pagehide` reload → same
  wave/remaining/omen restored and bar visible; reset → reload → `getRaidState()` null and
  bar hidden; corrupt-record fixture → boot succeeds with null state (fail-closed runtime).
- [ ] T10. Archive leg: export with active raid → import restores; export without → import
  null; malformed `raidData` fixture refuses import (fail-closed migration).

## F. Regression and gate

- [ ] T11. Regression: 282 raid-feedback journeys stay green; 259–282 source untouched
  except the additive storage/Game seams; no 258 headed work, no GPU evidence, 258 remains
  BLOCKED.
- [ ] T12. Full gates: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e`, file-audit, `npm run validate-state`; record exact outputs in
  `verification.md`.
- [ ] T13. Reconcile artifacts, mark C283 exact/VERIFIED only at 100%, update
  `PARITY_MATRIX.md` C283 row, commit and publish to `origin/main` per
  `REVIEW_HANDOFF.md`, and report session_start_head → published_head with next action.
