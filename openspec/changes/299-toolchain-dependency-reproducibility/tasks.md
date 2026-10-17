# Tasks: 299-toolchain-dependency-reproducibility

- [x] **T1.** Record the drift baseline. Attach to `verification.md` the full
  installed-vs-declared-vs-locked table for all 14 direct dependencies, the
  `RUN v3.2.7` runner banner from `npm test`, the `packageManager: ABSENT`
  probe, and the CI `node-version: 20` pins. **Evidence already captured at
  base `2ecf781`.**

- [x] **T2.** Record why the drift matters: quote the `vitest.config.ts`
  provider-coupling comment and the measured Vitest 4 baseline
  (91.79/88.69/94.44/93.06) against the Vitest 3 all-file model
  (83.39/91.11/95.80/83.39), and record that `npm run test:coverage` was
  therefore deliberately NOT run as evidence in the audit session.
  **Evidence already captured at base `2ecf781`.**

- [x] **T3.** Determined and pinned the exact npm version that CI's Node 20 image ships (or
  the version that reproduces the current lockfile) and add an exact
  `packageManager` field to `package.json` with no range operator.

- [x] **T4.** Implemented `scripts/check-install.mjs` using node builtins only:
  reads `package-lock.json`; detects a fresh tree (`node_modules` absent or
  empty); for each direct dependency reads the installed version once (cached)
  and compares to the lockfile-resolved version; treats an
  installed-but-unreadable `package.json` as drift (`<unreadable>`); treats an
  absent platform-inapplicable optional dependency as satisfied; prints a stable
  drift table with the remediation command; exits 0 match/fresh, 1 drift,
  2 missing/malformed lockfile. Never mutates any file and never spawns npm.
  Also compares the transitive closure recorded in the lockfile, because the
  measured drift (vitest 3.2.7 vs 4.1.11) is exactly the kind a direct-only scan
  catches and a closure scan additionally protects.

- [x] **T5.** Added `tests/unit/ToolchainReproducibility.test.ts` (10 tests) covering:
  cases against synthetic temp-directory fixtures: match (exit 0), drift (exit 1
  + exact table), fresh (exit 0), incompatible optional absent (exit 0),
  unreadable installed manifest (exit 1), malformed lockfile (exit 2), and the
  read-only property (no file mutation across every case).

- [x] **T6.** Wired the guard as `"verify:deps": "node scripts/check-install.mjs"`
  in `package.json`, and added the exact `packageManager` pin. **`preinstall`
  wiring was deliberately OMITTED and is now forbidden**: measurement proved npm
  removes `node_modules` before running the root `preinstall` hook, so a
  hook-hosted guard always observes an absent/pre-existing tree and prints a
  false `matches package-lock.json` line. Proposal 2a, the design correction, and
  the spec's on-demand requirement record the measurement; the spec was amended
  before this divergence shipped, per `AGENTS.md`. No existing script's behaviour
  changed.

- [x] **T7.** Proved the lifecycle behaviour in throwaway copies (never the
  primary working tree) and corrected the spec as a result. A synthetic drifted
  tree (`vitest` 3.2.7 on disk, 4.1.11 locked) with the guard wired as
  `preinstall` printed `Dependency tree matches package-lock.json (171 packages
  verified)` and `npm install` then reported `added 227 packages, changed 1
  package`: the hook never observes the pre-install tree, so it cannot prevent
  the mutation and instead emits false-green evidence. The `preinstall` wiring was
  removed. A minimal probe fixture independently confirmed the mechanism
  (`preinstall` sees `node_modules` absent when it was absent, and the
  pre-existing entry count when the directory was created beforehand). The
  throwaway copies were removed.

- [x] **T8.** Confirm CI compatibility: after `npm ci`, `verify:deps` exits 0;
  the `gate` job steps (`validate-state`, `typecheck`, `lint`, `build`,
  `check-release-bundle`, `test`, `test:coverage`, both `npm audit`s) all still
  pass. Record the canonical CI run URL and job ids in `verification.md`.

- [x] **T9.** Re-establish the coverage measurement on the locked toolchain. Run
  `npm run test:coverage` after `npm ci` and record the four measured figures.
  If any figure falls below the pinned thresholds, this is a **finding to
  report**, not a threshold to relax; record it and stop for an explicit product
  decision rather than editing `vitest.config.ts`.

- [x] **T10.** Documentation: added a "Toolchain" section to `ONBOARDING.md`
  recording the CI-canonical Node version, `npm ci` as the only supported
  install, the `packageManager` pin, and that coverage thresholds are calibrated
  for the locked coverage-provider version with branch metrics not comparable
  across provider majors. Add the dependency check as an explicit first step of
  the mandatory baseline-verification sequence in `AGENTS.md`.

- [x] **T11.** Updated the file-audit manifest with rows for the two new files and
  the modified `package.json`/`ONBOARDING.md`/`AGENTS.md`, then run
  `node scripts/validate-file-audit.mjs …` to PASS.

- [x] **T12.** Full mandatory gate on the candidate SHA:
  `npm run validate-state`, `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `node scripts/check-release-bundle.mjs`, `npm run test:e2e`.
  Lint MUST remain 0 errors with no increase in the 85 pre-existing warnings.

- [x] **T13.** Documentation and state: add the post-terminal row to
  `CHANGE_SEQUENCE.md`, record the install-abort behaviour and its rationale in
  `verification.md`, and update `openspec/PROGRAM_STATE.json` / `.md` at
  activation with `session_start_head` / `published_head`.

- [x] **T14.** Final reconciliation and publication: re-read all four artifacts
  against the implemented result, confirm every MUST/SHALL in
  `specs/toolchain-reproducibility/spec.md` has recorded evidence (especially
  the seven T5 cases and the two T7 install behaviours), confirm 100% checkbox
  completion, inspect the diff for unrelated changes, commit, push to
  `origin/main`, verify the remote head, and report `published_head`.
