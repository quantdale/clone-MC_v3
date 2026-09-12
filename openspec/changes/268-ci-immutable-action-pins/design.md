# Design: 268-ci-immutable-action-pins

## Context/current state

`.github/workflows/ci.yml` has 7 floating steps (checkout ×2, setup-node ×2,
upload-artifact ×2, cache ×1) and
`.github/workflows/seed-visual-goldens.yml` has 4 (one of each). All use the
`@v4` floating major tag. Both files already run under
`permissions: contents: read`, which bounds but does not remove the
supply-chain risk recorded as R-5.

## Target state

All 11 steps use immutable refs:

```yaml
uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4
uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
```

SHA provenance (all resolved 2026-09-12 via
`GET /repos/{owner}/{repo}/git/refs/tags/v4`, each confirmed as a real commit
via `GET /repos/{owner}/{repo}/commits/{sha}`):

| Action | SHA | Tip commit subject | Tip date |
|---|---|---|---|
| checkout | `11d5960a…77262` | backport fixes to releases-v4 (#2524) | 2026-07-16 |
| setup-node | `49933ea5…20020` | Bump @action/cache 4.0.2→4.0.3 (#1262) | 2025-04-02 |
| cache | `0057852b…39830` | Merge PR #1655 (prepare-4.3.0) | 2025-09-24 |
| upload-artifact | `ea165f8d…7fa02` | Merge PR #685 (3-new-upload-artifacts-release) | 2025-03-19 |

## Invariants

- I-1: Each pinned SHA MUST equal the upstream `v4` tip observed at pin
  time (no older/newer substitution).
- I-2: Each pinned line MUST retain a `# v4` comment naming the tracked
  major version, so future refreshes know what to re-resolve.
- I-3: Nothing else in either workflow file changes (job names, inputs,
  `with:` blocks, permissions, concurrency, run commands byte-identical).
- I-4: No `src/`, `tests/`, or other workflow file is touched.

## API and data model

Not applicable (no code API). The "data" is the 4-row pin table above, frozen
into `verification.md`.

## Control/data flow

Author-time: API resolve → verify commits → edit 11 lines → YAML parse +
floating-ref grep → local gates → commit → push → watch CI on exact SHA.
Runtime: GitHub resolves each pinned SHA to the same action code `v4`
pointed at on 2026-09-12.

## Detailed behavior

- `ci.yml` gate job: checkout, setup-node pinned; upload-artifact
  (failure-only coverage upload) pinned.
- `ci.yml` e2e job: checkout, setup-node, cache, upload-artifact pinned.
- `seed-visual-goldens.yml`: checkout, setup-node, cache, upload-artifact
  pinned.
- Comment style: ` # v4` (single space, matching the file's existing
  comment conventions).

## Failure modes

- F-1 mistyped SHA: GitHub fails the job at resolve time ("unable to resolve
  action"). Detection: CI red on the pushed SHA → fix forward, change not
  VERIFIED until green.
- F-2 stale pin over time: upstream `v4` moves on; CI keeps running the
  pinned (older, known) code. Safe by design; refresh is future work.
- F-3 YAML syntax slip: local `python3 -c yaml.safe_load` parse of both
  files plus `git diff` review before commit.

## Compatibility/migration

None required. No persisted state, no consumer code, no bundle.

## Performance/resource constraints

None. CI wall-clock is unchanged (same action code as `v4` resolved today).

## Testing seams

- Static: `grep -rn "actions/.*@v" .github/workflows/` must show only
  `@<sha> # vN` lines; YAML safe-parse must succeed.
- Live: the GitHub Actions run on the published SHA (gate + e2e jobs) is the
  authoritative test — a resolve failure or behavior delta surfaces there.

## Observability/debugging

`verification.md` carries the full pin table + API method + dates. Any future
session can re-run the two `curl` commands to check for drift.

## Affected files/symbols

- `.github/workflows/ci.yml` (7 lines)
- `.github/workflows/seed-visual-goldens.yml` (4 lines)
- `openspec/hardening/2026-08-23-exhaustive-repository-certification/risk-register.md`
  (R-5 row only)
- `PARITY_MATRIX.md` (C268 row + summary counts + post-terminal note)
- OpenSpec state files (`PROGRAM_STATE.json`/`.md`, sequence files, 268
  package)

## Rejected alternatives

- Renovate/Dependabot auto-refresh: useful future work, but a new mechanism
  outside this change's narrow "pin then" scope; rejected to keep the diff to
  11 lines + docs.
- Pinning to a shorter (7-char) SHA: rejected — full 40-hex is unambiguous
  and matches supply-chain guidance.
- Leaving the failure-only `upload-artifact` steps floating: rejected —
  partial pinning leaves R-5 half-open.

## Downstream dependencies

None. No later change depends on pin format; future pin refreshes re-resolve
the same 4 refs.
