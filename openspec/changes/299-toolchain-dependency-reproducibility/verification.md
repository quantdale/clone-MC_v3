# Verification: 299-toolchain-dependency-reproducibility

Status: NOT VERIFIED
Completion: 0% (T1/T2 are pre-implementation evidence only; T3–T14 are open)
Advancement allowed: false

Authored by an audit campaign that is **forbidden from implementing code**. T1/T2
record the measured baseline the implementing agent must reproduce. No passing
evidence is pre-filled.

## Pre-implementation evidence captured at base `2ecf781`

### E1 — Installed tree does not match the lockfile

| Package | Declared | Locked | Installed | |
|---|---|---|---|---|
| `vitest` | `^4.1.11` | 4.1.11 | **3.2.7** | **DRIFT** |
| `@vitest/coverage-v8` | `^4.1.11` | 4.1.11 | **3.2.7** | **DRIFT** |
| `three` | `^0.169.0` | 0.169.0 | 0.169.0 | ok |
| `vite` | `^6.4.3` | 6.4.3 | 6.4.3 | ok |
| `typescript` | `^5.6.0` | 5.9.3 | 5.9.3 | ok |
| `eslint` | `^9.13.0` | 9.39.5 | 9.39.5 | ok |
| `@eslint/js` | `^9.13.0` | 9.39.5 | 9.39.5 | ok |
| `typescript-eslint` | `^8.11.0` | 8.66.0 | 8.66.0 | ok |
| `@playwright/test` | `^1.62.1` | 1.62.1 | 1.62.1 | ok |
| `@types/node` | `^26.1.2` | 26.1.2 | 26.1.2 | ok |
| `@types/pngjs` | `^6.0.5` | 6.0.5 | 6.0.5 | ok |
| `@types/three` | `^0.169.0` | 0.169.0 | 0.169.0 | ok |
| `pngjs` | `^7.0.0` | 7.0.0 | 7.0.0 | ok |
| `@rollup/rollup-win32-x64-msvc` | `4.62.4` | 4.62.4 | 4.62.4 | ok |

### E2 — The runner announces the drift

```
$ npm test
 RUN  v3.2.7 D:/Documents/tryPython/tryMC_v3
```

`package.json` declares `vitest: ^4.1.11` and `package-lock.json` resolves
`node_modules/vitest` to `4.1.11`.

### E3 — No enforcement exists

```
$ node -e "console.log(require('./package.json').packageManager ?? 'ABSENT')"
ABSENT
```

`package.json` scripts: `dev, build, preview, test, test:watch, test:coverage,
test:e2e, test:perf, test:e2e:ui, lint, typecheck, validate-state`. There is no
`preinstall`, no `prepare`, and no `verify:deps`. No CI step asserts the tree
matches the lockfile (CI runs `npm ci`, which is already correct).

### E4 — Why the two drifted packages are the expensive ones

`vitest.config.ts` (verbatim):

```
// 2026-09-18 audit: Vitest 4.1.11 changed V8 branch remapping and no longer carries
// Vitest 3's default test/config exclusions. … The first clean Vitest 4 product baseline is
// 91.79/88.69/94.44/93.06 (statements/branches/functions/lines), versus 83.39/91.11/
// 95.80/83.39 under Vitest 3's all-file model on the equivalent tree. The branch
// counters are therefore not comparable; 88 is the measured Vitest 4 floor, with no
// threshold relaxed for statements, functions, or lines.
thresholds: { statements: 91, branches: 88, functions: 94, lines: 93 }
```

Consequence recorded honestly: **`npm run test:coverage` was deliberately not run
as audit evidence on this host**, because the installed provider (3.2.7) is not
the provider the thresholds were calibrated against (4.1.11). Any coverage figure
produced locally before T9 is not repository evidence.

### E5 — Node version spread

| Location | Node |
|---|---|
| `package.json` `engines.node` | `>=20` |
| `.github/workflows/ci.yml` (both jobs) | `20` |
| `.github/workflows/seed-visual-goldens.yml` | `20` |
| Authoring host | `v24.3.0` |

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Package manager declared exactly | E3 shows `packageManager` absent. T3 unimplemented. | NOT VERIFIED |
| Read-only dependency-tree check available | E1/E3 show no such check exists. T4/T5 unimplemented. | NOT VERIFIED |
| Check runs as an install-time guard | E3 shows no `preinstall`. T6/T7 unimplemented. | NOT VERIFIED |
| Gates documented as depending on a matching tree | `AGENTS.md` "Baseline verification" lists `typecheck/lint/test/build/test:e2e` with no dependency check and no provider caveat. T10 unimplemented. | NOT VERIFIED |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `node -e "…packageManager ?? 'ABSENT'"` | `ABSENT` | E3 |
| installed-vs-locked dependency scan | 2 drifts | E1 |
| `npm test` | FAIL (2 unit tests) | Recorded under change 298; the runner banner `RUN v3.2.7` is the 299 evidence |
| `npm run typecheck` | PASS | see 298 verification E1 |
| `npm run lint` | PASS (0 errors / 85 warnings) | see 298 verification E1 |
| `npm run validate-state` | PASSED | see 298 verification E1 |
| `npm run test:coverage` | **NOT RUN (deliberately)** | E4 — installed provider is not the calibrated provider |
| `npm run build` | NOT RUN | must PASS at T12 |
| `npm run test:e2e` | NOT RUN | must PASS at T12 |
| `npm ci` | NOT RUN | must PASS at T7/T8 |

## Edge/adversarial validation (required at T5/T7)

- [ ] Matching tree → exit 0 with a verified-package count.
- [ ] Drifted tree → exit 1 with the exact drift table and `npm ci` remediation.
- [ ] Fresh tree (no `node_modules`) → exit 0, "fresh" message, so `npm ci` is
      never blocked.
- [ ] Platform-inapplicable optional dependency absent → exit 0.
- [ ] Installed `package.json` unreadable → exit 1, `<unreadable>`, never
      silently skipped.
- [ ] Malformed `package-lock.json` → exit 2, never "no drift".
- [ ] `npm install` on a drifted tree aborts with NO package directory mutated.
- [ ] `npm ci` on a fresh copy completes.
- [ ] `git status` unchanged before/after every check invocation.

## Migration/compatibility validation

- [ ] `package-lock.json` byte-identical before and after the change.
- [ ] `vitest.config.ts` thresholds unmodified.
- [ ] No file under `src/` modified.
- [ ] CI `gate` job passes end to end on the candidate SHA.

## Performance/resource validation

- [ ] `verify:deps` completes in well under 5 s.
- [ ] Each installed `package.json` is read at most once.
- [ ] The script loads no third-party module (node builtins only) so it can run
      before any install.

## Regressions

- None introduced: `package.json`, `ONBOARDING.md`, `AGENTS.md`, two new files.
- Known behavioural consequence to record, not a regression: contributors on a
  drifted tree can no longer `npm install` until they run `npm ci`.
- Related open items tracked elsewhere: 298 (local gate red), 300 (visual
  column red), 301 (un-wired gate scripts), 302 (never-executed canonical
  multiplayer load test).

## Incomplete tasks

T3–T14 (12 of 14 tasks). Completion **0%** by checkbox count.

## Advancement Exception

Not applicable: completion is below 90%; advancement is forbidden.

## Final decision

**NOT VERIFIED.** The installed dependency tree does not match `package-lock.json`
(`vitest` and `@vitest/coverage-v8` at 3.2.7 against a 4.1.11 lockfile), no
`packageManager` pin exists, and nothing detects or reports the drift — which is
why the coverage thresholds calibrated for Vitest 4 cannot be validated on the
authoring host. T3–T14 must be implemented, and T9's coverage measurement on the
locked toolchain must be recorded before this change may be marked VERIFIED.
