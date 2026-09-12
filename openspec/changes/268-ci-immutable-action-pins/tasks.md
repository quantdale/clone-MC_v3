# Tasks: 268-ci-immutable-action-pins

## A. Control plane

- [x] T1. Control-plane entries: 268 row in `CHANGE_SEQUENCE.md`, 268
  authorization in `CHANGE_SEQUENCE_OVERRIDES.md`, `PROGRAM_STATE.json`/`.md`
  activation (`currentChange=268-...` ACTIVE, `lastCompleted=267`,
  258 BLOCKED). Session start `9d5fdb1`.
- [x] T2. Package quality gate (SPEC_AUTHORING_PROTOCOL): number/name matches
  sequence; previous change VERIFIED; one narrow outcome; proposal/design/spec
  structures complete; every MUST/SHALL has a scenario; tasks cover
  impl/static-checks/regression/docs/gate; verification mapping declared; no
  vague placeholders; no later-change scope.

## B. Pin resolution

- [x] T3. Resolve all four `v4` SHAs via the GitHub API
  (`git/refs/tags/v4` per repo) and confirm each as a real commit
  (`/commits/{sha}`); freeze the table in `design.md` + `verification.md`.
  Pins: checkout `11d5960a…`, setup-node `49933ea5…`, cache `0057852b…`,
  upload-artifact `ea165f8d…` (full SHAs in design/verification).

## C. Implementation

- [x] T4. Pin `ci.yml`: replace all 7 `actions/*@v4` refs with
  `actions/*@<sha> # v4`; diff shows ref tokens only.
- [x] T5. Pin `seed-visual-goldens.yml`: replace all 4 `actions/*@v4` refs
  with `actions/*@<sha> # v4`; diff shows ref tokens only.
- [x] T6. Risk register: R-5 row → CLOSED by Change 268 with evidence
  pointer; no other row touched.

## D. Static validation

- [x] T7. Floating-ref grep over `.github/workflows/` returns zero matches;
  both workflow files YAML-safe-parse; `git diff --stat` shows only the
  intended files.

## E. Gate

- [x] T8. Local gates: `validate-state` PASS, `typecheck` PASS, `lint` PASS,
  `build` PASS, unit `test` PASS (no `src/` change — proves no regression).
- [ ] T9. `PARITY_MATRIX.md` C268 `n/a` row + summary counts reconciled +
  post-terminal note (258 stays BLOCKED/rowless; 259–267 untouched).
- [ ] T10. Publish `origin/main`, watch CI (gate + e2e) green on the exact
  published SHA, mark 268 VERIFIED 10/10 + R-5 CLOSED, final report (SHAs,
  completion, validations, blockers, next action).
