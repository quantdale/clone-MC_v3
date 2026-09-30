# Tasks: 300-visual-regression-gate-reliability

- [x] **T1.** Record the staleness evidence. Attach to `verification.md`:
  `git log -1` for `tests/visual-golden/linux-ci` (`6af6c6c`, 2026-09-18);
  `git log -S` for `trading-open` (`05203ab`, change 278), `shield-indicator`
  (`a9b7108`, change 279), `raid-feedback` (`f0e022c`, change 282); the measured
  `class` attribute of each element showing `trading-open` has no `hidden`;
  and the exclusive reveal/hide chain proving only 2 of 10 screens (`render-world`, `hud`) capture the HUD
  with chips visible. **Evidence already captured at base `2ecf781`.**

- [x] **T2.** Record the instability evidence: the six-run table from the 297
  verification dossier (30/30, 29/31, 31/29, 30/30, 30/30, 30/30), the band
  0.0202–0.0708 against the 0.02 bound, and the cell-by-cell conclusion that all
  40 low/default cells are byte-identical and every flip is `high/1920x1080`.
  **Evidence already captured at base `2ecf781`.**

- [x] **T3.** Audit the HUD-surface delta between the pin (`6af6c6c`) and `HEAD`
  and confirm it is fully explained by reviewed changes (278 trading chip, 279
  shield indicator, 282 raid bar) with no unexplained product drift, so the
  re-pin cannot mask an unreviewed regression. **Evidence already captured at
  base `2ecf781`.**

- [ ] **T4.** Add `CAPTURED_SURFACE_GLOBS` to `tests/visual/matrix.ts`
  (exported, single source of truth) covering `index.html`, `src/styles.css` and
  `src/rendering/**`, and add a unit test asserting the glob set matches the
  surfaces the capture harness actually reads.

- [ ] **T5.** Implement `scripts/check-visual-goldens.mjs` on node builtins
  only: per golden environment, compare the newest golden commit timestamp
  against the newest captured-surface commit; exit 1 stale (naming the golden
  dir, the golden commit, the newer commit and the re-pin command), exit 0 fresh
  or acknowledged, exit 2 when a golden directory is missing. Honour
  `VISUAL_GOLDENS_ACKNOWLEDGED` only for the exact commit it names.

- [ ] **T6.** Add `tests/unit/VisualGoldenStaleness.test.ts` covering the pure
  decision function with synthetic inputs: fresh, stale, stale-but-acknowledged,
  acknowledged-for-a-different-commit, and missing-directory.

- [ ] **T7.** Add the staleness step to `.github/workflows/ci.yml` before the
  browser gate, and demonstrate it failing on a synthetic stale state (for
  example by pointing `VISUAL_GOLDENS_ACKNOWLEDGED` at an empty value against a
  golden set deliberately aged in a throwaway worktree) and passing on the
  current tree.

- [ ] **T8.** Measure the `high/1920x1080` noise floor BEFORE touching anything,
  in a throwaway worktree: capture that column at least 5 times on an
  unmodified build and record every changed fraction. Record the maximum
  measured fraction and the method in `verification.md`.

- [ ] **T9.** Attempt capture-side determinism for the unstable column, cheapest
  first: (a) frame-completion wait instead of the fixed 750 ms settle using the
  existing whole-frame observability surface; (b) profile-scaled settle; (c)
  freeze dynamic resolution during capture. After each attempt run the column
  three times and record the status map. Adopt the first attempt that makes all
  three runs identical.

- [ ] **T10.** If T9 cannot make the column deterministic, adopt a documented
  bound for that column only, justified by T8's measurement, AND add a tripwire
  unit test proving `comparePng` still fails a synthetic image that exceeds the
  documented bound. Record both the old and new numbers.

- [ ] **T11.** Re-pin the `linux-ci` baseline through the canonical
  `UPDATE_SNAPSHOTS=1` path after T4–T10, verifying first that the HUD-surface
  delta is fully explained (T3). Review the resulting PNG diff as a golden
  re-pin commit.

- [ ] **T12.** Verify the matrix is fully green in verify mode at the committed
  thresholds, three consecutive runs, with an identical per-cell status map each
  time. A run showing any tolerated failure is not acceptable completion.

- [ ] **T13.** Decide and implement the baseline policy: retire `win32-local`
  (preferred) by updating `resolveGoldenEnvironment` and the README, or retain it
  with an enforced refresh trigger covered by T5's check. Delete the retired
  directory if retiring. Update `tests/visual-golden/README.md` with the
  authoritative baseline, the policy, and the re-pin trigger.

- [ ] **T14.** Update the file-audit manifest for added/removed paths and run
  `node scripts/validate-file-audit.mjs …` to PASS.

- [ ] **T15.** Full mandatory gate: `npm run validate-state`, `npm run typecheck`,
  `npm run lint`, `npm test`, `npm run build`,
  `node scripts/check-release-bundle.mjs`, `npm run test:e2e`. Lint MUST stay at
  0 errors; the 85 pre-existing warnings MUST NOT increase.

- [ ] **T16.** Documentation and state: add the post-terminal row to
  `CHANGE_SEQUENCE.md`; record the before/after matrix status maps and the noise
  floor in `verification.md`; update `openspec/PROGRAM_STATE.json` / `.md` at
  activation with `session_start_head` / `published_head`.

- [ ] **T17.** Final reconciliation and publication: re-read all artifacts
  against the implemented result, confirm every MUST/SHALL in
  `specs/visual-regression-gate/spec.md` has evidence (especially T5's exit
  codes, T8/T9/T10's measurements, and T12's green runs), confirm 100% checkbox
  completion, inspect the diff for unrelated changes, commit, push to
  `origin/main`, verify the remote head, and report `published_head`.
