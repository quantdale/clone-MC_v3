# Proposal: 299-toolchain-dependency-reproducibility

## Problem

The repository's verification results depend on which dependency versions are
actually installed, but nothing enforces that the installed tree matches the
lockfile, and the two coverage/test runners are the most sensitive of them.

At the published tip the local `node_modules` is **out of sync with
`package-lock.json`**: `vitest` and `@vitest/coverage-v8` are locked at
**4.1.11** but installed at **3.2.7**. The repository's own coverage thresholds
(`statements 91 / branches 88 / functions 94 / lines 93`) were *calibrated against
Vitest 4.1.11* and the config comments state outright that the **branch counters
are not comparable across Vitest 3 and Vitest 4** because Vitest 4 changed V8
branch remapping and dropped Vitest 3's default exclusions.

Consequences:

* `npm run test:coverage` cannot be trusted locally — it runs under a different
  provider version than the one the thresholds were pinned to, so a green or red
  result on this host does not predict CI.
* `npm test` itself runs under Vitest 3 locally and Vitest 4 in CI, so the
  "same suite" is not the same suite.
* Nothing in the repository detects or reports the drift. `npm test` just runs.

There is also **no `packageManager` field** in `package.json` and no
`preinstall` guard, so `npm ci` (what CI uses) is never demanded of a local
contributor, and there is nothing that fails fast when the tree is stale.

This matters because the whole program's quality gate — including the coverage
no-regression thresholds that the 2026-09-18 audit (AUDIT-009) explicitly
recalibrated for Vitest 4 — is only meaningful when every participant runs the
locked toolchain.

## Inspection findings (base `2ecf781`)

- `package.json` has no `packageManager` field; `engines.node` is `>=20`; the
  local Node is `v24.3.0` while every CI workflow pins `node-version: 20`.
- Installed-vs-locked drift across every declared dependency:

  | Package | Declared | Locked | Installed | |
  |---|---|---|---|---|
  | `vitest` | `^4.1.11` | 4.1.11 | **3.2.7** | **DRIFT** |
  | `@vitest/coverage-v8` | `^4.1.11` | 4.1.11 | **3.2.7** | **DRIFT** |
  | three | `^0.169.0` | 0.169.0 | 0.169.0 | ok |
  | vite | `^6.4.3` | 6.4.3 | 6.4.3 | ok |
  | typescript | `^5.6.0` | 5.9.3 | 5.9.3 | ok |
  | eslint | `^9.13.0` | 9.39.5 | 9.39.5 | ok |
  | @playwright/test | `^1.62.1` | 1.62.1 | 1.62.1 | ok |

- The running test runner self-reports the mismatch: `npm test` prints
  `RUN v3.2.7 D:/Documents/tryPython/tryMC_v3` while the lockfile and
  `package.json` declare 4.1.11.
- `vitest.config.ts` documents that coverage thresholds are provider-specific:
  *"Vitest 4.1.11 changed V8 branch remapping and no longer carries Vitest 3's
  default test/config exclusions … the branch counters are therefore not
  comparable; 88 is the measured Vitest 4 floor."*
- There is no `preinstall` script, no `prepare` hook, and no CI step that
  verifies the installed tree matches the lockfile before running the gates.
  `npm test` → `vitest run` runs unconditionally on whatever is installed.

## Goals

1. Make the installed dependency tree verifiably equal to the lockfile whenever a
   gate runs, on any platform.
2. Pin the package manager so `npm ci` is the canonical, reproducible install and
   a stale `node_modules` fails fast rather than silently skewing results.
3. Preserve the meaning of the coverage thresholds by ensuring they are only ever
   evaluated by the provider version they were calibrated for.

## Non-goals

- No dependency upgrades or downgrades (the lockfile stays authoritative).
- No threshold changes in `vitest.config.ts`.
- No change to CI's use of `npm ci` (that is already correct).
- No monorepo/pnpm/workspace restructuring.
- No change to the runtime dependency set (`three` stays the only production dep).

## Preconditions

- Change 298 restored a green local unit gate (recommended ordering: 298 then
  299). 299 is independently shippable but its own evidence is easier to read on
  a green baseline.

## Dependencies

- **298** (recommended predecessor): a red unit gate masks whether a toolchain
  change helped or hurt.
- **301** wires additional scripts into CI; 299 and 301 are complementary and
  may proceed in either order.

## Proposed change

### 1. Pin the package manager

Add to `package.json`:

```json
"packageManager": "npm@<exact version matching the CI runner>"
```

The value MUST be the exact npm version that ships with the CI Node 20 image (or
the version verified to produce the current lockfile), so Corepack reproduces the
CI install exactly.

### 2. Add a failing-fast dependency-tree guard

Add a small Node script that, without mutating anything, checks that the
resolved installed versions match the lockfile and exits non-zero with an
actionable message when they do not. It MUST NOT run `npm install`/`npm ci`
itself (that would recurse); it MUST only detect and report.

`scripts/check-install.mjs` compares each lockfile entry under
`packages["node_modules/<name>"]` against the on-disk installed version for every
direct dependency (and, if cheap, the full transitive closure), and prints a
table of drifts with the exact remediation command:

```
Dependency tree does not match package-lock.json:
  vitest                    installed 3.2.7  locked 4.1.11
  @vitest/coverage-v8        installed 3.2.7  locked 4.1.11
Run: npm ci
```

It MUST exit 1 on any drift and 0 when the tree matches or is fresh.

### 2a. SPEC CORRECTION (measured 2026-09-30): the guard MUST NOT live in `preinstall`

The original design put the guard in npm's `preinstall` lifecycle so that
`npm install` on a drifted tree would abort before mutating it. **Measurement
proves that premise false on the npm versions in use, so the requirement is
amended here before the divergence is shipped.**

Probe (minimal fixture whose only script is a `preinstall` that lists
`node_modules`):

```
$ cmd /c "npm install"          # node_modules absent before the command
> probe@1.0.0 preinstall
PREINSTALL sees node_modules entries = ABSENT

$ mkdir node_modules && cmd /c "npm install"    # node_modules present (1 entry)
> probe@1.0.0 preinstall
PREINSTALL sees node_modules entries = 1        # still the pre-existing tree
```

`npm install` removes the existing `node_modules` tree **before** running the
root `preinstall` hook (observed with npm 11.4.2 / Node 24.3.0). A `preinstall`
guard therefore cannot observe the pre-install state at all.

Measured end-to-end on a synthetic drifted tree (`vitest` 3.2.7 on disk against a
4.1.11 lockfile) with the guard wired as `preinstall`:

```
$ cd <drifted fixture> && npm install
> voxel-game@1.0.0 preinstall
> node scripts/check-install.mjs
Dependency tree matches package-lock.json (171 packages verified).   <-- FALSE
added 227 packages, changed 1 package, and audited 229 packages
```

The guard reported a match and the install mutated the tree. Wiring the guard to
`preinstall` would therefore convert a real drift into a **false-green** message
— strictly worse than no guard, because it would manufacture evidence that the
tree matched.

Amended requirements:

- The guard runs **on demand** as the documented `verify:deps` gate, positioned
  before every gate whose result depends on the toolchain version, and becomes
  the first step of the aggregate command added by change 301.
- The guard MUST NOT be wired to `preinstall`. A lifecycle hook that cannot
  observe the pre-install tree cannot fail it, so wiring it there is explicitly
  forbidden.
- The documented install contract is: **run `npm ci`** (never `npm install`) so
  the tree is constructed at the locked versions, then run `verify:deps` to prove
  it. A contract-violating `npm install` on a drifted tree is *detected* by
  `verify:deps`, not *prevented* by a lifecycle hook.
- `npm ci` deletes `node_modules` and installs exactly the lockfile, so the
  reproducible path is unaffected by this correction.

The `preinstall` scenario in `specs/toolchain-reproducibility/spec.md` is amended
to the on-demand gate scenario accordingly.

### 3. Add an explicit, documented verify path for the gates

Add a `verify:deps` script (`node scripts/check-install.mjs`) that agents and CI
can run to assert the tree before trusting a gate result, and reference it in
`AGENTS.md` under "Baseline verification" so the mandatory gate includes it.

### 4. Document the Node version contract

`engines.node` is `>=20` but CI pins Node 20 and the local host runs Node 24.
Add an `engines` note and a short "Toolchain" section to `ONBOARDING.md`
recording: Node 20 (CI-canonical), `npm ci` as the only supported install, and
that coverage thresholds are provider-specific to the locked Vitest version.

## Compatibility and migration

- No product code, data, or API change.
- The guard reads only and is invoked on demand (`verify:deps`), never as a
  lifecycle hook, because npm removes `node_modules` before `preinstall` runs
  (see 2a). It treats an absent tree as *fresh* and passes, so a first `npm ci`
  is never impeded.
- CI is unaffected: it runs `npm ci`, which produces a matching tree, and the
  guard then exits 0 when invoked.

## Risks

- **False green if wired as a lifecycle hook.** Measured and removed: npm clears
  `node_modules` before `preinstall`, so a hook-based guard always reports a
  match. The guard is an on-demand gate instead.
- **Guard false positives.** A too-strict guard (e.g. demanding exact equality
  on caret-ranged optional/platform packages) would fail valid trees.
  Mitigation: compare installed versions to the **lockfile's** resolved version
  (not the caret range), and treat platform-specific optional dependencies
  (e.g. `@rollup/rollup-win32-x64-msvc` on non-Windows) as satisfied when absent
  on an incompatible platform.
- **A drifted tree is no longer *prevented*, only *detected*.** Accepted: the
  repository cannot prevent `npm install` (unlike `npm ci`) without a lifecycle
  hook that provably cannot observe drift. Detection is placed where it matters —
  before any gate whose result depends on the toolchain — and is enforced in CI
  by change 301.

## Rollback strategy

Remove the `preinstall`/`verify:deps` scripts, the `packageManager` field, and
`scripts/check-install.mjs`. None of these affect the product build or runtime.

## Definition of Done

- `package.json` declares an exact `packageManager`.
- `npm run verify:deps` exits 0 on a freshly `npm ci`-installed tree.
- `npm run verify:deps` exits 1 with a remediation message when `vitest` is
  3.2.7 on disk against a 4.1.11 lockfile.
- `npm install` on a drifted tree is proven **not** to abort (measured), and the
  spec records that the guard is therefore an on-demand gate rather than a
  lifecycle hook; the false-green hazard is documented in 2a.
- `npm ci` on a clean checkout succeeds and the guard passes afterwards.
- CI `gate` job still passes end to end (the guard exits 0 after `npm ci`).
- `ONBOARDING.md` documents the Node version, `npm ci`, and provider-specific
  coverage thresholds.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run validate-state`, `npm run test:e2e` all PASS.

## Advancement gate

All mandatory gates PASS on the exact candidate SHA in CI. Completion target
100%; below 90% advancement is forbidden. The drift-detection behaviour (exit 1
on drift, exit 0 on match, skip on absent) MUST be proven by tests or an
explicit recorded command trace, never asserted without evidence.
