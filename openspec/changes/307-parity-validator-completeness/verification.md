# Verification: 307-parity-validator-completeness

Status: ACTIVE — NOT VERIFIED
Completion: 4/6 (66.666667%)
Advancement allowed: false
Starting head for this change: `2031fededbc2597ce80e9eab7967d8d013fd625c` (local and remote main verified equal; clean tree). Session start head: `350b557a090b01c2d5d5574fb7ae9aa1e6fc52c3`.

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| R1 | Copied real state/matrix with verified C305 removed and summary adjusted: real validator exited 0 before, exits 1 naming C305 after. Fixtures cover last-completed during ACTIVE, verified current, historical and non-VERIFIED row. | FOCUSED PASS |
| R2 | Copied real matrix with bold total changed from 308 to 1: real validator exited 0 before, exits 1 naming the mismatch after. Fixtures cover plain/bold, missing, nonnumeric, duplicate and incorrect totals and category counts. | FOCUSED PASS |
| R3 | Existing synthetic no-matrix suite passes; new tests keep 001–250 and duplicate guards and accept deferred C258. Real `validate-state` passes. Full gate pending. | FOCUSED PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `git ls-remote origin refs/heads/main` | PASS | Remote matches `2031fededbc2597ce80e9eab7967d8d013fd625c`; clean worktree at change start. |
| `node scripts/validate-state.mjs --root <fixture>` | FALSE PASS | Real copied state with C305 removed and matching reduced summary passes. |
| `node scripts/validate-state.mjs --root <fixture>` | FALSE PASS | Real copied state with `**Total rows**` changed from 308 to 1 passes. Fixtures under `_AgentArtifacts/tryMC_v3/sessions/20261113-pi-repo-audit/parity-fixture`. |
| `npm run verify:all` | PASS, prior change | At `77995128071a90e16392d3c3741b28b02e5ad62c`: 13 gates, 5836 unit + 1 skipped, coverage 91.93/88.66/94.90/93.28, 145/145 browser. This predates 307. |
| `npm run test:perf:multiplayer` | PASS, prior change | 818.1 TPS / 1466.9 ms, isolated; predates 307. |
| `npm run validate-state`, `npm run verify:file-audit` | PASS | Active state coherent; manifest 3097 rows after adding the five 307 artifacts. |
| `vitest run tests/unit/ValidateStateInvalidStates.test.ts -t 'parity state validation (307)'` | BEFORE: 9 FAIL / 2 PASS | Missing verified rows and six missing, malformed, duplicate or incorrect summary cases falsely passed. |
| `vitest run tests/unit/ValidateStateInvalidStates.test.ts tests/unit/ValidateStateScript.test.ts` | AFTER: 35/35 PASS | Includes expanded negative fixtures, bold category/total positives, original 001–250 and duplicate checks, C258 deferred and optional matrix compatibility. |
| `npm run validate-state`, `npm run verify:file-audit`, `npm run typecheck`, `npm run lint` | PASS after fix | Real state, manifest 3097, TypeScript and lint. |
| `node scripts/validate-state.mjs --root <fixture>` | PASS as negative test | Previously false-green real copied fixtures now both exit 1 naming missing C305 and total mismatch respectively. |

## Edge/adversarial validation

The actual CLI passed two deliberately corrupted copied matrices before the fix and rejects both afterwards. New synthetic subprocess tests cover verified current, last-completed during active, historical and non-VERIFIED status, bold/plain summary values, missing/duplicate/malformed/incorrect totals and categories, and preservation of legacy/blocked checks.

## Migration/compatibility validation

No gameplay or user data changes; optional no-matrix synthetic fixtures and deferred C258 remain accepted.

## Performance/resource validation

The validator remains a linear state/matrix scan; real state and focused subprocess tests passed. Full gate pending.

## Regressions

Focused state-validator suites, typecheck and lint pass; mandatory full gates have not run on 307.

## Incomplete tasks

T5–T6 remain open; no advancement.

## Advancement Exception

Not applicable.

## Final decision

ACTIVE. Run full mandatory gates and isolated multiplayer performance, then review and publish. Change 258 remains BLOCKED; no headed GPU evidence claimed.
