# Verification: 306-unreferenced-source-gate-correctness

Status: ACTIVE — NOT VERIFIED
Completion: 5/7 (71.428571%)
Advancement allowed: false
Session start head: `350b557a090b01c2d5d5574fb7ae9aa1e6fc52c3` (local and remote `main` matched after fetch and `git ls-remote`; worktree clean).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| R1 | Baseline real guard incorrectly exits 0 for an orphan referenced only in a comment; fixture under `_AgentArtifacts/tryMC_v3/sessions/20261113-pi-repo-audit/orphan-fixture`. New real-script comment/string and supported-syntax tests fail before and pass after implementation. | FOCUSED PASS |
| R2 | Real-script fixture covers `.ts`, `.js`, index, missing and bare package imports. | FOCUSED PASS |
| R3 | Real-script fixtures cover parse error, deleted tracked file, missing root flag and non-Git root. | FOCUSED PASS |
| R4 | Corrected real-tree guard passes; full gate failed in browser. | NOT VERIFIED |
| R5 | Statistics browser test failed 8/10, followed by 3/3 instrumented failures: captured target (0,32,-3) remained block 4 while current target was (0,31,-2), grounded true, blocks_broken 0. After waiting for landing and two targeting frames, 10/10 repeated real-browser journeys pass with exact-block, counter, panel and reload assertions retained. | FOCUSED PASS |
| R6 | Two deterministic real-queue tests failed before the fix: a later re-mark vanished and a later cleared entry was still written. After checking current entry identity and epoch before deletion, `DirtySaveQueue`, `SaveRecoveryMatrix`, and `AutosaveCoordinator` pass 29/29. Full gate remains pending. | FOCUSED PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run verify:deps` | PASS | 171 packages; first baseline command. Node 24.3.0 / npm 11.4.2. |
| `npm run validate-state`, `npm run verify:file-audit`, `npm run verify:orphans`, `npm run verify:mcp`, `npm run verify:visual-goldens`, `npm run typecheck`, `npm run lint` | PASS | On starting tree; file audit 3087 rows. |
| `npm test` | PASS | 486 files, 5830 passed, 1 skipped; negative-fixture diagnostic output is expected. |
| `npm run build` | PASS | 266 modules; main 754.81 kB; existing chunk warning. |
| `node scripts/check-release-bundle.mjs` | PASS | Four assets checked. Initial mistaken `npm run check:release-bundle` failed because that npm script does not exist; corrected invocation passed. |
| `npm audit --audit-level=high`, `npm audit --omit=dev` | PASS | Seven moderate development advisories, zero production vulnerabilities. |
| `npm run test:perf:multiplayer` | PASS | Isolated: 438.7 TPS / 2735.2 ms; one test passed. |
| `node scripts/orphan-check.mjs --root <fixture>` | DEFECT REPRODUCED | `src/Dead.ts` has only a commented-out import from `src/main.ts`; reports PASS exit 0. |
| `node node_modules/vitest/vitest.mjs run tests/unit/OrphanGateEnforcement.test.ts` | PASS after fix | Before fix: 4 failed / 5 passed, covering comment/string false passes, unsupported actual import syntax, path resolution and syntax errors. After fix: 9/9 passed. |
| `npm run verify:orphans`, `npm run lint`, `npm run typecheck` | PASS after fix | 387 source files; 2/3 importer-free allowed because `MeshWorkerEntry.ts` now has a recognized syntactic importer, not because the entry is missing. No allow-list change. |
| `npm run validate-state`, `npm run verify:file-audit` | PASS after activation | State coherent; 3092 manifest rows including 5 new change artifacts. |
| `npm run verify:all` | FAIL at browser | Earlier gates through coverage passed; coverage 91.92/88.65/94.90/93.27. Browser 142 passed, 2 failed (34.6 min): `persistence.spec.ts:580` expected pending queue 0, received 1 after flush committed 119; `statistics.spec.ts:157` block-break wait timed out after 15 seconds. Visual matrix passed. Full captured output: `_AgentArtifacts/tryMC_v3/sessions/20261113-pi-repo-audit/verify-all.log`. No full-gate pass claimed. |
| Playwright `persistence.spec.ts -g 'churn across 150 distinct chunks' --repeat-each=5 --workers=1` | 5/5 PASS | Before save-queue fix; does not explain initial pending-count failure. |
| Same churn case `--repeat-each=15 --workers=1` | 15/15 PASS | After save-queue fix, with temporary pending-key diagnostic that never triggered; diagnostic removed. The original failure remains unexplained; no causal link to the separate queue race is claimed. |
| Playwright `statistics.spec.ts -g 'walk/jump/break bump stats' --repeat-each=10 --workers=1` | Before: 8 FAIL / 2 PASS; after: 10 PASS | Instrumented diagnosis 3/3 failures: original (0,32,-3), later target (0,31,-2), original block 4, no mined statistic. Wait for grounded and two render frames after aiming; real mining assertions retained; debug logging removed. |
| `vitest run tests/unit/DirtySaveQueue.test.ts -t 'later batch entry'` | Before: 2 FAIL | Newer B(v2) was deleted before epoch check; cleared B was still written. |
| `vitest run tests/unit/DirtySaveQueue.test.ts tests/unit/SaveRecoveryMatrix.test.ts tests/unit/AutosaveCoordinator.test.ts` | PASS after fix | 3 files / 29 tests; typecheck and lint also PASS. |

## Edge/adversarial validation

The commented-import fixture proves the pre-existing checker falsely passes. Synthetic Git fixtures cover comments, strings, seven real import forms, explicit extensions, index paths, missing/package references, malformed syntax, missing tracked files, missing flag and non-Git root. Separately reproduced and fixed a save-queue race in which a stale captured batch entry deleted a newer pending snapshot or wrote an entry cleared during an earlier write.

## Migration/compatibility validation

No gameplay or save-format change. DirtySaveQueue preserves newer pending data and respects clearing; existing in-flight write and failure recovery behavior is covered by focused suites.

## Performance/resource validation

Not yet measured for the corrected checker. Baseline isolated multiplayer performance recorded above.

## Regressions

Full browser gate failed two tests. Statistics target-capture race was diagnosed and corrected with 10/10 focused passes. Persistence churn passed 5/5 before and 15/15 after the queue fix; its original pending-count failure is not explained, and the separately discovered queue race is not asserted to be its cause. Full gate must be rerun; temporary diagnostic removed.

## Incomplete tasks

T6–T7 are open. The change is not verified and advancement is forbidden.

## Advancement Exception

Not applicable.

## Final decision

ACTIVE. Next: investigate the two browser failures from the full gate, distinguish product defects from test defects with direct evidence, then rerun the full gate and publish. Change 258 remains BLOCKED; no headed GPU evidence claimed.
