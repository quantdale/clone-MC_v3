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

- [ ] **T3.** Determine the exact npm version that CI's Node 20 image ships (or
  the version that reproduces the current lockfile) and add an exact
  `packageManager` field to `package.json` with no range operator.

- [ ] **T4.** Implement `scripts/check-install.mjs` using node builtins only:
  read `package-lock.json`; detect a fresh tree (`node_modules` absent); for each
  direct dependency read the installed version once (cached) and compare to the
  lockfile-resolved version; treat an installed-but-unreadable `package.json` as
  drift (`<unreadable>`); treat an absent platform-inapplicable optional
  dependency as satisfied; print a stable drift table with the remediation
  command; exit 0 match/fresh, 1 drift, 2 malformed lockfile. Never mutate any
  file and never spawn npm.

- [ ] **T5.** Add `tests/unit/ToolchainReproducibility.test.ts` covering seven
  cases against synthetic temp-directory fixtures: match (exit 0), drift (exit 1
  + exact table), fresh (exit 0), incompatible optional absent (exit 0),
  unreadable installed manifest (exit 1), malformed lockfile (exit 2), and the
  read-only property (no file mutation across every case).

- [ ] **T6.** Wire the guard: add `"preinstall": "node scripts/check-install.mjs"`
  and `"verify:deps": "node scripts/check-install.mjs"` to `package.json`. Do not
  alter any existing script's behaviour.

- [ ] **T7.** Prove the install-time abort in a throwaway copy of the repo (never
  the primary working tree): introduce a deliberate drift (or reuse the
  3.2.7 tree), run `npm install`, and confirm a non-zero exit with the drift
  table and NO package directory added/removed/updated. Then run `npm ci` on a
  fresh throwaway copy and confirm it completes. Remove the throwaway copies.

- [ ] **T8.** Confirm CI compatibility: after `npm ci`, `verify:deps` exits 0;
  the `gate` job steps (`validate-state`, `typecheck`, `lint`, `build`,
  `check-release-bundle`, `test`, `test:coverage`, both `npm audit`s) all still
  pass. Record the canonical CI run URL and job ids in `verification.md`.

- [ ] **T9.** Re-establish the coverage measurement on the locked toolchain. Run
  `npm run test:coverage` after `npm ci` and record the four measured figures.
  If any figure falls below the pinned thresholds, this is a **finding to
  report**, not a threshold to relax; record it and stop for an explicit product
  decision rather than editing `vitest.config.ts`.

- [ ] **T10.** Documentation: add a "Toolchain" section to `ONBOARDING.md`
  recording the CI-canonical Node version, `npm ci` as the only supported
  install, the `packageManager` pin, and that coverage thresholds are calibrated
  for the locked coverage-provider version with branch metrics not comparable
  across provider majors. Add the dependency check as an explicit first step of
  the mandatory baseline-verification sequence in `AGENTS.md`.

- [ ] **T11.** Update the file-audit manifest with rows for the two new files and
  the modified `package.json`/`ONBOARDING.md`/`AGENTS.md`, then run
  `node scripts/validate-file-audit.mjs …` to PASS.

- [ ] **T12.** Full mandatory gate on the candidate SHA:
  `npm run validate-state`, `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `node scripts/check-release-bundle.mjs`, `npm run test:e2e`.
  Lint MUST remain 0 errors with no increase in the 85 pre-existing warnings.

- [ ] **T13.** Documentation and state: add the post-terminal row to
  `CHANGE_SEQUENCE.md`, record the install-abort behaviour and its rationale in
  `verification.md`, and update `openspec/PROGRAM_STATE.json` / `.md` at
  activation with `session_start_head` / `published_head`.

- [ ] **T14.** Final reconciliation and publication: re-read all four artifacts
  against the implemented result, confirm every MUST/SHALL in
  `specs/toolchain-reproducibility/spec.md` has recorded evidence (especially
  the seven T5 cases and the two T7 install behaviours), confirm 100% checkbox
  completion, inspect the diff for unrelated changes, commit, push to
  `origin/main`, verify the remote head, and report `published_head`.
