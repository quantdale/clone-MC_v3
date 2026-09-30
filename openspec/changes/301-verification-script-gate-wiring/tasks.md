# Tasks: 301-verification-script-gate-wiring

- [x] **T1.** Record the reference matrix. Attach to `verification.md` the
  cross-reference of all 8 `scripts/*.mjs` against `package.json` and
  `.github/workflows/*.yml`, showing that only `validate-state.mjs` and
  `check-release-bundle.mjs` are referenced and six are not; plus the current
  hand-run results for `orphan-check.mjs` (`384 files … zero internal importers:
  3 — src/main.ts, src/rendering/MeshWorkerEntry.ts, src/worldgen/WorldgenWorkerEntry.ts`)
  and `verify-mcp-addons.mjs` (`PREFLIGHT OK … pinned, secret-free, no global
  resolution`), and `validate-file-audit.mjs` (`PASSED, 3031 rows`). **Evidence
  already captured at base `2ecf781`.**

- [ ] **T2.** Verify each candidate gate is green at the session-start tip by
  running `npm run`-equivalent invocations of `validate-file-audit.mjs`,
  `orphan-check.mjs` and `verify-mcp-addons.mjs` and recording each exit code. If
  any is red, resolve it or record an explicit deferral BEFORE wiring it; never
  land a knowingly-red blocking step.

- [ ] **T3.** Add the individual npm scripts: `verify:file-audit`,
  `gen:file-audit`, `verify:orphans`, `verify:mcp`, `verify:inventory`,
  `evidence:archive`. Do not modify any existing script entry.

- [ ] **T4.** Implement `scripts/verify-all.mjs` (node builtins only) with the
  ordered gate table from the design: dependency-tree → program-state →
  typecheck → lint → build → release-bundle → file-audit → unreferenced-source →
  addon-preflight → unit → coverage → browser. It MUST stream output, stop at the
  first failure, print `FAIL <gate> (exit <code>)` plus an output tail, exit with
  the failing gate's own code, apply a per-gate timeout that names the gate, and
  support documented `--only` / `--from` selectors.

- [ ] **T5.** Add the reviewed allow-list for `orphan-check` containing exactly
  the three documented entry points (`src/main.ts`,
  `src/rendering/MeshWorkerEntry.ts`, `src/worldgen/WorldgenWorkerEntry.ts`),
  each with a comment justifying why it has zero importers. The wired gate MUST
  fail on any zero-importer file not in the list.

- [ ] **T6.** Add `tests/unit/GateWiring.test.ts` covering: script-to-npm-script
  reference completeness (no unexposed verification script); `verify:all` gate
  order matches the documented order; every npm script referenced by `verify:all`
  exists; every gate name is unique.

- [ ] **T7.** Wire the three fast invariant gates into the CI `gate` job,
  immediately after `validate-state` and before `typecheck`, with step names that
  identify the invariant (not just the script file).

- [ ] **T8.** Prove each wired gate fails on a synthetic violation, each in a
  **throwaway worktree** (never the primary tree):
  1. add a tracked file with no manifest row → `verify:file-audit` non-zero,
     names the file;
  2. add a source file with no importer → `verify:orphans` non-zero, names the
     file, and the three allow-listed entry points still pass;
  3. write an unsafe `.mcp.json` (an `@latest` pin plus a `secrets` key) →
     `verify:mcp` non-zero, names the entry;
  4. restore each file afterwards and confirm the gate returns to exit 0.

- [ ] **T9.** Prove the aggregate command: on a clean tree every mandatory gate
  prints PASS and the command exits 0; in a throwaway copy with an early-gate
  failure (e.g. a deliberate type error) it stops at `typecheck`, prints
  `FAIL typecheck (exit <code>)`, and does not report success for any later gate.

- [ ] **T10.** Documentation: add a "Verification gates" catalogue to
  `ONBOARDING.md` (script name, purpose, blocking status, individual invocation);
  update `AGENTS.md` "Baseline verification" to reference `npm run verify:all`
  while keeping the explicit command list.

- [ ] **T11.** Update the file-audit manifest for the new/changed files and run
  `npm run verify:file-audit` to PASS.

- [ ] **T12.** Full mandatory gate on the candidate SHA: `npm run validate-state`,
  `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `node scripts/check-release-bundle.mjs`, `npm run test:e2e`. Lint MUST stay at
  0 errors; the 85 pre-existing warnings MUST NOT increase. Record the canonical
  CI run and job ids.

- [ ] **T13.** Documentation and state: add the post-terminal row to
  `CHANGE_SEQUENCE.md`; record the wiring table and each gate's exit code in
  `verification.md`; update `openspec/PROGRAM_STATE.json` / `.md` at activation
  with `session_start_head` / `published_head`.

- [ ] **T14.** Final reconciliation and publication: re-read all artifacts against
  the implemented result, confirm every MUST/SHALL in
  `specs/gate-automation/spec.md` has evidence (especially T6's completeness
  assertions and T8's four synthetic failures), confirm 100% checkbox
  completion, inspect the diff for unrelated changes, commit, push to
  `origin/main`, verify the remote head, report `published_head`.
