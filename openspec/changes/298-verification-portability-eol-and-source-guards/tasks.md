# Tasks: 298-verification-portability-eol-and-source-guards

- [x] **T1.** Record the failing-first baseline. Attach to `verification.md`
  the exact `npm test` tail showing `2 failed | 5711 passed | 1 skipped (5714)`,
  the two named failing tests with their assertion messages, and the isolated
  re-run (`npx vitest run tests/unit/LiveSplashPotion.test.ts tests/unit/LiveStatusEffectPersistence.test.ts`)
  reproducing both failures in isolation. Record `git config core.autocrlf`,
  the absent `.gitattributes`, and the `file src/engine/Game.ts` CRLF report.
  **Evidence already captured at base `2ecf781`.**

- [x] **T2.** Capture the external proof-of-concept. In a scratch directory
  (never in the repository), read `src/engine/Game.ts` and apply
  `.replace(/\r\n/g, '\n')`; show that both failing assertions then pass
  (`raid=114067`, `patrol=114580`, `potions=114766`, 292 regex `true`). This
  establishes that the defect is line-ending-only and that the fix needs no
  assertion relaxation. **Evidence already captured at base `2ecf781`.**

- [ ] **T3.** Add `.gitattributes` with `* text=auto eol=lf` plus explicit
  binary declarations for `*.png`, `*.jpg`, `*.webp`, `*.ico`, `*.woff`,
  `*.woff2`. Verify with
  `git check-attr text eol -- src/engine/Game.ts index.html tests/e2e/visual-regression.spec.ts`
  (each MUST report `eol: lf`).

- [ ] **T4.** Renormalise the working tree with `git add --renormalize .` and
  prove the commit is content-neutral BEFORE pushing:
  `git diff -w --stat HEAD~1..HEAD` and
  `git diff --ignore-all-space --numstat HEAD~1..HEAD` MUST show no changed
  file other than `.gitattributes` and the files named in T5–T8, and
  `git diff --numstat` MUST show no `*.png` churn. Write
  "line-ending-only" into the commit message so a reviewer can verify it.

- [ ] **T5.** Add `tests/support/sourceText.ts` exporting `readSource`,
  `methodBody` and `countOccurrences`. `readSource` normalises CRLF→LF and
  propagates read errors. `methodBody` MUST be brace-aware: it MUST skip string
  literals, template literals and comments while counting depth, and MUST throw
  a named error when the signature is absent or braces are unbalanced.

- [ ] **T6.** Add `tests/unit/SourceTextPortability.test.ts` covering: CRLF and
  LF inputs normalise identically; `readSource` output contains no `\r`;
  `methodBody` positive case, absent-signature throw, unbalanced-brace throw,
  and a body containing braces inside string/template/comment spans; and a sweep
  asserting no file under `tests/unit/` calls `readFileSync` (or `fs.readFile`)
  directly on a path under `src/`.

- [ ] **T7.** Repair the two currently failing assertions.
  - `tests/unit/LiveSplashPotion.test.ts`: replace the three
    `indexOf('...\n    // 5.8')`-style anchors with `methodBody`-scoped
    `countOccurrences(...) === 1` plus strictly-increasing `indexOf` comparisons
    over `this.tickRaidFeedback();`, `this.tickPillagerPatrol();` and
    `this.tickSplashPotions();`.
  - `tests/unit/LiveStatusEffectPersistence.test.ts`: replace the
    `// 292`-bearing regex with a `methodBody`-scoped ordering comparison of
    `this.playerEffects.tick(dt);` and `this.tickBadOmenDuration(dt);`.
  Read the real fixed-tick signature from `src/engine/Game.ts` rather than
  assuming one.

- [ ] **T8.** Route the remaining six source-guard suites through
  `readSource` and convert every multi-line or comment-bearing anchor into a
  single-line identifier anchor: `LivePeriodicStatusEffects`,
  `LivePillagerPatrol`, `LiveRaidEscalation`, `LiveWitchGunpowderDrops`,
  `RaiderRenderer`, `SplashPotionRenderer`. Behavioural assertions and harness
  code in those files MUST remain unchanged.

- [ ] **T9.** Prove platform independence both ways. Run `npm test` on the
  renormalised (LF) tree. Then force a CRLF tree in a throwaway `git worktree`
  (or by re-checking-out with `core.autocrlf=true`) and run `npm test` there.
  Both runs MUST exit 0 with the same test count. Record both counts and exit
  codes in `verification.md`. Remove the throwaway worktree afterwards.

- [ ] **T10.** Prove comment-independence. In the throwaway worktree only,
  reword the `// 5.8`, `// 5.10`, `// 6. Survival` and `// 292` comments in
  `src/engine/Game.ts`, run the eight suites, and confirm all still pass. Revert
  the comment edit; the repository MUST NOT ship a modified `src/engine/Game.ts`.
  `git status` must report no change under `src/`.

- [ ] **T11.** Guard against regression of the guard. Confirm
  `tests/unit/SourceTextPortability.test.ts` matches the configured
  `tests/unit/**/*.test.ts` include glob so it runs in CI by default (no
  `skipIf`, no environment gate).

- [ ] **T12.** Full mandatory gate. Run and record:
  `npm run validate-state`, `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `node scripts/check-release-bundle.mjs`,
  `npm run test:e2e`, and
  `node scripts/validate-file-audit.mjs openspec/hardening/2026-08-23-exhaustive-repository-certification/file-audit-manifest.json`
  (append rows for the three new files and the eight modified files, using the
  manifest's existing shape). Lint MUST remain 0 errors; the 85 pre-existing
  `no-explicit-any` warnings are accepted and MUST NOT increase.

- [ ] **T13.** Documentation and state. Update `CHANGE_SEQUENCE.md` with the
  post-terminal row for 298, record the LF-checkout consequence for Windows
  contributors in `verification.md`, and update `openspec/PROGRAM_STATE.json` /
  `.md` when activating. Record `session_start_head` and `published_head`.

- [ ] **T14.** Final reconciliation and publication. Re-read proposal, design,
  spec and tasks against the implemented result; update any stale statement;
  confirm completion is 100% of the checkboxes above; confirm every MUST/SHALL
  requirement in `specs/verification-portability/spec.md` has passing evidence;
  inspect the intended diff for unrelated changes; commit; push to `origin/main`
  with a normal history-preserving push; verify the remote head; report
  `published_head`.
