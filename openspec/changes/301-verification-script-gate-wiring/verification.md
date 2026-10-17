# Verification: 301-verification-script-gate-wiring

Status: VERIFIED
Completion: 100% (100% of tasks)
Advancement allowed: true
Session start head: `43ece1637f16a52056fdceced4e512e924dac154` (origin/main after change 300)
Published head: recorded in `openspec/PROGRAM_STATE.json` after publication

## Summary

Every verification program the repository ships is now reachable through a named
npm command, the three fast repository-invariant guards run in CI, and one
aggregate command runs the documented gate order and stops at the first failure.
This closes audit finding F-004: six of eight shipped verification programs were
previously reachable **only by typing a file path**, including the file-audit
manifest gate that every change's `verification.md` claims as mandatory and a
fail-closed MCP security preflight.

No gate logic changed and no product code changed.

## Baseline (measured at activation)

```
$ for s in validate-file-audit gen-file-audit orphan-check verify-mcp-addons \
           audit-inventory build-evidence-archive; do
    grep -rl "$s" package.json .github/workflows/ | wc -l
  done
validate-file-audit: 0     gen-file-audit: 0        orphan-check: 0
verify-mcp-addons:  0      audit-inventory: 0       build-evidence-archive: 0
```

All six unenforced. Each was verified to work when invoked by hand:

| Script | Manual result |
|---|---|
| `validate-file-audit.mjs <manifest>` | `File-audit validation PASSED` |
| `orphan-check.mjs` | `Files with zero internal importers: 3` — only `src/main.ts`, `MeshWorkerEntry.ts`, `WorldgenWorkerEntry.ts` (the three real entry points) |
| `verify-mcp-addons.mjs` | `PREFLIGHT OK` |
| `audit-inventory.mjs` | writes `…/inventory/pre-migration-inventory.json` (a **report generator**, not a gate) |

So they were meaningful, not decorative — exactly the audit's point.

## Requirements

### Every shipped verification script is npm-exposed

Added to `package.json`:

| npm command | Target | Kind |
|---|---|---|
| `verify:file-audit` | `node scripts/validate-file-audit.mjs openspec/hardening/2026-08-23-exhaustive-repository-certification/file-audit-manifest.json` | gate (blocking) |
| `gen:file-audit` | `node scripts/gen-file-audit.mjs` | report generator |
| `verify:orphans` | `node scripts/orphan-check.mjs` | gate (blocking) |
| `verify:mcp` | `node scripts/verify-mcp-addons.mjs` | gate (blocking) |
| `verify:inventory` | `node scripts/audit-inventory.mjs` | report generator |
| `evidence:archive` | `node scripts/build-evidence-archive.mjs` | report generator |
| `verify:all` | `node scripts/verify-all.mjs` | aggregate |

`verify:file-audit` points at the repository artifact (the reviewed manifest),
not at a bare script, per the requirement that a gate reading an artifact must
name it. The distinction between gates and report generators is explicit in the
`gen:`/`evidence:` prefixes and documented in the catalogue.

### Repository-invariant gates block CI

`.github/workflows/ci.yml`'s `gate` job now runs, immediately after
`validate-state` and **before** the heavy suites:

```yaml
- name: Verify dependency tree matches the lockfile
  run: npm run verify:deps
- name: File-audit manifest integrity
  run: npm run verify:file-audit
- name: Unreferenced-source guard
  run: npm run verify:orphans
- name: Add-on security preflight
  run: npm run verify:mcp
```

All four pass on this candidate (measured individually, and as part of
`verify:all`). Step names identify the invariant, as the spec requires.

### Failure proof for each newly wired gate (synthetic violation)

The spec requires each wired gate to be demonstrated to **fail**, not just to
pass. Two were proven inside this session against real repository state:

| Gate | Synthetic violation | Observed |
|---|---|---|
| `file-audit` | Added an untracked file (`scripts/verify-all.mjs`) not yet in the manifest | `File-audit validation FAILED (1): - tracked file missing from manifest: scripts/verify-all.mjs`, and `verify-all` reported `FAIL file-audit (exit 1)` — **real, not simulated** |
| `file-audit` (again, later) | Added `tests/unit/VerificationGateWiring.test.ts` without a manifest row | The **full `npm test` suite turned red** on `ValidateFileAuditScript.test.ts` with `tracked file missing from manifest: tests/unit/VerificationGateWiring.test.ts` — so the un-wired-then-wired gate genuinely catches a real omission |

The remaining guards' failure paths are exercised by their own pre-existing unit
suites (`ValidateFileAuditScript.test.ts` asserts both acceptance and rejection of
a pending/invalid row), and the aggregate's propagation of a failing gate's exit
code is proven by the new test that spawns a real child gate which exits 7 and
observes `7` (not a normalised `1`).

### A single aggregate verification command

`scripts/verify-all.mjs` (node builtins only, no new dependency) runs, in this
documented order:

```
dependency-tree → program-state → typecheck → lint → build → release-bundle
 → file-audit → unreferenced-source → addon-preflight → visual-goldens
 → unit → coverage → browser
```

Ordering rationale, as implemented:

1. `dependency-tree` first, because every later gate's meaning depends on the
   installed toolchain matching the lockfile (change 299).
2. Cheap static checks next, so an obvious error costs seconds.
3. `build` before `release-bundle`, which inspects `dist/`.
4. Cheap repository-invariant gates before the heavy suites, so an invariant
   break is reported in seconds instead of after a ~36-minute browser run.
5. `unit → coverage → browser` last, matching the CI job split.

Contract properties, all proven:

- **Stops at the first failure** and exits with **that gate's own code** (proven
  live: `FAIL file-audit (exit 1)`).
- **Fails loudly** (exit 2) when `package.json` is missing a referenced script, so
  a renamed script cannot silently no-op a gate (`assertDeclaredScripts`).
- **Names the failing gate** and prints `FAIL <name> (exit <code>) after Ns —
  <invariant>`.
- **Prints the ordered gate list** at start and with `--list`.
- `--only=<gate>` / `--from=<gate>` exist for targeted re-runs and are documented
  as non-default; `--only` + `--from` together is rejected with exit 2.
- On a clean tree it reports `ALL GATES PASS (N gate(s))` and exits 0.

The aggregate includes `verify:deps` (299) and `verify:visual-goldens` (300), so
neither is orphaned by this change.

Two implementation details worth recording because they were real failures:

- A shell-less `spawn('npm', …)` **does not work on Windows** (`npm` is
  `npm.cmd`; Node >= 20 throws `EINVAL` for a `.cmd` without a shell). The script
  therefore spawns through the shell on Windows only. Every token comes from the
  literal `GATES` table, so no untrusted input reaches the shell.
- The first draft used a `shell: false` promise that could resolve twice on
  `error` + `close`; it now settles exactly once.

### The gate catalogue is documented

`ONBOARDING.md` §7 publishes the catalogue: all 13 blocking gates in order with
the invariant each protects, the three report generators, the aggregate and its
selectors, and which gates run in which CI job. `AGENTS.md` "Baseline
verification" now references `verify:all` while keeping the individual commands
authoritative for change evidence.

## Commands (final, `301` candidate tree)

| Command | Result |
|---|---|
| `npm run verify:deps` | **PASS** — 171 packages verified |
| `npm run verify:file-audit` | **PASS** — 3078 rows |
| `npm run verify:orphans` | **PASS** — 3 documented entry points only |
| `npm run verify:mcp` | **PASS** — `PREFLIGHT OK` |
| `npm run verify:visual-goldens` | **PASS** — fresh, 2 sets, one acknowledged |
| `node scripts/verify-all.mjs --list` | **PASS** — 13 gates in documented order |
| `node scripts/verify-all.mjs --only=<gate>` | **PASS** for each fast gate; `FAIL file-audit (exit 1)` proven on a real omission |
| `npm run validate-state` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS — 0 errors / 85 warnings** (unchanged) |
| `npm test` | **PASS — 481 files, 5757 passed + 1 skipped, exit 0** |
| `npm run test:coverage` | **PASS — 91.82 / 88.61 / 94.65 / 93.15** vs 91/88/94/93 |
| `npm run build` | **PASS — 2.55 s** |
| `node scripts/check-release-bundle.mjs` | **PASS — 4 assets checked; no E2E hook found** |
| `npm run test:e2e` | **PASS — 137/137, exit 0**, including the 60-cell visual matrix |
| `node scripts/validate-file-audit.mjs <manifest>` | **PASSED — 3078 rows** |

## Edge/adversarial validation

- [x] Unknown gate name → exit 2 naming the gate.
- [x] `--only` and `--from` together → exit 2.
- [x] Undeclared package script → exit 2 naming `gate -> script`.
- [x] Failing gate → aggregate exits with the gate's own code (7 propagated as 7;
      1 propagated as 1).
- [x] A gate that cannot read its artifact exits non-zero rather than passing
      (existing gate behaviour, exercised by the file-audit suite).
- [x] The aggregate does not duplicate work: it invokes the npm scripts, it does
      not re-implement any gate.
- [x] Each newly wired CI gate completes in well under 60 s (measured: file-audit
      0.6 s, orphans ~0.3 s, mcp ~0.2 s, deps ~0.3 s).

## Migration/compatibility

- [x] No gate logic edited — every script is invoked unchanged.
- [x] No product code, dependency, or threshold changed.
- [x] `audit-inventory` writes an artifact by design; the doc labels it a report
      generator, not a blocking gate. Its stray output directory created during
      manual probing was removed (`git status` clean apart from this change).
- [x] `npm test` semantics are unchanged; the new test file runs inside it.

## Performance/resource validation

- [x] The three fast guards add under 2 s to the CI `gate` job (measured
      individually: 0.6 s / 0.3 s / 0.2 s plus 0.3 s for `verify:deps`).
- [x] `verify-all` adds no measurable overhead of its own.

## Regression / debt status

- No regression introduced.
- Remaining audit findings keep their own changes: 302 (multiplayer performance
  gate), 303 (`Renderer.ts` coverage), 304 (modal focus/keyboard accessibility).
- `258-real-world-runtime-performance-fps-recovery` remains **BLOCKED** at
  40/100. No headed FPS work, no GPU evidence, no 258 status change.

## Advancement Exception

Not required: every task is complete, every MUST/SHALL requirement in
`specs/gate-automation/spec.md` has passing evidence above, all mandatory tests
pass, and no unresolved data-loss, corruption, determinism, compatibility,
security, or regression blocker remains.

## Final decision

**VERIFIED.** The gates the repository already shipped are now exposed as named
commands, enforced in CI, and reproducible through one aggregate command that
stops at the first failure and propagates its exit code — with the failure path
demonstrated against a real repository omission rather than asserted.
