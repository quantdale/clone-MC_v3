# Verification: 283-live-raid-persistence

Status: VERIFIED
Completion: 13/13 (100%) — T1–T13 complete; all mandatory gates green with documented non-blocking E2E variance; published to `origin/main` at `73ad0dfde5ce1d96a2fa5cf5afe1e05a6c5252b8`
Advancement allowed: true

Control plane is activated on `wt/283-live-raid-persistence` (T1: `CHANGE_SEQUENCE.md` row,
`CHANGE_SEQUENCE_OVERRIDES.md` addendum, `PROGRAM_STATE` 283 ACTIVE; sessionStartHead
`a463e0fe8571576fc10a5bda49dead34b0eac61a`, local HEAD after package commit
`56c2313609556b2b2d99215c55f26729e244baf2`). T2 SPEC_AUTHORING_PROTOCOL quality gate
passed 2026-09-23. Implementation T3–T10 and regression T11 complete; this file records
actual gate evidence for T12.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| R-1 World-scoped `__raid__` hydrate/save via `serializeRaid`/`deserializeRaid` | `tests/unit/RaidPersistence.test.ts` (round-trip + rejection classes), `tests/unit/LiveRaidPersistence.test.ts` (hydrate/save/guards), `tests/e2e/raid-persistence.spec.ts` reload leg (equal state + visible bar); focused unit 84/84, focused E2E 8/8 | PASS |
| R-2 Fail-closed runtime validation (invalid/stale ⇒ null, no partial state) | RaidPersistence rejection suite (null/non-object/stale `schemaVersion`/unknown status/non-finite center/bad counters/`waveIndex>totalWaves` ⇒ null); corrupt-boot E2E leg (`{schemaVersion:99}` → `raidState` null, `#loading`/`#error` hidden) | PASS |
| R-3 Fail-closed archive migration (malformed `raidData` ⇒ pre-write throw) | `validateWorldArchive` fail-closed `raidData` via `validatePersistedRaid`; WorldArchiver unit malformed ⇒ throw + zero writes; archive refuse-import E2E leg (`status:'NOPE'` → `ok:false` with error matching `/WorldArchive\|RaidPersistence\|schemaVersion\|status/i`, reload still boots) | PASS |
| R-4 Reload restores current raid; absent/corrupt ⇒ null | E2E reload equal-state + visible ACTIVE bar; reset → reload null + hidden NONE; absent boot null (raid-feedback boot leg + persistence reset leg); corrupt degrades null | PASS |
| R-5 Single-record duplicate/stale rules (one key, schemaVersion 1 only) | `putRaidData` overwrite single-key unit (T4 48/48 includes overwrite + per-world isolation); stale `schemaVersion` rejected at both serialize and deserialize boundaries | PASS |
| R-6 Reset delete + archive export/import passthrough | GamePersistence reset snapshot/delete/restore unit; `WorldArchiver` export/import + `raidDataImported`; E2E archive leg (export without ⇒ null, with ⇒ `schemaVersion===1`, import round-trip restores + reload, empty import `raidDataImported:false`) | PASS |
| R-7 Lifecycle save points (autosave/dispose/pagehide) with guards | `LiveRaidPersistence.test.ts` 7/7 (hydrate equal, absent null, round-trip, null-clear, dispose order save-before-clear, double-save guard, corrupt degrade); Game `saveRaid()` wired at autosave/dispose/pagehide with recovery-required guard | PASS |
| R-8 No raider spawning / 282 feedback contract preserved / 258 BLOCKED | T11 scope audit: `git diff origin/main` outside openspec = only additive 283 seams + `.gitignore` (`NO_OUT_OF_SCOPE_FILES`); no spawning/settlement/258 code; 282+283 unit regression 149/149; all four `raid-feedback` E2E journeys green (reload rewritten for 283 restore); `PROGRAM_STATE` keeps 258 BLOCKED / 259–282 VERIFIED; no GPU/headed evidence claimed | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` exit 0 (full project) |
| `npm run lint` | PASS | 0 errors, 85 existing `no-explicit-any` warnings (baseline unchanged) |
| `npm test` | PASS | 449 files, 5351 passed + 1 skipped (5352 total), 34.51s |
| `npm run build` | PASS | `tsc --noEmit && vite build`, 249 modules, 3.87s; existing chunk-size advisory only |
| `npm run test:e2e` | PASS (documented baseline variance) | Full suite `bash-05931f31a4e24d5e` 1737s: **110 passed / 2 failed** (112 total). All raid E2E green (`raid-persistence` 4 + `raid-feedback` 4 + focused regression). Both failures classified non-blocking below. Evidence: stdout `/home/box/.local/share/cortexkit/aft/opencode/bash-tasks/7604a3e7997ff3ce/bash-05931f31a4e24d5e/io/stdout` (`E2E_FULL_EXIT:0`, `2 failed / 110 passed (28.9m)`). |
| file-audit | PASS | `validate-file-audit` 2892 rows, sha `75d564f6b40cfaffb2733e848777d688fac652fe` |
| `npm run validate-state` | PASS | `validate-state.mjs` PASSED after every PROGRAM_STATE/tasks edit in this session |
| Focused raid unit | PASS | RaidPersistence + LiveRaidPersistence + WorldArchiver + ValidateFileAuditScript = 4 files, 84 tests |
| 282+283 regression unit | PASS | LiveRaidFeedback + RaidFeedbackView + RaidStateMachine + LiveRaidPersistence + RaidPersistence + WorldArchiver + GamePersistence = 7 files, 149 tests |
| Focused raid E2E | PASS | 8/8 in 1.2m (sole foreground run; concurrent duplicate hit `ERR_CONNECTION_REFUSED` on port 4173 — environmental, not functional) |

## Edge/adversarial validation

- null/non-object payload; wrong `schemaVersion` (stale); unknown status; non-finite center;
  negative/fractional counters; `waveIndex > totalWaves` — all covered by RaidPersistence
  rejection unit classes and degrade to null at runtime load.
- Duplicate `putRaidData` overwrite — single key last-write-wins unit proof.
- Corrupt boot ⇒ null without throw — corrupt-boot E2E leg (`#loading`/`#error` hidden).
- Malformed archive `raidData` ⇒ import aborts with zero writes — WorldArchiver unit +
  archive refuse-import E2E leg.
- Quota/recovery-required save guard — LiveRaidPersistence double-save / recovery guard.
- Dispose save-before-clear — LiveRaidPersistence dispose-order unit + dispose E2E (bar hides).
- Reload of active raid restores terminal/active counters exactly — E2E `toEqual(before)`.

## Migration/compatibility validation

- World without `__raid__` boots `raidState === null` (absent-record boot legs).
- Archive without `raidData` imports as null (`raidDataImported: false` E2E + unit).
- Older builds ignore `__raid__` (additive raw key; no schema bump).
- Fail-closed import never persists garbage (malformed refuse-import, zero partial writes).
- Reset deletes the record and reload stays null (reset E2E leg).

## Performance/resource validation

- One serialize+put per save point (autosave/dispose/pagehide), one get+deserialize at boot;
  no per-tick I/O; no entity/GPU work. Diff adds no timers/workers (scope audit).

## Regressions

- Full unit 449 files / 5351+1 green.
- 282 raid-feedback journeys: all four green under rewritten reload expectations.
- 259–282 not reopened; Change 258 remains BLOCKED (no headed FPS evidence claimed);
  Changes 259–282 remain VERIFIED.
- `NO_OUT_OF_SCOPE_FILES`: only additive 283 seams + `.gitignore` fix outside openspec.

## E2E failure classification (T12)

Full-suite failures were isolated and proven non-blocking:

1. **`tests/e2e/enchanting.spec.ts:227` — FLAKE (not a 283 regression).** Isolated re-run
   `npx playwright test tests/e2e/enchanting.spec.ts` (task `bash-ee3051a71b7ebf91`) passed
   **2/2 in 52.0s** against the unchanged 283 tree. The enchanting path does not touch the
   `__raid__` seam; Change 279's verification documented the same test as an unrelated
   transient baseline flake. Expected `"null"` vs `null` timing around enchant outcome after
   reload — environmental, not functional.
2. **`tests/e2e/visual-regression.spec.ts:176` — BASELINE-EQUIVALENT visual drift.** Isolated
   re-run (task `bash-76b2cad5d4f92258`, log `/tmp/visual-283-classify.log`, 493s) yielded
   **30 fail / 30 pass**, all `exceeded-threshold` in the 0.020–0.062 band (Linux SwiftShader
   software-WebGL golden drift, documented since 281/282). Compared against two independent
   baselines — `/tmp/visual-282-rerun.log` (282 pristine-tip `722f007` evidence) and
   `/tmp/visual-head.log` (origin/main head) — both record the same **30 fail / 30 pass**
   count. Cell-set diff is a one-cell swap only: current has extra
   `crosshair/high/1920x1080` fail (0.0203) and lacks `start-overlay/high/1920x1080`;
   25/30 failing fractions are byte-identical to baseline, remainder differ only in magnitude
   within the same drift band. No 283-owned cell regressed. Precedent: 282 verified with the
   same 30/30 fail/pass at pristine tip.

No 283 functional E2E regression remains; no headed GPU evidence is claimed.

## Incomplete tasks

None. T13 completed: `C283` exact/VERIFIED matrix row, Scope/Summary/coverage reconciled to 001–283 (285 total rows), PROGRAM_STATE 13/13 VERIFIED, committed and published to `origin/main` per `REVIEW_HANDOFF.md`, published at `73ad0dfde5ce1d96a2fa5cf5afe1e05a6c5252b8` (origin/main
verified equal to local HEAD).

## Advancement Exception

Not applicable; the target is 100%.

## Final decision

**VERIFIED 13/13 (100%).** T1–T13 complete. All mandatory gates pass: typecheck, lint
(0 errors), unit 5351+1, build, file-audit 2892, validate-state, and full E2E (110 passed;
2 failures independently proven a transient enchanting flake + baseline-equivalent visual
drift — neither is a 283 functional regression). `C283` is exact/VERIFIED in
`PARITY_MATRIX.md`; PROGRAM_STATE records 283 VERIFIED with
`mandatoryRequirementsPass`/`requiredTestsPass`/`advancementAllowed: true`. Change 258
remains BLOCKED; Changes 259–283 are VERIFIED. Published to `origin/main` per
`REVIEW_HANDOFF.md`.
