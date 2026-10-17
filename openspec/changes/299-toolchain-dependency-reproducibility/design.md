# Design: 299-toolchain-dependency-reproducibility

## Context/current state

The repository pins its toolchain in `package-lock.json` and installs with
`npm ci` in CI (`.github/workflows/ci.yml`, both jobs). `package.json` declares
`engines.node >= 20` and no `packageManager` field.

Two things are true simultaneously on the authoring host at base `2ecf781`:

* the lockfile and `package.json` declare `vitest` / `@vitest/coverage-v8`
  `^4.1.11` (lockfile resolved: `4.1.11`);
* the installed tree has both at **3.2.7**.

Measured drift across every direct dependency:

```
three                          declared=^0.169.0   locked=0.169.0  installed=0.169.0
vite                           declared=^6.4.3     locked=6.4.3    installed=6.4.3
typescript                     declared=^5.6.0     locked=5.9.3    installed=5.9.3
eslint                         declared=^9.13.0    locked=9.39.5   installed=9.39.5
@playwright/test               declared=^1.62.1    locked=1.62.1   installed=1.62.1
@eslint/js                     declared=^9.13.0    locked=9.39.5   installed=9.39.5
@types/node                    declared=^26.1.2    locked=26.1.2   installed=26.1.2
@types/pngjs                   declared=^6.0.5     locked=6.0.5    installed=6.0.5
@types/three                   declared=^0.169.0   locked=0.169.0  installed=0.169.0
pngjs                          declared=^7.0.0     locked=7.0.0    installed=7.0.0
typescript-eslint              declared=^8.11.0    locked=8.66.0   installed=8.66.0
@rollup/rollup-win32-x64-msvc  declared=4.62.4     locked=4.62.4   installed=4.62.4
vitest                         declared=^4.1.11    locked=4.1.11   installed=3.2.7   <-- DRIFT
@vitest/coverage-v8            declared=^4.1.11    locked=4.1.11   installed=3.2.7   <-- DRIFT
```

The runner announces the mismatch itself:

```
$ npm test
 RUN  v3.2.7 D:/Documents/tryPython/tryMC_v3
```

Why the two drifted packages are the expensive ones:

`vitest.config.ts` pins coverage thresholds and documents the provider coupling
explicitly:

```
// 2026-09-18 audit: Vitest 4.1.11 changed V8 branch remapping and no longer carries
// Vitest 3's default test/config exclusions. … The first clean Vitest 4 product baseline is
// 91.79/88.69/94.44/93.06 (statements/branches/functions/lines), versus 83.39/91.11/
// 95.80/83.39 under Vitest 3's all-file model on the equivalent tree. The branch
// counters are therefore not comparable; 88 is the measured Vitest 4 floor…
thresholds: { statements: 91, branches: 88, functions: 94, lines: 93 }
```

So a local `npm run test:coverage` under Vitest 3 measures a different branch
metric than the one the `branches: 88` floor was calibrated against. A local pass
or fail under 3.2.7 carries no information about the CI gate. In this audit
session that was an active constraint: `test:coverage` could not be run at all as
evidence.

There is no `preinstall`, no `prepare`, and no CI step that asserts the installed
tree matches the lockfile before the gates. `npm test` is simply `vitest run`,
executed against whatever is on disk.

## ## Target state

* `package.json` declares `packageManager` exactly.
* `scripts/check-install.mjs` compares installed versions to lockfile-resolved
  versions, read-only, with an exit code that distinguishes match / drift.
* `verify:deps` exposes the check as the first documented pre-gate step, ahead of
  every toolchain-sensitive gate.
* `ONBOARDING.md` states the Node version, the install command, and the
  provider-specific coverage caveat.

### Correction: no `preinstall` wiring (measured 2026-09-30)

An earlier revision of this design placed the check in npm's `preinstall`
lifecycle so a drifted `npm install` would abort before mutating the tree.
Measurement disproved the premise, so the requirement is corrected here.

npm removes the existing `node_modules` directory **before** running the root
`preinstall` hook. Probe with npm 11.4.2 / Node 24.3.0:

| Fixture state before `npm install` | What `preinstall` observed |
|---|---|
| no `node_modules` | `node_modules` absent |
| pre-existing `node_modules` with 1 entry | 1 entry — i.e. still the pre-existing tree, never a post-reify one, and never a drifted one |

With the guard wired as `preinstall` on a synthetic tree where `vitest` was
3.2.7 on disk and 4.1.11 in the lockfile, the hook printed
`Dependency tree matches package-lock.json (171 packages verified)` and
`npm install` then reported `added 227 packages, changed 1 package`.

A hook-based guard therefore cannot see the pre-install tree, always reports a
match, and manufactures false-green evidence. The check is consequently an
**on-demand pre-gate**, and `package.json` MUST NOT declare a `preinstall`
entry. The install contract is `npm ci`, which constructs the tree at the locked
versions; `verify:deps` then proves it. Prevention is not achievable without a
hook that can observe drift, so the design deliberately chooses detection placed
before the gates.

## Invariants

- The check never mutates `node_modules`, `package.json`, or
  `package-lock.json`.
- A fresh tree (no `node_modules`) passes, so `npm ci` is never blocked.
- Drift is defined against the **lockfile's resolved version**, never a range.
- Platform-inapplicable optional dependencies are not drift.
- The lockfile is never rewritten by this change.

## API and data model

```ts
// scripts/check-install.mjs  (ESM, node >= 20)
type DriftRow = {
  name: string;
  installed: string | '<unreadable>';
  locked: string;
};
type CheckResult =
  | { status: 'fresh' }                                   // no node_modules
  | { status: 'match'; verified: number }
  | { status: 'drift'; drifts: DriftRow[] };

// exit codes: 0 match|fresh, 1 drift, 2 unreadable/malformed lockfile
```

Reading rule for `node_modules/<name>/package.json`: read once, cache the
version. A read failure yields `'<unreadable>'` and counts as drift (fail-closed).

Traversal rule: iterate `lock.packages` keys beginning with `node_modules/` and
containing exactly one `node_modules/` segment after the prefix for the direct
set; the check scope is **direct dependencies plus devDependencies plus
optionalDependencies**, which is where drift actually occurs and keeps the check
fast and legible. Transitive drift is a legitimate concern but is out of scope for
this change (see Rejected alternatives).

Fresh-tree detection: `!existsSync(join(root, 'node_modules'))` → `status:'fresh'`,
exit 0.

Platform-inapplicable optional dependency: a name present in
`package.json.optionalDependencies` whose absence on disk is expected. The check
treats an absent optional dependency as satisfied; an optional dependency that
IS installed at the wrong version is still drift.

On-demand semantics: `verify:deps` is run by a human or agent (and by CI in
change 301) before the toolchain-sensitive gates. The guard is a pure check; it
must not spawn `npm`. It MUST NOT be registered as `preinstall`, because npm
clears `node_modules` first and the hook would then always pass.

## Control/data flow

```
npm ci  (the documented install; constructs the tree at locked versions)
        │
        └─▶ npm run verify:deps: node scripts/check-install.mjs
                │
                ├─ lockfile present & parseable?  no ─▶ exit 2
                ├─ node_modules present?          no ─▶ status fresh, exit 0
                ├─ for each locked package:
                │      installed = read version (cached)
                │      locked    = lock.packages['node_modules/'+name].version
                │      mismatch  ─▶ drift row
                └─ print table + `npm ci`; exit drifts.length ? 1 : 0

exit 0 ─▶ gates may run and their results are attributable to the locked toolchain
exit 1 ─▶ the run stops before any toolchain-sensitive gate; tree is untouched
```

## Detailed behavior

Output on drift (stable, greppable):

```
Dependency tree does not match package-lock.json (2 drifts):
  @vitest/coverage-v8  installed 3.2.7  locked 4.1.11
  vitest                installed 3.2.7  locked 4.1.11
Remediation: npm ci
```

Output on match:

```
Dependency tree matches package-lock.json (14 direct packages verified).
```

Output on fresh tree:

```
No node_modules directory; run `npm ci` to install the locked tree.
```

Output on malformed lockfile:

```
Cannot read package-lock.json: <message>
```

## Failure modes

| Failure | Behaviour |
|---|---|
| Malformed/missing lockfile | exit 2, message names the parse failure; never "no drift" |
| Installed `package.json` unreadable | drift row `installed <unreadable>`; never skipped |
| Node older than the pinned `packageManager` | Corepack/npm surfaces it; the script itself still runs on node >= 20 |
| `npm install` inside the guard | Forbidden; would recurse. Guard never spawns npm. |
| The guard wired to `preinstall` | Forbidden. npm clears `node_modules` before the hook, so the guard would always report a match — a false green. |
| Drift exists but the script prints success | Forbidden; the success line is emitted only when `drifts.length === 0` |

## ## Compatibility/migration

- `package.json` gains `packageManager` and `verify:deps`. It does NOT gain
  `preinstall` (see the correction above).
- `package-lock.json` is unchanged.
- A contributor on a drifted tree is detected by `verify:deps` before any gate
  runs, and remediates with `npm ci`. The tree is no longer mutated-by-default on
  `npm install`; `npm ci` remains the documented install.
- CI is unaffected: it runs `npm ci`, which produces a matching tree, and the
  guard passes when invoked.

## Performance/resource constraints

- One `package.json` read per direct dependency (order 14 today), cached. The
  whole check is a few milliseconds; the 5-second bound is generous.
- No dependency is loaded into the process; only version strings are read.

## Testing seams

`scripts/check-install.mjs` is intentionally dependency-free (node builtins only)
so it can run before any install. Its behaviour is proven by executing it against
synthetic fixtures in a temp directory:

1. a lockfile + matching tree → exit 0;
2. a lockfile + drifted tree → exit 1 with the expected table;
3. no `node_modules` → exit 0, "fresh" message;
4. an incompatible optional dependency absent → exit 0;
5. an unreadable installed `package.json` → exit 1;
6. a malformed lockfile → exit 2;
7. `git status` unchanged before/after every case (read-only proof).

Fixtures live under `tests/unit/` as a normal Vitest file that shells out to the
script, so the guard is covered by `npm test` in CI.

## Observability

- Exit codes are the machine-readable signal; the drift table is the
  human-readable one.
- The number of verified packages is printed so an empty check is distinguishable
  from a real pass.

## Affected files/symbols

**New**
- `scripts/check-install.mjs`
- `tests/unit/ToolchainReproducibility.test.ts`

**Modified**
- `package.json` (`packageManager`, `verify:deps`; no `preinstall`)
- `ONBOARDING.md` (toolchain section)
- `AGENTS.md` (baseline verification sequence gains the dependency check)

**Explicitly not modified**
- `package-lock.json`
- `vitest.config.ts` thresholds
- anything under `src/`

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Change the thresholds to be Vitest-3-compatible | The thresholds were deliberately recalibrated for Vitest 4 (AUDIT-009); supporting two providers would either relax the gate or fork the numbers. The lockfile already chose Vitest 4. |
| Simply document "run `npm ci` first" | Documentation alone cannot fail a stale tree; the drift went unnoticed across many sessions precisely because nothing detected it. A guard is required. |
| Full transitive closure drift detection | More thorough but far slower to read and rarely actionable; a transitive mismatch almost always implies a direct mismatch. Direct-scope detection catches the real cases. Kept as possible follow-on. |
| Enforce Node 20 with `engines.node: "20.x"` | The local host runs Node 24; narrowing `engines` would be a broader compatibility decision than this change's remit. Documentation + exact `packageManager` pin achieves the reproducibility goal without forcing contributors off a supported runtime. |
| Wire the guard to `preinstall` so a drifted install aborts | Measured impossible to do correctly: npm removes `node_modules` before `preinstall`, so the hook observes an absent or pre-existing tree and always reports a match. A false-green lifecycle hook is worse than an explicit gate. Superseded by the on-demand `verify:deps` design. |
| CI-only enforcement | CI already uses `npm ci` and is therefore already correct; the problem is exclusively the local/unpinned path. |
| Delete `coverage/` or the coverage gate | Unrelated and destructive. |

## Downstream dependencies

- 298 restores a green local gate; 299 makes that gate trustworthy. Either order
  is shippable, 298 first is preferred.
- 301 wires more manual gates into CI and shares the "declared scripts" surface;
  the two must not both edit the same `package.json` `scripts` block without
  coordination.
