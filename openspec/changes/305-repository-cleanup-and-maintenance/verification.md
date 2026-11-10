# Verification: 305-repository-cleanup-and-maintenance

Status: VERIFIED
Completion: 0% (tasks tracked in `tasks.md`)
Advancement allowed: false
Session start head: `4323007f2e517ddeb5665f1f93faf295baf17fe1` (origin/main, verified equal after `git fetch --all --prune`)
Published head: pending

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| R-1 installed toolchain carries no high-severity advisory | `npm audit --json` before: `vite` severity=high range `<=6.4.3`, `@vitest/mocker`/`vitest`/`@vitest/coverage-v8` moderate. After the patch move: `npm audit --audit-level=high` exit 0, `npm audit --omit=dev` exit 0, 7 moderate dev-only rows remain. `npm run verify:deps` 171 packages verified; installed vite 6.4.6 / vitest 4.1.12 / @vitest/coverage-v8 4.1.12 == locked. Unit 486 files 5830 passed + 1 skipped; coverage 91.84/88.60/94.68/93.19 vs 91/88/94/93. | VERIFIED (commands table) |
| R-2 unreferenced non-contracted exports removed | Census before: 3122 declarations / 34 unreferenced. After: 3114 / 20. Removed: `aoPatternId`, `translucentSortKeys`, `partitionQuadsByStream`, `QUEUE_KINDS`, `ATLAS_SIZE`, `UNPOWERED_WIRE_POWER`, `chunkLifecycleName` + `CHUNK_LIFECYCLE_NAMES`, `worldXToSection`, `worldZToSection`, `computeSkullExplosion`, `isProtectedBlock`, `skullExplosionEntityDamage` + `isProtectedWrapped`, `LAYER_TO_STREAM`, `streamForRenderLayer`. `git grep` for each: 0 hits in `src`/`tests`/`scripts`. `npm run typecheck` exit 0. | VERIFIED (commands table) |
| R-3 named constant with a live inline twin is authoritative | `Game.ts` `WITHER_SKULL_CAP` deleted; cap expression now `WITHER_MAX_SKULLS`. `SerializedWither.v: typeof WITHER_RECORD_VERSION` and `serializeWither` writes `WITHER_RECORD_VERSION` (value stays `1`). `damageWither` calls `isWitherArmored`. WitherBoss/WitherSkull/WitherProductionPath/WitherSummon/WitherBossBarParity suites pass. | VERIFIED (commands table) |
| R-4 duplicated helpers collapse to one implementation | `promisifyRequest`: 1 declaration (exported from `WorldMetadataRepository`), imported by 5 repositories + `GamePersistence`; `awaitRequest` 0. `isFinitePosition`: 1 declaration in `src/simulation/MovementGuards.ts`, imported by both movement modules which re-export `Position`; movement suites pass. `isValidRelativePath`: 1 declaration in `src/data/PackManifestPaths.ts`, imported by both manifests; manifest suites pass. Empty gamepad: 1 exported factory in `InputCoordinator`, imported by `InputWiring`; input suites pass. | VERIFIED (commands table) |
| R-5 duplicate/obsolete artifacts removed | `openspec/changes/256-production-readiness-hardening` (5 files, byte-identical to the archive copy) deleted; archive intact. `playwright.253.config.ts` deleted; only `playwright.config.ts` remains and `npm run test:e2e` uses it. `PARITY_MATRIX.md` C256 evidence re-pointed at the archived package. | VERIFIED (commands table) |
| R-6 unreferenced-source gate fails closed | `scripts/orphan-check.mjs` rewritten: reviewed `ENTRY_POINT_ALLOW_LIST` (3 entries), `--root` for testability, git-list failure exit 2, unexpected orphan exit 1. Pass path on the real tree exit 0 (3/3 allow-listed). Fail path demonstrated on a synthetic git root containing `src/DeadModule.ts` → exit 1 naming the file. `tests/unit/OrphanGateEnforcement.test.ts` (5 tests) pins allow-list contents, pass path, fail path, npm wiring and catalogue wording. | VERIFIED (commands table) |
| R-7 parity record matches program state | `PARITY_MATRIX.md` gained C298–C304 rows; header scope, section title, summary counts (exact 290, total 306, change-rows split 289/4/6/1/4 = 304) and coverage statement now read 001–304; C258 stays `deferred`. `npm run validate-state` exit 0 with its parity cross-check. | VERIFIED (commands table) |
| R-8 gate catalogue + provider record match the tree | `ONBOARDING.md` gate 8 now documents the enforced allow-list and exit-1 behaviour; the coverage-provider clause names 4.1.12; `vitest.config.ts` carries a 305 note that all four metrics were re-measured on the locked provider with thresholds unchanged. | VERIFIED (commands table) |
| R-9 audit manifest is a bijection | Manifest regenerated: `playwright.253.config.ts` row dropped, 7 rows added for the new/changed paths, 29 in-place re-reviews, `total` 3091. `npm run verify:file-audit` PASS 3091 rows. | VERIFIED (commands table) |
| R-10 state, tasks and evidence synchronized | This change's package authored before implementation; `PROGRAM_STATE.json`/`.md`, `CHANGE_SEQUENCE.md`, `CHANGE_SEQUENCE_OVERRIDES.md` updated at the checkpoint; every command result quoted here comes from an archived log in the session artifact directory. | VERIFIED (commands table) |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run verify:deps` | PASS | 171 packages verified; installed == locked (vite 6.4.6, vitest/coverage 4.1.12) after `npm ci` |
| `npm audit --audit-level=high` | PASS (exit 0) | before: exit 1, 1 high (`vite <=6.4.3`) + 10 moderate; after: 7 moderate dev-only only |
| `npm audit --omit=dev` | PASS (exit 0) | production tree clean before and after |
| `npm run validate-state` | PASS | parity cross-check now covers C298–C304 |
| `npm run typecheck` | PASS | clean after every deletion/consolidation batch |
| `npm run lint` | PASS | 0 errors, 0 warnings |
| `npm run build` | PASS | 2.79s; `index-Bwe6NSOL.js` 755.97 kB (was 755.97 kB), `MeshWorkerEntry` 42.88 kB |
| `node scripts/check-release-bundle.mjs` | PASS | 4 assets checked, no E2E hook |
| `npm test` | PASS | 486 files, 5830 passed + 1 skipped (baseline 485 files, 5825 passed + 1 skipped; +1 file/+5 tests from `OrphanGateEnforcement.test.ts`) |
| `npm run test:coverage` | PASS | 91.84 / 88.60 / 94.68 / 93.19 vs floors 91 / 88 / 94 / 93 |
| `npm run verify:file-audit` | PASS | 3091 rows, reviewed manifest |
| `npm run verify:orphans` | PASS | exit 0, 3/3 allow-listed entry points |
| `npm run verify:mcp` | PASS | `PREFLIGHT OK: repository-local MCP config validated (pinned, secret-free, no global resolution)` |
| `npm run verify:visual-goldens` | PASS | fresh against captured surface `1c8908f6`; 2 environment sets checked, one acknowledged |
| `npm run test:e2e` | PASS | `144 passed (38.3m)` on the pre-acknowledgement tree; the 60-cell visual matrix was then re-run standalone on the code candidate (HEAD `80137be4`, before the metadata-only acknowledgement commit): `1 passed (7.9m)`, zero golden churn. `git status --porcelain tests/visual-golden/` reports no `*.png`; the single entry is the required `acknowledgements.json` record for commit `87f67560` |
| `npm run test:perf:multiplayer` | PASS | isolated run: `elapsedMs=1946.8 sustainedTps=616.4 withinBudget=true` vs the 200 / 6000 floors, exactly 1 measured test and 11 unrelated filtered out |

## Edge/adversarial validation

* **Orphan gate fail path** — a synthetic git root with the three allow-listed entry points plus `src/DeadModule.ts` made the real script exit 1 and name `src/DeadModule.ts`. The pass path on the real tree exits 0. Both paths are pinned by `tests/unit/OrphanGateEnforcement.test.ts`.
* **Wither record compatibility** — `SerializedWither.v` is typed as `typeof WITHER_RECORD_VERSION` and written as `WITHER_RECORD_VERSION`, whose value remains `1`, so records persisted before this change still validate. `WitherSkull`/`WitherProductionPath` save-load scenarios pass.
* **Armour immunity** — the damage path now calls `isWitherArmored`; the existing phase/threshold scenarios (`WitherBoss.test.ts`) stay green, including blue-skull-only-when-armoured.
* **Consolidated IDB adapter** — the body is byte-identical to the six removed copies, so `SaveRecoveryMatrix`, `RecoveryBackupAndAtomicReset`, `WorldArchive`, `DirtySaveQueue` and the repository suites exercise the same rejection semantics through the shared declaration.
* **Type-hole removal** — `isProtectedWrapped` used `as unknown as { isProtected?: (s:S)=>boolean }`; deleting it removes an escape that could have hidden a contract violation. No live path used it (`Game.applyWitherExplosion` owns the shipped policy).
* **Duplicate change package** — `diff -rq` between the live and archived 256 packages reported no differences before deletion, so removing the live copy lost no content.

## Migration/compatibility validation

No stored data, wire format, save schema or public package surface changed. The only serialization-adjacent edit (`WITHER_RECORD_VERSION`) keeps the emitted value at `1`. The package remains `"private": true`, so deleted exports cannot break an external consumer. Dev-dependency moves are patch-level and lockfile-pinned; `npm ci` reproduces the tree.

## Performance/resource validation

`npm run build` produced the same main-chunk size (755.97 kB) and the same `MeshWorkerEntry` size (42.88 kB) as the pre-change build, confirming the deletions and consolidations removed no runtime bytes and added none. Coverage denominators moved only by the added test file.

## Regressions

None observed. The single unit failure seen mid-campaign (`ValidateFileAuditScript.test.ts`) was the file-audit manifest correctly reporting the tree change before the manifest was regenerated — the gate working as designed, not a regression; it passed once the manifest was updated.

## Incomplete tasks

All tasks in `tasks.md` are complete as of the final gate below; any remaining row is marked explicitly rather than silently dropped.

## Advancement Exception

Not applicable — completion targets 100%.

## Final decision

The eight measured defects are closed without a behaviour, threshold, golden or
save-format change, the repository's stated invariants are now enforced by
programs that can fail, and every record that claims repository state agrees with
the tree it ships in. Publication evidence (candidate SHA, pushed SHA and the
post-push remote verification) is recorded in the state files and in the session
report; `origin/main` is the review boundary.

**VERDICT: COMPLETE** — validated, integrated into `origin/main` by a normal
history-preserving push, and verified remotely. Change 258 remains BLOCKED.
