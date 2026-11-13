# Verification: 306-unreferenced-source-gate-correctness

Status: VERIFIED
Completion: 7/7 (100%)
Advancement allowed: true
Published verification checkpoint: `e2ea4669924c3464517a174ca2256844d95b97aa` (normal push, remote head verified); the final state-only closure follows it.
Session start head: `350b557a090b01c2d5d5574fb7ae9aa1e6fc52c3` (local and remote `main` matched after fetch and `git ls-remote`; worktree clean).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| R1 | Baseline real guard incorrectly exits 0 for an orphan referenced only in a comment; fixture under `_AgentArtifacts/tryMC_v3/sessions/20261113-pi-repo-audit/orphan-fixture`. New real-script comment/string and supported-syntax tests fail before and pass after implementation. | PASS |
| R2 | Real-script fixture covers `.ts`, `.js`, index, missing and bare package imports. | PASS |
| R3 | Real-script fixtures cover parse error, deleted tracked file, missing root flag and non-Git root. | PASS |
| R4 | Corrected real-tree guard passes unchanged allow-list; final full gate passes all 13 steps and 145 browser tests. | PASS |
| R5 | Statistics browser test failed 8/10, followed by 3/3 instrumented failures: captured target (0,32,-3) remained block 4 while current target was (0,31,-2), grounded true, blocks_broken 0. After waiting for landing and two targeting frames, 10/10 repeated real-browser journeys pass with exact-block, counter, panel and reload assertions retained. | PASS |
| R6 | Two deterministic real-queue tests failed before the fix: a later re-mark vanished and a later cleared entry was still written. After checking current entry identity and epoch before deletion, `DirtySaveQueue`, `SaveRecoveryMatrix`, and `AutosaveCoordinator` pass 29/29. | PASS |
| R7 | A controlled browser probe produced `{committed:119,failed:0}` then enqueued a player snapshot, observing pending count 1 and key `player-state|world-20260821`; the former later-count assertion failed as expected. The churn test now asserts the flush's own `failed` result and retains all 150 reload checks; the dedicated enqueue/second-flush test plus churn passed 6/6 over three repeats. The precise original failure cause remains unproven. | PASS |

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
| `npm run verify:all` at `bcc56ced1426f35111046b328f8f6e221b6f9bf1` | PASS | All 13 gates: `verify:deps`, `validate-state`, `typecheck`, `lint`, `build`, `check-release-bundle`, `verify:file-audit`, `verify:orphans`, `verify:mcp`, `verify:visual-goldens`, `npm test` (486 files, 5836 passed + 1 skipped), `test:coverage` (91.93/88.66/94.90/93.28), `test:e2e` (144/144, 60-cell visual matrix). Raw log `_AgentArtifacts/tryMC_v3/sessions/20261113-pi-repo-audit/verify-all-rerun.log`. |
| `npm run test:perf:multiplayer` after full gate | PASS | Isolated, one measured test: 840.7 TPS / 1427.4 ms. |
| Playwright persistence churn + new player-save boundary test, `--repeat-each=3 --workers=1` | PASS | 6/6; typecheck and lint pass. |
| `npm run verify:all` at `77995128071a90e16392d3c3741b28b02e5ad62c` | PASS | All 13 gates: `verify:deps`, `validate-state`, `typecheck`, `lint`, `build`, `node scripts/check-release-bundle.mjs`, `verify:file-audit` (3092), `verify:orphans`, `verify:mcp`, `verify:visual-goldens`, `npm test` (486 files, 5836 passed + 1 skipped), `test:coverage` (91.93/88.66/94.90/93.28), `test:e2e` (145/145, including 60-cell visual matrix). Raw log `_AgentArtifacts/tryMC_v3/sessions/20261113-pi-repo-audit/verify-all-final.log`. |
| `npm run test:perf:multiplayer` after final gate | PASS | Isolated, one measured test: 818.1 TPS / 1466.9 ms. |

## Edge/adversarial validation

The commented-import fixture proves the pre-existing checker falsely passes. Synthetic Git fixtures cover comments, strings, seven real import forms, explicit extensions, index paths, missing/package references, malformed syntax, missing tracked files, missing flag and non-Git root. Separately reproduced and fixed a save-queue race in which a stale captured batch entry deleted a newer pending snapshot or wrote an entry cleared during an earlier write.

## Migration/compatibility validation

No gameplay or save-format change. DirtySaveQueue preserves newer pending data and respects clearing; existing in-flight write and failure recovery behavior is covered by focused suites.

## Performance/resource validation

Final real-tree orphan gate completed in 1.8 seconds, below the 30-second test budget. Isolated multiplayer performance passed at 818.1 TPS / 1466.9 ms.

## Regressions

Initial full browser gate failed two tests. Statistics target-capture race was diagnosed and corrected with 10/10 focused passes. Persistence churn passed 5/5 before and 15/15 after the queue fix; its original failure cause remains unproven. A controlled enqueue proves the old post-flush pending-count assertion races with later player saves. The corrected assertion retains all 150 durable reload checks, and a new test proves the boundary; both pass 3 repetitions. A full 13-gate rerun passed 144/144 before this additional test change; the final tree subsequently passed 145/145. Temporary diagnostics were removed.

## Incomplete tasks

None. Reviewed implementation and tests, checked no visual-golden changes, validated state and the 3092-row manifest, and verified the normal publication of the implementation and evidence checkpoints to `origin/main`.

## Advancement Exception

Not applicable.

## Final decision

VERIFIED. All seven tasks and requirements pass; no advancement exception. Continue the broader user-requested repository audit. Change 258 remains BLOCKED; no headed GPU evidence claimed.
