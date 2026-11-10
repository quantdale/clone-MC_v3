# Proposal: 305-repository-cleanup-and-maintenance

## Problem

The repository is functionally healthy (5825 unit tests, 144/144 browser journeys,
all four coverage thresholds, lint 0 problems on the verified tip
`4323007f`), but a repository-wide maintenance pass found eight concrete defects
that survive every gate:

1. **The authoritative CI is red.** Run `39806388101` (push of `4323007f`) fails the
   `gate` job at the step "Full dependency audit (block high/critical)". The
   cause is a locked dev-toolchain `vite` version inside a published high-severity
   advisory range. Every other job is green, so this is a pure toolchain defect —
   but it means the reproduced handoff tip is not a green build.
2. **33 exported symbols in `src/` had exactly one occurrence in the entire repository**
   (their own declaration): dead exports that no source file, test, or script
   imports. A subset are pure numeric/type aliases with no OpenSpec contract;
   another subset are superseded alternate implementations that the live path
   never calls (wither-skull explosion helpers replaced by `Game.applyWitherExplosion`,
   translucency stream helpers replaced by `WorkerMeshing`, `chunkLifecycleName`
   with no consumer).
3. **Six storage modules carry a byte-identical duplicated `promisifyRequest`
   helper** (and `GamePersistence` a seventh copy named `awaitRequest`), so a
   hardening fix to IndexedDB request rejection has to be applied seven times.
4. **`isFinitePosition` and `isValidRelativePath` are duplicated verbatim** in two
   movement modules and two manifest modules respectively.
5. **A change package exists twice**: `openspec/changes/256-production-readiness-hardening`
   is byte-identical to `openspec/changes/archive/2026-08-31-256-production-readiness-hardening`.
   Two authoritative copies of one change is exactly the ambiguity the state
   validator exists to prevent.
6. **`playwright.253.config.ts` is an obsolete duplicate** of `playwright.config.ts`
   (a port-4174 clone) referenced only by the archived 253 narrative and no npm
   script, workflow, or test.
7. **`verify:orphans` prints its orphan census and never fails.** `ONBOARDING.md`
   gate 8 documents "No new source file has zero importers (allow-list: the three
   real entry points)", but `scripts/orphan-check.mjs` has no allow-list and no
   non-zero exit path, so the invariant the gate catalogue promises is unenforced.
8. **`PARITY_MATRIX.md` claims "every numbered change 001–297 appears in exactly
   one row" while `PROGRAM_STATE.json` records changes 298–304 as VERIFIED.** The
   matrix is the parity record every release claim cites, and the seven latest
   verified changes are absent from it.

## Goals

- Restore a green dependency-audit gate on the current toolchain without changing
  any product behaviour, any threshold, or any test.
- Delete provably unreferenced exports that carry no OpenSpec contract, and keep
  every documented API type.
- Collapse the duplicated helpers onto one authoritative implementation each.
- Remove the duplicate change package and the obsolete Playwright config.
- Make `verify:orphans` enforce the allow-list the gate catalogue documents.
- Bring `PARITY_MATRIX.md`, `ONBOARDING.md`, `PROGRAM_STATE.json/.md` and the
  file-audit manifest back into agreement with the repository.
- Add the reverse check `scripts/orphan-check.mjs` needs to its own unit test so a
  future regression fails a test rather than passing silently.

## Non-goals

- No gameplay, rendering, persistence, protocol, or save-format change.
- No visual-golden change; the matrix must keep matching its committed set.
- No change to coverage thresholds, test counts, or ESLint strictness.
- No refactor of `src/engine/Game.ts` (audit finding F-006's composition-root
  debt) — that is a separate, larger change with its own spec.
- No re-pin of any golden, no headed GPU work, no Change 258 work.
- No removal of historical documentation (`FULL_AUDIT_REPORT.md`, `NEXT_CAMPAIGN.md`,
  master plans, `prompt.txt`, `deep review resolve.txt`): they are cited history.
- No deletion of `tests/visual-golden/win32-local/` (change 300 T13 decision).
- No upgrade that crosses a major version, and no "fix" of the dev-only moderate
  advisories that require an unreleased upstream (`typescript-eslint > 8.72.2`).

## Preconditions

- Authoritative remote `origin` verified current (`origin/main` == local HEAD at
  session start `4323007f2e517ddeb5665f1f93faf295baf17fe1`).
- Change 304 is VERIFIED and advancement is allowed (`PROGRAM_STATE.json`).
- Baseline gates green locally: `verify:deps`, `validate-state`, `typecheck`,
  `lint`, `npm test` (485 files / 5825 passed + 1 skipped), `npm run test:e2e`
  (144/144), coverage 91.84/88.6/94.68/93.19 vs the 91/88/94/93 floors.

## Dependencies

- `npm ci` remains the only supported install (change 299).
- `npm run verify:deps` must pass after any manifest change.
- The file-audit manifest (`openspec/hardening/2026-08-23-exhaustive-repository-certification/`)
  must stay a bijection with `git ls-files`.

## Proposed change

1. Toolchain: `vite` `^6.4.3` → `^6.4.6`, `vitest` and `@vitest/coverage-v8`
   `^4.1.11` → `^4.1.12`, regenerated through `npm ci`. This is a patch-level
   dev-toolchain move that clears every high-severity advisory; it removes the
   `@vitest/mocker` advisories and leaves only the dev-only `minimatch` chain that
   the repository's documented high/critical-only policy already tolerates.
2. Dead-export removal for the provably unreferenced, non-contracted symbols
   (exact list fixed in `design.md`).
3. One `promisifyRequest` in `src/storage/WorldMetadataRepository.ts`, imported by
   the five sibling repositories and by `GamePersistence` (renaming `awaitRequest`).
4. One `isFinitePosition` in a shared movement module, imported by both movement
   modules; one `isValidRelativePath` in a shared pack-manifest module, imported by
   both manifests.
5. Delete `openspec/changes/256-production-readiness-hardening` (the archived copy
   remains authoritative) and `playwright.253.config.ts`.
6. `scripts/orphan-check.mjs` gains a reviewed allow-list and exits 1 on any
   unexpected orphan; `tests/unit/VerificationGateWiring.test.ts` (or a focused
   sibling test) pins both the allow-list contents and the failure path.
7. Documentation/state sync: `PARITY_MATRIX.md` gains C298–C304 rows and a
   corrected coverage statement; `ONBOARDING.md` names the locked coverage provider
   version 4.1.12; the file-audit manifest is regenerated for the resulting tree;
   `PROGRAM_STATE.json`/`.md` record this change.

## Compatibility and migration

- No stored data, wire format, save schema, or public browser API changes.
- Exported TypeScript symbols removed are provably imported by nothing; `src/` is
  not a published package (`"private": true`), so their removal cannot break an
  external consumer.
- Dev dependency patch versions are lockfile-pinned; CI installs with `npm ci`.

## Risks

| Risk | Mitigation |
|---|---|
| Deleting an export that is reached dynamically (reflection, string lookup) | Each deletion candidate was found by a whole-repository word census and additionally re-checked with `git grep` in `src`, `tests`, `scripts`; no `import()` or string-keyed construction exists for these symbols (verified per symbol). |
| A dev-dependency patch bump changes coverage numbers | Coverage is re-measured after the upgrade; the four floors are unchanged and must still pass. |
| `verify:orphans` becomes a false-positive gate | The allow-list contains exactly the three real entry points already printed today; the failure path is proven on a real temporary orphan. |
| Helper consolidation subtly changes IndexedDB error semantics | The consolidated implementation is byte-identical to the duplicated bodies; the storage test suites (save/recovery/archive) must stay green. |

## Rollback strategy

Each batch is an independent commit; reverting any single commit restores the prior
behaviour because no batch changes a contract the others depend on.

## Definition of Done

- `npm audit --audit-level=high` exits 0 and `npm audit --omit=dev` exits 0.
- `npm run verify:deps`, `validate-state`, `typecheck`, `lint` exit 0 (lint stays
  0 problems).
- `npm test` reports 485 files / 5825 passed + 1 skipped or more, with no failures.
- `npm run test:coverage` holds all four thresholds.
- `npm run build` + `check-release-bundle` pass.
- `npm run verify:file-audit` passes on the resulting tree.
- `npm run verify:orphans` passes and is proven to fail on a synthetic orphan.
- `npm run test:e2e` passes 144/144 with no golden change.
- `PARITY_MATRIX.md` covers C001–C304 bijectively and its summary counts agree.
- State files, tasks, verification evidence, and the manifest all agree with the
  published tree.

## Advancement gate

100% of tasks complete, every requirement scenario evidenced, the full mandatory
gate green, and publication verified on `origin/main`. Change 258 stays BLOCKED.
