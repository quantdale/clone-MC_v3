# Verification: 268-ci-immutable-action-pins

Status: IMPLEMENTED (pending CI green on the published SHA)
Completion: 80%
Advancement allowed: false

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
| `npm test` | PASS | 419 files: 5018 passed + 1 skipped (file-audit manifest extended 2755→2760 for the 5 new 268 files) |
| `npm run build` | PASS | 2.28s, unchanged |
| CI on published SHA (gate + e2e) | PENDING | authoritative live proof; run URL recorded here when green |

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

T8 complete (all local gates PASS). T9 (matrix row — added only at VERIFIED time so the matrix never claims VERIFIED early) and T10 (publish + CI watch) open.

## Advancement Exception

Not applicable (target 100%; none expected).

## Final decision

PENDING — decided after CI green on the exact published SHA.

Local-e2E note: no `src/`/`tests/` file is touched by this change, so a local
`test:e2e` run would execute byte-identical bundles to the 267-verified
baseline (82/82) with zero signal about the change itself; the authoritative
e2e gate is the watched CI run on the published SHA (same suite, same code).
Local gates run: `validate-state`, `typecheck`, `lint`, `build`, unit `test`.
