# Tasks: 272-lighting-clock-dt-sync

- [x] 1. Control plane — `CHANGE_SEQUENCE_OVERRIDES.md` 272 authorization
  (272 sole ACTIVE, 258 BLOCKED intact, 259–271 VERIFIED untouched);
  `CHANGE_SEQUENCE.md` 272 row; full package under
  `openspec/changes/272-lighting-clock-dt-sync/` (proposal/design/spec/tasks/
  verification) passing the SPEC_AUTHORING_PROTOCOL quality gate;
  PROGRAM_STATE.json/.md ACTIVE checkpoint (currentChange=272, lastCompleted
  =271, 258 BLOCKED); `npm run validate-state` PASS.
- [x] 2. Characterization — record pre-fix desync evidence: hitch-sized
  `update(5)` advances the clock 0.1 s but rotates the sun 5 s (failing-first
  proof, e.g. scratch vitest run or analytic note in verification.md).
- [x] 3. Fix — `src/rendering/Lighting.ts` `update()`: rotate the sun with
  `effectiveDt` instead of raw `dt` (one-token diff; guard/axis/sign/daylight/
  shadow/freeze paths untouched).
- [x] 4. Unit tests — extend `tests/unit/Lighting.test.ts`: hitch ≡ clamped
  step (clock + sun), hitch ≡ 50× clamped steps, repeated-hitch rotation
  total, frozen hitch no-op, negative dt full no-op on both channels;
  existing tests unchanged and green.
- [x] 5. Risk register — R-9 marked CLOSED by Change 272 with closure
  evidence pointer (keep R-1..R-9 numbering contiguous; no other row touched).
- [x] 6. Focused gate — `npm run typecheck` 0 errors, `npm run lint`
  0 errors, `npx vitest run tests/unit/Lighting.test.ts` green.
- [x] 7. Full baseline gate — `npm test` (full unit), `npm run build`,
  `npm run test:e2e` (full suite incl. 60-cell visual matrix) all green with
  exact counts; zero golden churn (or per-cell justification + re-pin);
  no 259–271 regressions; no 258 headed work.
- [x] 8. Scope audit — `git diff --stat` allowlist: production diff only in
  `src/rendering/Lighting.ts`; no gameplay/simulation/persistence retune.
- [x] 9. Matrix + checkpoint — `PARITY_MATRIX.md` C272 exact row + counts
  reconciled; tasks.md/verification.md evidence-synced;
  `openspec/PROGRAM_STATE.json`/`.md` checkpoint (272 VERIFIED 10/10,
  258 BLOCKED intact); `validate-state` PASS; file-audit clean.
- [x] 10. Publish + VERIFIED — commit, push `origin/main`, verify remote
  head, record `published_head`, flip `verification.md` to VERIFIED with the
  advancement-gate computation, final session report with SHAs.
