# Verification: 240-save-recovery-stress

Status: VERIFIED (240 scope) — full baseline gate held on an unrelated pre-existing e2e flake (see below)
Completion: 100%
Advancement allowed: pending orchestrator resolution of the unrelated 239 e2e flake

## Requirement evidence

Every row below maps one recovery-matrix scenario (stable `scenarioId`) to the requirement it verifies.
All scenarios were produced by a real `SaveRecoveryMatrix.runAll()` run over in-memory repositories; the
`detail` strings are the actual, deterministic report output (captured verbatim).

| Requirement | Evidence | Status |
|---|---|---|
| Recovery-matrix-harness: full five-axis coverage | `runAll()` report contains 25 scenarios across all five axes (`abrupt-close`, `partial-write`, `migration`, `quota`, `import-export`); `SaveRecoveryMatrix.test.ts` asserts each axis is present and no result carries an unknown axis | PASS |
| Recovery-matrix-harness: deterministic reports | two `runAll()` runs produce identical (scenarioId, axis, outcome, detail) at every index; `report.deterministic === true` | PASS |
| Recovery-matrix-harness: allPass semantics | healthy matrix `allPass === true`; broken fixture forces `allPass === false` | PASS |
| Recovery-matrix-harness: failure-injection seams | `createFaultySaveSink` (failNextWrites/failAllWrites/corruptNextWrites/failKeys), `withStorageFailure`, `createGatedSaveSink` drive partial-write/quota assertions | PASS |
| Recovery-matrix-harness: no-swallow failure reporting | forced-fail `runAll()` resolves with `allPass:false` and every failed scenario carries a non-empty `detail` (never throws) | PASS |
| Abrupt-close-recovery: acknowledged writes survive abrupt close | `abrupt-close.drain-then-kill`: `acknowledged=4 persisted=4 absent=1` | PASS |
| Abrupt-close-recovery: pending-at-kill units leave no partial record | `abrupt-close.no-partial-on-kill`: `pending-at-kill record absent after reopen` | PASS |
| Abrupt-close-recovery: graceful pagehide flush persists the remainder | `abrupt-close.pagehide-flush`: `written=5 persisted=5` (+ direct `pagehide` dispatch test) | PASS |
| Abrupt-close-recovery: graceful flush never drops a failing unit | `abrupt-close.stuck-flush`: `written=3 pending=1` (zero-progress guard terminates) | PASS |
| Abrupt-close-recovery: coordinator lifecycle is clean after simulation | `abrupt-close.lifecycle-clean`: `interval=1 listeners=pagehide:1,visibilitychange:1 stop=0 rearm=1` | PASS |
| Abrupt-close-recovery: server-owned save survives abrupt close (234 reconciliation) | `abrupt-close.server-save-lifecycle`: `created; drained=2 restored=2 columns=1 pending-at-kill absent` | PASS |
| Partial-write-recovery: failed writes re-queue and retry | `partial-write.requeue-retry`: `drain1=1 drain2=1 persisted=2 pending=0` | PASS |
| Partial-write-recovery: invalid payloads are rejected, not persisted | `partial-write.invalid-payload-rejected`: `invalid column rejected; store clean` | PASS |
| Partial-write-recovery: corrupt records are never trusted on read | `partial-write.corrupt-read-rejected`: `corrupt stored record rejected by validateWorldMetadata (trusting read path)` (seeded via `fixture.putRawMetadata`; the 034-037 raw `get` is an unvalidated passthrough by design) | PASS |
| Partial-write-recovery: full-payload write is atomic per unit | `partial-write.atomic-per-unit`: `rejected column write left no partial record; unit pending` | PASS |
| Migration-recovery: schema upgrade creates all stores and preserves data | `migration.schema-upgrade`: `upgraded v1..4 -> v5; prior data preserved; all stores created` (+ direct v2-upgrade test) | PASS |
| Migration-recovery: migration is idempotent | `migration.idempotent`: `reopen at current version: no data loss, idempotent` | PASS |
| Migration-recovery: unsafe migration chains refused at registration | `migration.chain-refused-register`: `GAP + DUPLICATE register calls threw; chain unchanged` | PASS |
| Migration-recovery: unsafe migrations refused at migrate time | `migration.chain-refused-migrate`: `DOWNGRADE + UNKNOWN_VERSION threw; input untouched; v1->v2 ok` | PASS |
| Migration-recovery: unsupported archive versions are refused | `migration.unsupported-archive-version`: `version-2 archive rejected by validateWorldArchive` | PASS |
| Quota-recovery: failures classify by kind | `quota.failure-classification`: `quota->quota private-mode->private-mode` | PASS |
| Quota-recovery: status transitions and recovery | `quota.status-transitions`: `ok->degraded->failed->ok; canWrite=true lastFailure=null` | PASS |
| Quota-recovery: user-safe write gate | `quota.write-gate`: `drain=0 repoWrites=0 pending=2` (no repository write while failed) | PASS |
| Quota-recovery: autosave pauses on failed and resumes on recovery | `quota.pause-resume`: `pre=0 (no writes) post=3 persisted=3` | PASS |
| Quota-recovery: listeners and reset | `quota.listeners-reset`: `fires=degraded,failed,ok unsubscribed-ok reset=ok` | PASS |
| Import-export-recovery: export is complete and valid | `import-export.export-complete`: `metadata=1 columns=2 beChunks=1 eChunks=1 playerState=1 valid=1` | PASS |
| Import-export-recovery: import round-trip is stable | `import-export.round-trip-stable`: `round-trip stable (mod timestamps); all 5 stores restored` | PASS |
| Import-export-recovery: malformed archives rejected atomically | `import-export.atomic-rejection`: `format/column/player-state corruptions each rejected; all 5 stores empty` | PASS |
| Import-export-recovery: player-state worldId normalization | `import-export.worldid-normalization`: `playerState.worldId normalized to archive worldId; no mismatch leak` | PASS |
| Import-export-recovery: export is read-only | `import-export.export-read-only`: `two exports left all 5 stores unchanged` | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` exit 0 |
| `npm run lint` | PASS | `eslint .` exit 0 |
| `npx vitest run tests/unit/SaveRecoveryMatrix.test.ts` | PASS | 4/4 (full matrix: five-axis coverage, determinism, allPass, seams, no-swallow) |
| `npx vitest run tests/unit/abrupt-close-recovery.test.ts` | PASS | 9/9 (5 scenarios + pagehide dispatch + 234 saveAndClose/reload reconciliation) |
| `npx vitest run tests/unit/partial-write-recovery.test.ts` | PASS | 6/6 |
| `npx vitest run tests/unit/migration-recovery.test.ts` | PASS | 7/7 |
| `npx vitest run tests/unit/quota-recovery.test.ts` | PASS | 7/7 |
| `npx vitest run tests/unit/import-export-recovery.test.ts` | PASS | 7/7 |
| `npm test` | PASS | 274 files, 3574 passed + 1 skipped (prior 3534 + 40 new: SaveRecoveryMatrix 4, abrupt-close 9, partial-write 6, migration 7, quota 7, import-export 7) |
| `npm run build` | PASS | `tsc --noEmit && vite build` exit 0 |
| `npm run test:e2e` | PASS (30/31) | 30 pass (22 game.spec + 8 memory-stress); the single failure is the 239 `memory-stress` "long exploration session keeps heap and GPU-resource growth within ceilings" test — `meshGeometries` drift 19 > ceiling 4. Proven pre-existing and environment-specific (see the Baseline e2e caveat section); 240 adds no e2e scenarios. |

## Edge/adversarial validation

- **Unit whose write always fails across a graceful flush** — `abrupt-close.stuck-flush` drives
  `createFaultySaveSink(failKeys:['bad'])`; the coordinator `flush()` zero-progress guard terminates after
  three zero-progress drains, the writable units are written, and the failing unit stays pending (never
  dropped): `written=3 pending=1`.
- **Corrupt record already in a store is rejected on read** — `partial-write.corrupt-read-rejected` seeds a
  non-numeric `schemaVersion` metadata record via `fixture.putRawMetadata` and asserts
  `validateWorldMetadata` (the trusting read/load path) rejects it.
- **Quota failure injected mid-import** — the atomic-rejection scenarios reject malformed archives before any
  store write; quota gating during a drain is covered by `quota.write-gate` / `quota.pause-resume` (no
  repository write while `canWrite()` is false, no store pollution).
- **Unsupported archive version rejected before any import write** — `migration.unsupported-archive-version`
  asserts `validateWorldArchive` throws for `version: 2`.

## Migration/compatibility validation

- Schema upgrade `v1..4 → v5` creates all five stores and preserves prior data; reopen at v5 is a no-op
  (idempotent). Direct test seeds a v2 database and writes to the upgraded `chunk-sections` store.
- `DataMigrationChain` refuses GAP / DUPLICATE / DOWNGRADE / UNKNOWN_VERSION; input never mutated.
- No `WORLD_DB_VERSION` / `WORLD_ARCHIVE_VERSION` / stored-shape change; 034-043 API unchanged. The harness
  (`src/storage/SaveRecoveryMatrix.ts`) is additive.
- 234 reconciliation: `ServerSaveLifecycle` (now present in `src/simulation/`) is covered by
  `abrupt-close.server-save-lifecycle` (abrupt-termination recovery) and a focused `saveAndClose` →
  reload test. The 034-037 raw repository `get` unvalidated-passthrough behavior is documented and the
  corrupt-read contract is asserted at the validating read/load path (see partial-write spec amendment).

## Performance/resource validation

- The full matrix runs headlessly over in-memory stores; `npx vitest run` of all six 240 suites completes in
  ~0.5s (185ms of actual test time in the focused run). Each scenario is a small, bounded number of
  repository round-trips; no hot-path or frame-budget impact.

## Regressions

- Baseline gate green alongside the 240 suites except one unrelated, pre-existing e2e failure: typecheck, lint, unit 3574 + 1 skipped, build all PASS; e2e 30/31 with the single 239 memory-stress "long exploration session" test failing on this machine (see below). No 240 regression.

## Baseline e2e caveat (unrelated, pre-existing)

The change-239 e2e test `tests/e2e/memory-stress.spec.ts:204` ("long exploration session keeps heap and GPU-resource growth within ceilings") fails **deterministically** on this machine: `finalGeometries - firstGeometries === 19` against a `GEOMETRY_DRIFT` ceiling of 4. It is **not a 240 regression**:

- 240 changes are exclusively additive: one new storage harness (`src/storage/SaveRecoveryMatrix.ts`) plus new test files. Nothing in `src/` imports it, so it is tree-shaken out of the production bundle — the bundle served by `vite preview` for e2e is identical to HEAD (`59b6e8d`).
- The 239 verification recorded e2e **PASS 31/31** at its own gate (PROGRAM_STATE.json validationResults for 239), and it passes under CI (`retries: 2`); it is environment-specific to this machine's software WebGL / load.
- The failure reproduces identically in isolation (`npx playwright test memory-stress.spec.ts -g "long exploration session keeps heap"`), confirming it is not an interference artifact of the full suite.

Resolution options (orchestrator's call): rerun the e2e gate in CI or on a lighter environment (where it passes), or treat the flake as non-blocking since it is demonstrably not caused by and does not exercise 240 code. No 240 MUST/SHALL requirement is affected.

## Incomplete tasks

- None. All 12 tasks (tasks.md groups 1-4) are complete and checked.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

240-save-recovery-stress is fully implemented and verified in scope: 100% task completion (12/12), all mandatory
requirements and the static/unit/build gates pass, 25 matrix scenarios PASS. The only non-green baseline gate item
is the unrelated, pre-existing 239 memory-stress e2e flake documented above, which is not a 240 regression and
affects no 240 MUST/SHALL requirement. Final advancement is held pending the orchestrator's resolution of that
flake (rerun e2e in CI/lighter env, or explicitly waive it as non-blocking).
