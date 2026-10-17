# Verification: 299-toolchain-dependency-reproducibility

Status: VERIFIED
Completion: 100% (14/14 tasks)
Advancement allowed: true
Session start head: `29d088d70300805b4cc18cd11e650c818250ac8e` (origin/main)
Published head: recorded in `openspec/PROGRAM_STATE.json` after publication

## Summary

Every gate result is now attributable to the locked toolchain. `package.json`
declares an exact `packageManager` (`npm@10.8.2`, the npm bundled with the
CI-canonical Node 20 image) and exposes a read-only dependency-tree check as
`npm run verify:deps`, which is now the **first** step of the mandatory baseline
sequence in `AGENTS.md` and `ONBOARDING.md`. No dependency version, coverage
threshold, product file, or lockfile row changed.

The `preinstall` half of the original audit design was **measured to be wrong and
corrected in the spec before shipping** — see "Spec correction" below.

## T1 — Drift baseline (measured, base `29d088d`)

The audit recorded this at `2ecf781`; at this session's start the drift was
already gone because change 298's session had rebuilt the tree with `npm ci` (see
the 298 dossier). The evidence below therefore records both the audit's finding
and the state this session inherited.

Audit-era drift (finding F-002, base `2ecf781`):

| Package | Declared | Locked | Installed | |
|---|---|---|---|---|
| `vitest` | `^4.1.11` | 4.1.11 | **3.2.7** | **DRIFT** |
| `@vitest/coverage-v8` | `^4.1.11` | 4.1.11 | **3.2.7** | **DRIFT** |
| three | `^0.169.0` | 0.169.0 | 0.169.0 | ok |
| vite | `^6.4.3` | 6.4.3 | 6.4.3 | ok |
| typescript | `^5.6.0` | 5.9.3 | 5.9.3 | ok |
| eslint | `^9.13.0` | 9.39.5 | 9.39.5 | ok |
| @playwright/test | `^1.62.1` | 1.62.1 | 1.62.1 | ok |

Runner banner at the audit base: `RUN v3.2.7` while `package-lock.json` and
`package.json` declare `4.1.11`. `packageManager` was **ABSENT**.

CI pins `node-version: 20` in all three workflow jobs
(`ci.yml` gate, `ci.yml` e2e, `seed-visual-goldens.yml`).

## T2 — Why the drift mattered

`vitest.config.ts` documents the coupling verbatim:

> Vitest 4.1.11 changed V8 branch remapping and no longer carries Vitest 3's
> default test/config exclusions. […] The first clean Vitest 4 product baseline is
> 91.79/88.69/94.44/93.06 (statements/branches/functions/lines), versus
> 83.39/91.11/95.80/83.39 under Vitest 3's all-file model on the equivalent tree.
> The branch counters are therefore not comparable; 88 is the measured Vitest 4
> floor…

with `thresholds: { statements: 91, branches: 88, functions: 94, lines: 93 }`.
A local `npm run test:coverage` under Vitest 3.2.7 therefore measured a different
branch metric than the one the `branches: 88` floor was calibrated against, so
the audit deliberately did not record a coverage result.

## T3 — Exact package manager pin

`package.json`:

```json
"packageManager": "npm@10.8.2",
"engines": { "node": ">=20", "npm": ">=10" }
```

`npm@10.8.2` is the npm bundled with every Node 20 release (resolved from
`https://nodejs.org/dist/index.json`; every `v20.19.x`/`v20.20.x` row reports
`"npm":"10.8.2"`). It is the version that produces the current lockfile, has no
range operator, and matches what CI's `node-version: 20` uses.

## T4 — `scripts/check-install.mjs`

Node-builtins-only ESM script, strictly read-only (it never writes, creates, or
deletes a file, and never spawns a package manager). Behaviour:

| Situation | Exit | Output |
|---|---|---|
| Installed tree matches the lockfile | 0 | `Dependency tree matches package-lock.json (171 packages verified).` |
| `node_modules` absent or empty | 0 | `Fresh tree at <path> (node_modules absent or empty); nothing to verify before install.` |
| One or more drifts | 1 | `Dependency tree does not match package-lock.json:` + one row per package + `Run: npm ci` |
| Installed `package.json` unreadable | 1 | drift row `installed <unreadable>` |
| Platform-inapplicable optional dependency absent | 0 | skipped, not drift |
| `package-lock.json` missing | 2 | `Cannot read package-lock.json at <path>` |
| `package-lock.json` malformed / no `packages` map | 2 | `Malformed package-lock.json: <message>` / refusal to report "no drift" |

Scope: the direct `dependencies` + `devDependencies` + `optionalDependencies`
set, **plus** the transitive closure recorded under `packages["node_modules/…"]`
(nested copies are skipped). The transitive pass is deliberate: the measured
drift was in `vitest`, and closure scanning also catches a partial reify.

Measured against the real repository tree:

```
$ npm run verify:deps
Dependency tree matches package-lock.json (171 packages verified).
```

## Spec correction — the `preinstall` requirement was measurably wrong

The audit-authored package required the check to be wired to npm's `preinstall`
lifecycle so that `npm install` on a drifted tree "MUST abort before any package
is added, removed, or updated". **Measurement disproves that premise**, so per
`AGENTS.md` the proposal, design and normative spec were amended **first**, before
the divergence was allowed to ship.

Probe (minimal fixture whose only script is a `preinstall` that lists
`node_modules`; npm 11.4.2 / Node 24.3.0):

```
$ cmd /c "npm install"                     # node_modules absent beforehand
> probe@1.0.0 preinstall
PREINSTALL sees node_modules entries = ABSENT

$ mkdir node_modules && cmd /c "npm install"   # node_modules present beforehand
> probe@1.0.0 preinstall
PREINSTALL sees node_modules entries = 1       # still the pre-existing tree
```

npm removes the existing `node_modules` tree **before** running the root
`preinstall` hook, so the hook can never observe the pre-install state.

End-to-end on a synthetic drifted tree (`vitest` 3.2.7 on disk, 4.1.11 locked)
with the guard wired as `preinstall`:

```
$ cd <drifted fixture> && npm install
> voxel-game@1.0.0 preinstall
> node scripts/check-install.mjs
Dependency tree matches package-lock.json (171 packages verified).   <-- FALSE GREEN
added 227 packages, changed 1 package, and audited 229 packages       <-- mutated
```

A hook-hosted guard would therefore manufacture false evidence that a drifted
tree matched — strictly worse than no guard. Consequences, recorded in the
amended `proposal.md` §2a, the design's "Correction: no `preinstall` wiring", and
the spec's new "on-demand pre-gate, never as a lifecycle hook" requirement:

- `package.json` deliberately contains **no** `preinstall` entry. The test suite
  asserts `pkg.scripts.preinstall` is `undefined`.
- The guard's authority is *detection before the gates*, not *prevention during
  install*. `npm ci` remains the only documented install; `verify:deps` proves the
  resulting tree.
- `npm ci` removes `node_modules` and installs exactly the lockfile, so the
  reproducible path is unaffected.

## T5 — `tests/unit/ToolchainReproducibility.test.ts` (10 tests, all pass)

Synthetic temp-directory fixtures drive the real script through `execFileSync`:

1. matching tree → exit 0 + `N packages verified`
2. drift → exit 1, exact `name installed X locked Y` table, `Run: npm ci` appears
   exactly once, no success line, matching packages not reported
3. fresh tree → exit 0, no drift table
4. platform-inapplicable optional dependency absent → exit 0
5. unreadable installed manifest → exit 1 with `installed <unreadable>`
6. malformed lockfile → exit 2
7. missing lockfile → exit 2
8. read-only property: the recursive file listing with per-file sizes is
   byte-identical before and after the run across all six previous cases
9. self-application: the guard exits 0 against the real repository tree
10. declarations: exact `packageManager`, `verify:deps` wired, `preinstall`
    absent

## T7 — Lifecycle behaviour proven in throwaway copies

All work happened under `$TEMP`, never in the primary working tree. The drifted
fixture was built by copying `package.json`, `package-lock.json` and
`scripts/check-install.mjs` and planting `node_modules/vitest/package.json` at
`3.2.7`:

```
$ node scripts/check-install.mjs          # correct detection
Dependency tree does not match package-lock.json:
  … 12 further direct packages installed <unreadable> …
  vitest               installed 3.2.7  locked 4.1.11
Run: npm ci
EXIT=1

$ npm ci                                   # rebuilds at locked versions
EXIT=0
$ node scripts/check-install.mjs
Dependency tree matches package-lock.json (171 packages verified).
EXIT=0
$ node -e "console.log(require('./node_modules/vitest/package.json').version)"
4.1.11
```

The `preinstall` false-green above was measured in the same class of throwaway
copy. All throwaway copies were removed; `git worktree list` shows no leftover
worktree from this change.

## T8 — CI compatibility

The guard is not part of the npm lifecycle, so CI's `npm ci` is unaffected. CI
runs `npm ci`, which yields a matching tree, and `npm run verify:deps` exits 0 on
it (measured locally on the identical lockfile). The `gate` job's steps
(`validate-state`, `typecheck`, `lint`, `build`, `check-release-bundle`, `test`,
`test:coverage`, and both `npm audit`s) all pass locally on this candidate (see
the command table). Wiring `verify:deps` into the CI job itself is change 301's
scope and is not claimed here.

## T9 — Coverage re-established on the locked toolchain

Run after `npm ci`, on **vitest 4.1.11**
(`require('./node_modules/vitest/package.json').version === '4.1.11'`):

```
Statements : 91.82% ( 26299/28641 )
Branches   : 88.61% ( 16209/18291 )
Functions  : 94.65% (  4637/4899 )
Lines      : 93.15% ( 24340/26128 )
EXIT=0
```

Against the pinned thresholds`91 / 88 / 94 / 93` every figure passes, so no
finding is raised and `vitest.config.ts` was **not** edited. This is the first
locally-attributable coverage measurement the repository has had: the provider
version now matches the one the thresholds were calibrated for.

## Commands (final, `299` candidate tree)

| Command | Result |
|---|---|
| `npm run verify:deps` | **PASS** — `171 packages verified`, exit 0 |
| `npm run validate-state` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS — 0 errors / 85 warnings** (unchanged set) |
| `npm test` | **PASS — 478 files, 5735 passed + 1 skipped, exit 0** |
| `npm run test:coverage` | **PASS — 91.82 / 88.61 / 94.65 / 93.15** vs 91/88/94/93 |
| `npm run build` | **PASS — 266 modules** |
| `node scripts/check-release-bundle.mjs` | **PASS — `4 assets checked; no E2E hook found`** |
| `npm run test:e2e` | **PASS — 137/137, exit 0**, including the full 60-cell visual matrix |
| `node scripts/validate-file-audit.mjs <manifest>` | **PASS — 3072 rows** |

### A note on one non-reproducing E2E failure

A first `npm run test:e2e` invocation was started **concurrently** with
`npm run test:coverage` and `npm run build` on a single worker host. Nine
WebGL/memory specs timed out (`memory-stress` ×4, `performance-baseline`,
`periodic-status-effects` ×2, `persistence` ×2). Those specs are CPU-starved
under concurrent load; on a clean single-purpose re-run the suite is **137/137
with zero failures** (40.5 min), including the 60-cell visual matrix and every
`memory-stress` / `performance-baseline` / `periodic-status-effects` /
`persistence` spec that had timed out under contention. The clean run's result is
the recorded evidence; the contended run is disclosed here so a reviewer can
attribute it correctly rather than treat it as a regression. No
source file involved in those specs changed in this change (the guard and a new
test file are the entire diff outside docs).

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| The package manager is declared exactly | `packageManager: "npm@10.8.2"`, no range; test case 10 asserts the exact shape; `ONBOARDING.md` records the Node/npm contract | VERIFIED |
| A read-only dependency-tree check is available | T4 table + test cases 1–7; case 8 proves the read-only property by before/after listing equality | VERIFIED |
| The check runs as an on-demand pre-gate, never a lifecycle hook | `preinstall` absent (asserted); `verify:deps` present; proposal §2a + design correction + spec requirement record the measured lifecycle probe and the false-green | VERIFIED |
| Gates are declared as depending on a matching tree | `AGENTS.md` "Baseline verification" puts `npm run verify:deps` first and states a drifted-tree result MUST NOT be recorded; `ONBOARDING.md` §4/§6 do the same and add the provider-specific coverage caveat | VERIFIED |

## Edge/adversarial validation

- [x] Matching tree → exit 0 with a verified count.
- [x] Drift → exit 1 with the exact table and `Run: npm ci` exactly once.
- [x] Fresh/absent tree → exit 0 (never blocks a first `npm ci`).
- [x] Platform-inapplicable optional dependency → skipped, not drift.
- [x] Unreadable installed manifest → drift, not silently skipped.
- [x] Missing lockfile → exit 2.
- [x] Malformed lockfile → exit 2, never "no drift".
- [x] Read-only across every case (no file created/modified/deleted).
- [x] No success summary is printed when a drift exists.
- [x] Guard is not wired to any npm lifecycle hook.

## Migration/compatibility validation

- [x] `package-lock.json` contents unchanged (`git diff` shows no version row
      change; only the repo-wide line-ending renormalisation from change 298).
- [x] No dependency version changed (`package.json` ranges untouched; two
      additive fields only).
- [x] `vitest.config.ts` thresholds untouched.
- [x] Nothing under `src/` touched.
- [x] Contributors who previously ran a drifted tree are now detected before any
      gate; the remediation is `npm ci`. This is recorded in verification notes
      and in the spec.

## Performance/resource validation

- [x] `verify:deps` reads one `package.json` per package once (cached) and
      completes in well under a second on the real tree (171 packages) — far
      inside the spec's 5-second bound.
- [x] The script loads no dependency into the process; it reads version strings
      only.
- [x] No production bundle impact (`check-release-bundle.mjs` passes; the script
      lives under `scripts/`).

## Regression / debt status

- No regression introduced. The change is two additive `package.json` fields, one
  new read-only script, one new unit test file, and documentation.
- The audit's remaining findings are unaffected and each keeps its own change:
  300 (visual gate + golden staleness), 301 (verification-script gate wiring —
  which is what will enforce `verify:deps` in CI), 302 (multiplayer performance
  gate), 303 (`Renderer.ts` coverage), 304 (modal focus/keyboard accessibility).
- `258-real-world-runtime-performance-fps-recovery` remains **BLOCKED** at
  40/100. No headed FPS work, no GPU evidence, no 258 status change.

## Advancement Exception

Not required: completion is 100% (14/14), every MUST/SHALL requirement in
`specs/toolchain-reproducibility/spec.md` has passing evidence above, all
mandatory tests pass, and no unresolved data-loss, corruption, determinism,
compatibility, security, or regression blocker remains.

## Final decision

**VERIFIED.** The repository declares an exact package manager, ships a
read-only dependency-tree check as the first documented baseline step, and has
re-established the coverage measurement on the locked provider (91.82/88.61/
94.65/93.15 against 91/88/94/93). The audit's `preinstall` mechanism was
measured to be incapable of its stated purpose and the normative spec was
corrected before shipping, with the measurement recorded here.
