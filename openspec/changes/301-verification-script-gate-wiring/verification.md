# Verification: 301-verification-script-gate-wiring

Status: NOT VERIFIED
Completion: 0% (T1 is pre-implementation evidence only; T2–T14 are open)
Advancement allowed: false

Authored by an audit campaign that is **forbidden from implementing code**. T1
records the measured baseline. No passing evidence is pre-filled.

## Pre-implementation evidence captured at base `2ecf781`

### E1 — Script-to-automation reference matrix

Produced by cross-referencing every `scripts/*.mjs` against `package.json` and
`.github/workflows/*.yml`:

| Script | npm/CI-referenced | Purpose (self-documented header) |
|---|---|---|
| `validate-state.mjs` | **yes** (`package.json`, `ci.yml`) | program-state coherence |
| `check-release-bundle.mjs` | **yes** (`ci.yml`) | E2E hook must not leak into the release bundle |
| `validate-file-audit.mjs` | **no** | reviewed file-audit manifest integrity |
| `gen-file-audit.mjs` | **no** | manifest generator (`status:"pending"` by design) |
| `orphan-check.mjs` | **no** | zero-internal-importer (dead) source detection |
| `verify-mcp-addons.mjs` | **no** | fail-closed `.mcp.json` security preflight |
| `audit-inventory.mjs` | **no** | legacy-world pattern scanner |
| `build-evidence-archive.mjs` | **no** | consolidated evidence archive generator |

**Six of eight shipped verification scripts are reachable only by knowing their
file path.**

### E2 — The unwired gates are real and currently green

```
$ node scripts/orphan-check.mjs
Source files: 384
Files with zero internal importers (potential entry/dormant): 3
  - src/main.ts
  - src/rendering/MeshWorkerEntry.ts
  - src/worldgen/WorldgenWorkerEntry.ts
exit=0

$ node scripts/verify-mcp-addons.mjs
PREFLIGHT OK: repository-local MCP config validated (pinned, secret-free, no global resolution).
exit=0

$ node scripts/validate-file-audit.mjs openspec/hardening/2026-08-23-exhaustive-repository-certification/file-audit-manifest.json
File-audit validation PASSED (3031 rows, reviewed manifest, sha 3d0fd2d5aee39ae1706b7210ad27e675450f521c)
exit=0
```

All three are meaningful gates that currently pass — they are not dead weight,
and they are not being run by anything.

### E3 — The file-audit gate is claimed as mandatory but is not automated

`openspec/changes/297-gunpowder-and-splash-brewing/verification.md` lists it
beside typecheck/lint/unit/build:

```
| node scripts/validate-file-audit.mjs …/file-audit-manifest.json | PASS | 3031 rows |
```

The same claim appears across the change record, yet the enforcement is manual.

### E4 — No aggregate gate command exists

`package.json` scripts are: `dev, build, preview, test, test:watch,
test:coverage, test:e2e, test:perf, test:e2e:ui, lint, typecheck,
validate-state`. `AGENTS.md` "Baseline verification" lists
`typecheck / lint / test / build / test:e2e`. Neither the file-audit, orphan,
nor add-on preflight gate appears in either list, and there is no single
command that runs the full sequence.

### E5 — `gen-file-audit.mjs` must not be auto-run

Its own header states it "deliberately CANNOT produce audit verdicts" and emits
`status: "pending"` rows. Wiring it into a gate would let an unaudited manifest
be regenerated and then read as reviewed — the opposite of the gate's purpose.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Every verification script is npm-exposed | E1/E4 show six unexposed and no aggregate. T3 unimplemented. | NOT VERIFIED |
| Invariant gates block CI | E1 shows three invariant gates absent from `ci.yml`. T7 unimplemented. | NOT VERIFIED |
| Aggregate verification command exists | E4 shows none. T4 unimplemented. | NOT VERIFIED |
| Gate catalogue documented | No gate catalogue exists. T10 unimplemented. | NOT VERIFIED |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| script↔automation cross-reference | 6 of 8 unexposed | E1 |
| `node scripts/orphan-check.mjs` | PASS (3 known entry points) | E2 |
| `node scripts/verify-mcp-addons.mjs` | PASS | E2 |
| `node scripts/validate-file-audit.mjs …` | PASS (3031 rows) | E2 |
| `npm run validate-state` | PASSED | see change 298 E1 |
| `npm run typecheck` | PASS | see change 298 E1 |
| `npm run lint` | PASS (0 errors / 85 warnings) | see change 298 E1 |
| `npm test` | FAIL (2 unit tests) | see change 298; unrelated |
| `npm run build` | NOT RUN | must PASS at T12 |
| `npm run test:e2e` | NOT RUN | must PASS at T12 |

## Edge/adversarial validation (required at T6/T8/T9)

- [ ] Every `scripts/*.mjs` verification program is referenced by an npm script.
- [ ] `verify:file-audit` fails and names a tracked file that has no manifest row.
- [ ] `verify:orphans` fails and names a new zero-importer source file.
- [ ] `verify:orphans` still passes for the three allow-listed entry points.
- [ ] `verify:mcp` fails and names an add-on entry with an unpinned version or an
      embedded secret.
- [ ] `verify:all` on a clean tree: every mandatory gate PASS, exit 0.
- [ ] `verify:all` with an early-gate failure: stops at that gate, prints
      `FAIL <gate> (exit <code>)`, and reports no success for any later gate.
- [ ] `verify:all` propagates the failing gate's exit code rather than a generic
      non-zero.
- [ ] `verify:all` times out per gate and names the gate on timeout.
- [ ] Each synthetic violation is produced and reverted in a throwaway
      worktree; the primary tree is never dirtied.

## Migration/compatibility validation

- [ ] No existing `scripts/*.mjs` logic is modified.
- [ ] No file under `src/` is modified.
- [ ] The CI `gate` job's existing steps are unchanged apart from the three
      additions; the `e2e` job is untouched.
- [ ] Each wired gate is green on the candidate SHA before it is added to the
      blocking path.

## Performance/resource validation

- [ ] Each newly wired CI gate completes in under 60 s.
- [ ] `verify:all` performs no duplicated work within one invocation.
- [ ] No wired gate reads or rewrites the visual golden PNG sets.

## Regressions

- None by design: the change adds npm script entries, one CI-job step block, one
  new runner script, one test file, documentation, and an allow-list. No product
  or gate logic changes.
- Note: `verify:all` will take as long as its heaviest gate (`test:e2e`,
  ~33.5 min) plus the unit suite. This is expected; document the expected
  wall-clock so it is not mistaken for a hang.

## Incomplete tasks

T2–T14 (13 of 14 tasks). Completion **0%** by checkbox count.

## Advancement Exception

Not applicable: completion is below 90%; advancement is forbidden.

## Final decision

**NOT VERIFIED.** Six of the repository's eight shipped verification scripts —
including the file-audit manifest integrity gate that every change's verification
record claims as mandatory, the dead-code `orphan-check`, and the fail-closed
`.mcp.json` security preflight — are not referenced by any npm script or CI step,
so their guarantees are not enforced and can regress silently. T2–T14 must be
implemented, and each wired gate must be demonstrated to fail on a synthetic
violation before this change may be marked VERIFIED.
