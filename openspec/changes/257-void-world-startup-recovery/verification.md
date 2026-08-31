# Verification: 257-void-world-startup-recovery

Status: NOT VERIFIED
Completion: 0%
Advancement allowed: false

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Startup compatibility decision | Not run/implemented | PENDING |
| No playable simulation over unverified void | Not run/implemented | PENDING |
| Baseline-aware spawn surface | Not run/implemented | PENDING |
| Baseline-aware readiness | Not run/implemented | PENDING |
| Safe persisted-player restore | Not run/implemented | PENDING |
| Non-destructive in-product recovery | Not run/implemented | PENDING |
| World-scoped reset | Not run/implemented | PENDING |
| Real IndexedDB legacy/unsupported browser coverage | Not run/implemented | PENDING |
| Fresh-world regression preservation | Not run/implemented | PENDING |
| Visual proof of terrain/recovery/post-reset | Not run/implemented | PENDING |
| Accepted-risk revalidation | Not run | PENDING |
| Full mandatory regression gate including E2E | Not run | PENDING |
| OpenSpec/GitHub state truth | Not reconciled | PENDING |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | NOT RUN | |
| `npm run lint` | NOT RUN | |
| `npm test` | NOT RUN | |
| `npm run build` | NOT RUN | |
| `npm run test:e2e` | NOT RUN | Mandatory; smoke substitution forbidden |
| visual-regression command(s) | NOT RUN | |
| `node scripts/validate-state.mjs` | NOT RUN | |
| file-audit/orphan-check | NOT RUN | |
| release/performance gate if required by current policy | NOT RUN | |

## Original-defect reproduction

Pending. The implementation session must record the exact persisted fixture and either a direct browser reproduction of no-block/free-fall or a deterministic characterization proving the unsafe contradictory startup state.

## Edge/adversarial validation

Pending:
- missing metadata version;
- unsupported future version;
- partial canonical columns;
- sparse edits without baseline;
- persisted player above missing terrain;
- corrupt/failed metadata and column reads;
- reset partial failure;
- backup/export failure;
- reload after recovery;
- fresh/current world equivalence.

## Migration/compatibility validation

Pending. No old metadata may be silently stamped current.

## Performance/resource validation

Pending. Startup checks must remain bounded and resource lifecycle must converge after recovery/reload.

## Visual validation

Pending deterministic screenshots:
1. fresh current terrain;
2. recovery-required overlay;
3. post-reset terrain.

## Regressions

Unknown until full final gate.

## Incomplete tasks

67/67 incomplete at authoring.

## Advancement Exception

Not permitted for startup/persistence/migration/data-loss/worldgen-compatibility/spawn/readiness/browser-E2E/publication-truth requirements.

## Final decision

NOT VERIFIED.
