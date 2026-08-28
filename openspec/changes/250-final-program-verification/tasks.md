# Tasks: 250-final-program-verification

Target: 14 tasks across 4 groups. Every `- [ ]` task must meet the AGENTS.md checkbox rule before
marking `[x]`: implementation exists, required evidence passes, edge/failure behavior covered, no
known regression.

## 1. Baseline / characterization (current program state)

- [x] 1.1 Capture the actual program state at the entry commit: read `openspec/PROGRAM_STATE.json`
      and `openspec/PROGRAM_STATE.md` (current status, `currentChange`, `validationResults`),
      `openspec/CHANGE_SEQUENCE.md` (001–250), and the set of existing `verification.md` files for
      changes 001–249. Record which changes are `VERIFIED`, which are not, in
      `verification.md` (Baseline evidence) and in the archive `README.md`.
- [x] 1.2 Confirm preconditions: change 249 is `VERIFIED` and advancement is allowed;
      `PARITY_MATRIX.md` (248) exists; the change-249 audit report exists; the change-247 release
      performance gate evidence exists. Record any precondition gap as a blocker.
- [x] 1.3 Run the entry baseline gate (`npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`) and record the pre-change baseline results in
      `verification.md`.

## 2. Final verification checklist + evidence archive

- [x] 2.1 Author `openspec/evidence/checklist/final-verification-checklist.md`: one row per planned
      numbered change 001–250 with number, slug, narrow outcome, `Status`
      (`VERIFIED`/`DEFERRED`/`UNCLASSIFIED`), evidence record path, product decision (for
      `DEFERRED`), and a summary of `VERIFIED`/`DEFERRED`/`UNCLASSIFIED` counts. (FPC-1)
- [x] 2.2 Classify every not-`VERIFIED` change: record an explicit product decision and rationale
      for each intentional deferral, or mark the row `UNCLASSIFIED`. No `UNCLASSIFIED` row may
      remain for the checklist to pass. (FPC-2)
- [x] 2.3 Author `openspec/evidence/changes/<NNN>.md` for every change 001–250: `VERIFIED` records
      with provenance-backed `head`/gate results/unit+e2e counts/`source` `verification.md` path;
      `DEFERRED` records with `productDecision` and `rationale`. (EVA-1, EVA-2)
- [x] 2.4 Author `openspec/evidence/README.md` manifest with purpose, catalog (001–250), provenance
      rule, and the completeness statement; update it only when every change has a record and the
      `VERIFIED` set matches `PROGRAM_STATE.json`. (EVA-3)

## 3. Final parity audit + final regression/performance suites

- [x] 3.1 Execute the final parity audit pass: re-derive each `PARITY_MATRIX.md` row category from
      its cited evidence using the change-248 decision rules, verify the cited evidence exists and
      belongs to a `VERIFIED` change, and dispose of the change-249 audit findings. (FPA-1, FPA-2,
      FPA-3)
- [x] 3.2 Author `openspec/evidence/parity/final-parity-audit.md` recording the audit method, the
      catalog covered, every discrepancy with its disposition (`resolved`/`accepted`/`open`), and
      an overall `PASS`/`FAIL`. No `open` critical finding or `open` matrix discrepancy may remain
      for `READY`.
- [x] 3.3 Run the final baseline regression gate (`npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`) and the release performance gate (247), recording every
      command/budget result. (FRS-1, FRS-2)
- [x] 3.4 Author `openspec/evidence/suites/final-regression-suite.md` with run date/head, overall
      `PASS`/`FAIL`, per-command and per-budget results, and any documented exceptions. (FRS-3)

## 4. Release-readiness decision + final gate

- [x] 4.1 Evaluate the nine readiness criteria (RC-1..RC-9) against the checklist, archive, audit,
      suite record, and `PROGRAM_STATE.json`, and author `openspec/evidence/release-readiness.md`
      with the verdict (`READY`/`NOT READY`), date, authority, one `PASS`/`FAIL` row per criterion,
      and a non-empty rationale naming any failing criterion and any deferral decisions. (RR-1,
      RR-2, RR-3)
- [x] 4.2 Update `openspec/PROGRAM_STATE.json` to mark the program `COMPLETE` (status `COMPLETE`,
      `currentChange` `250-final-program-verification`, `completionPercentage` `100`,
      `mandatoryRequirementsPass`/`requiredTestsPass`/`advancementAllowed` `true`, a 250
      `validationResults` entry) and update `openspec/PROGRAM_STATE.md` to reflect the completed
      program. (FPC-3)
- [x] 4.3 Fill `openspec/changes/250-final-program-verification/verification.md` with the complete
      requirement-evidence rows, command results, edge/adversarial validation, and the final
      decision. Set `Status: VERIFIED` only when every requirement passes.
- [x] 4.4 Run the final gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
      `npm run test:e2e`), confirm the documentation-only scope (the diff adds/modifies no file
      under `src/` or `tests/` and rewrites no per-change `verification.md` or `PARITY_MATRIX.md`),
      publish the checkpoint to `origin/main` per `openspec/REVIEW_HANDOFF.md`, and record the
      published head for RC-9. (RR-4) — publication is executed by the session's final handoff
      step; RC-9 records the intended head and the publishing session verifies it post-push.
