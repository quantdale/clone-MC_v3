# Proposal: 268-ci-immutable-action-pins

## Problem

CI workflows reference third-party GitHub Actions by floating major-version
tags (`actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache@v4`,
`actions/upload-artifact@v4`) in `.github/workflows/ci.yml` (7 steps) and
`.github/workflows/seed-visual-goldens.yml` (4 steps). A floating tag can move
to new code at any time, so the exact code running in CI is not pinned.
Certification debt **R-5** (risk register 2026-08-23) tracks exactly this and
names its revisit trigger: "First online maintenance window; pin then." This
session is online and authorized to close it.

## Goals

- Pin every `uses: actions/*@v4` step in both workflow files to the immutable
  full commit SHA that `v4` currently points to, keeping a `# v4` trailing
  comment so the human-readable version stays visible.
- Document each pin (SHA, resolution method, date) in the change
  `verification.md`.
- Close risk-register **R-5**.
- Prove CI green on the exact published SHA after push.
- Change no gameplay, simulation, persistence, or test behavior.

## Non-goals

- No `src/` or `tests/` change of any kind.
- No headed FPS work, no GPU evidence, no change to 258 status.
- No reopening of 259–267.
- No automated pin-refresh tooling (Dependabot/Renovate); a future numbered
  change may add it. Stale pins are safe (they run old-but-known code, never
  unknown code).
- No pinning of non-`actions/*` references (none exist in the workflows).

## Preconditions

- Online access to `api.github.com` to resolve `v4` tags to SHAs (verified
  this session before editing).
- `origin/main` fetched; session start `9d5fdb16e70735a915c06955fc495192378da953`
  with local HEAD equal to remote.

## Dependencies

- None on other numbered changes. 267 is VERIFIED; 258 stays BLOCKED.

## Proposed change

Replace all 11 floating `actions/*@v4` references with
`actions/*@<40-hex-sha> # v4`, using these API-resolved pins (verified
2026-09-12, still the current `v4` tips at edit time):

| Action | v4 SHA |
|---|---|
| `actions/checkout` | `11d5960a326750d5838078e36cf38b85af677262` |
| `actions/setup-node` | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `actions/cache` | `0057852bfaa89a56745cba8c7296529d2fc39830` |
| `actions/upload-artifact` | `ea165f8d65b6e75b540449e92b4886f43607fa02` |

Update the R-5 row to CLOSED, add a `PARITY_MATRIX.md` C268 `n/a` row
(CI-infra, documentation-equivalent precedent: C248/C249/C250), and publish
with CI watched to green on the exact SHA.

## Compatibility and migration

No stored data, no public API, no bundle output. Workflow semantics
(versions, inputs, permissions, concurrency) are byte-identical apart from
the ref format. Rollback is a single revert of the two workflow files.

## Risks

- A mistyped SHA would fail workflow resolution and turn CI red. Mitigated:
  SHAs are copied from API output, verified as real commits, YAML-parsed
  locally, and CI itself is watched to green on the published SHA before the
  change is marked VERIFIED.
- Pins go stale as upstream `v4` advances. Accepted: stale pins run known
  code; refresh is a future numbered change, not this one.

## Rollback strategy

Revert the workflow-file commit (or the two-file hunk) to restore `@v4`
tags; R-5 would be reopened by a follow-up state update.

## Definition of Done

- Zero `actions/*@vN` floating refs remain under `.github/workflows/`.
- Every pinned step carries its `# v4` comment.
- `verification.md` records each SHA with resolution method and date.
- R-5 reads CLOSED.
- `npm run validate-state` PASS; typecheck/lint/build/unit green (no src
  change, so trivially unaffected — still run to prove it).
- CI (gate + e2e) green on the exact published SHA.
- C268 `n/a` matrix row added with counts reconciled.

## Advancement gate

100% tasks (10/10) + all MUST/SHALL verified + required gates PASS. No
Advancement Exception expected; if CI cannot be observed green (e.g. runner
outage), the change stays IMPLEMENTED, not VERIFIED, with the blocker
recorded.
