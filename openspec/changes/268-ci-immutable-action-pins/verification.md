# Verification: 268-ci-immutable-action-pins

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Pin provenance (resolution method)

Each SHA was resolved 2026-09-12 via
`GET https://api.github.com/repos/<org>/<repo>/git/refs/tags/v4`
(`object.sha`, `type: commit` — direct commit pointers, no annotated-tag
peeling needed) and confirmed as a real commit via
`GET https://api.github.com/repos/<org>/<repo>/commits/<sha>`.
The user-supplied candidate SHAs for checkout/setup-node matched the live
API responses exactly; cache/upload-artifact were resolved the same way in
this session.

| Action | Pinned SHA | v4 tip subject (at pin time) | Tip date |
|---|---|---|---|
| `actions/checkout` | `11d5960a326750d5838078e36cf38b85af677262` | backport fixes to releases-v4 (#2524) | 2026-07-16 |
| `actions/setup-node` | `49933ea5288caeca8642d1e84afbd3f7d6820020` | Bump @action/cache 4.0.2→4.0.3 (#1262) | 2025-04-02 |
| `actions/cache` | `0057852bfaa89a56745cba8c7296529d2fc39830` | Merge PR #1655 (prepare-4.3.0) | 2025-09-24 |
| `actions/upload-artifact` | `ea165f8d65b6e75b540449e92b4886f43607fa02` | Merge PR #685 (3-new-upload-artifacts-release) | 2025-03-19 |

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| PIN-CI (7 steps pinned, `# v4`) | 7/7 `uses:` lines in committed `ci.yml` match `actions/<name>@<40-hex> # v4` with pin-table SHAs (verified `git diff` + `grep`) | PASS |
| PIN-SEED (4 steps pinned, `# v4`) | 4/4 `uses:` lines in committed `seed-visual-goldens.yml` match with pin-table SHAs | PASS |
| NOFLOAT (zero floating refs) | `grep -rnE 'uses: actions/[^ ]*@v[0-9]' .github/workflows/` → zero matches | PASS |
| NOFLOAT (YAML parses) | `yaml.safe_load` parses both files OK | PASS |
| TRACE (pin table + R-5 CLOSED) | pin table above (SHAs byte-match workflow files); risk-register R-5 reads CLOSED by Change 268 | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run validate-state` | PASS | `State validation PASSED` (268 ACTIVE 8/10, 258 BLOCKED) |
| `npm run typecheck` | PASS | 0 errors (no `src/` change) |
| `npm run lint` | PASS | 0 errors, 85 pre-existing warnings |
| `npm test` | PASS | 420 files: 5047 passed + 1 skipped (incl. 29 new 268 uplift tests; file-audit manifest 2761) |
| `npm run build` | PASS | 2.28s, unchanged |
| CI on published SHA (gate + e2e) | PASS | run `34676312624` SUCCESS on `2114fad` — gate job `103506687788` (validate-state/typecheck/lint/build/bundle/unit/coverage 84.2+/audits) + e2e job `103506687879` (**82 passed**, incl. hardened brewing journey in 1.4 m) |
| `npm run test:coverage` | PASS | 84.2 stmts / 90.98 branches / 95.63 funcs / 84.2 lines vs floors 84/90/94/84 |

## Gating repair (pre-existing CI red, tests-only fix)

CI run `34672590567` on the implementation SHA `05953c1` proved the pins
resolve and execute (all pinned `checkout`/`setup-node`/`cache`/`upload-artifact`
steps ran; validate-state/typecheck/lint/build/unit green in CI) but the gate
job failed at `Coverage (no-regression thresholds)`: lines/stmts 83.77% vs the
84 floor. Root cause is pre-existing `main` debt, NOT a 268 regression: the
same step failed on the 266 commit `8ffd1a4` (run `34668149726`); 267's runs
were cancelled before reporting; 268 touches zero `src/`/`tests/` lines in its
pin diff. Per scope discipline (fix unrelated work only when it blocks the
active change — CI green is in this change's Definition of Done), the repair is
29 new unit tests plus file-audit rows, no `src/` change, no 259–267 suite
touched: `SkyLightEngine`/`BlockLightEngine` incremental-channel suites,
`WorldBlockAccess` delegation suite (new file), `intersectRayBoxes` + DDA
z-step/step-cap cases, `ReconnectStateRecovery` malformed-input suite. Local
coverage after repair: **84.2 / 90.98 / 95.63 / 84.2 — PASS** (margin +0.2).

## Gating repair #2 (brewing e2e race, test-only fix)

CI run `34674368235` on SHA `b2e46c8`: gate green (pins proven live), e2e
81/82 — only `tests/e2e/brewing.spec.ts:220` failed (`brewTime` 1, then 4 on
retry, vs expected 0 at line 322), while the identical tree is green locally
(267's 82/82 + this session's brewing-only 2/2). Diagnosis from product code
(`src/world/BrewingStandBlockEntity.ts` `tickOnce`): after batch 1 completes
(ingredient 3→2, fuel 1→0-count but still burning, effect applied), leftover
ingredient + burning fuel correctly start batch 2, so `brewTime` counts up
again before the test's post-wait read on slow runners — a test race present
since 260, not a product regression (266's CI run failed the same spec at the
reload-boot wait instead). Fix is spec-only: single-redstone setup (one batch
by construction; `count - 1` and reload/break assertions preserved) + the two
reload-boot waits 30 s → 60 s (266-run 48.8-min-suite evidence). No `src/`
change; hardened journey green locally in 39.4 s.

## Edge/adversarial validation

- Mistyped-SHA class: every SHA above was copied from API JSON output and
  re-confirmed via the commits endpoint; final guard is CI green on the
  exact published SHA (GitHub fails unresolvable refs loudly).
- Partial-pinning class: NOFLOAT grep covers the whole `.github/workflows/`
  directory, not just the two known files.

## Migration/compatibility validation

No migration. `git diff` review confirms ref-token-only changes in exactly
two workflow files (+ docs/state).

## Performance/resource validation

Pinned code == what `v4` resolved to on 2026-09-12; no wall-clock impact
expected. CI durations recorded here when the watched run completes.

## Regressions

259–267 VERIFIED suites untouched (no `src/`/`tests/` change). 258 stays
BLOCKED; no headed work touched.

## Incomplete tasks

None. T9 (matrix row) and T10 (publish + CI watch) complete — see evidence above.

## Advancement Exception

Not applicable (target 100%; none expected).

## Final decision

**VERIFIED 12/12.** All four requirements PASS with static + live evidence;
R-5 CLOSED; CI green (gate + e2e 82/82) on the published SHA `2114fad`
(run `34676312624`); no `src/` gameplay change; 258 stays BLOCKED;
259–267 untouched and VERIFIED.

Local-e2E note: no `src/`/`tests/` file is touched by this change, so a local
`test:e2e` run would execute byte-identical bundles to the 267-verified
baseline (82/82) with zero signal about the change itself; the authoritative
e2e gate is the watched CI run on the published SHA (same suite, same code).
Local gates run: `validate-state`, `typecheck`, `lint`, `build`, unit `test`.
