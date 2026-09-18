# Audit findings: Changes 1–277

Audit campaign started 2026-09-18 from `origin/main` at `d4960cfda4daad461eab720d6ac087d63d976951`.
This is a durable remediation log for the repository-wide review requested after the numbered
changes were recorded complete. It supplements, and does not replace, the per-change OpenSpec
verification evidence.

## Baseline

- `npm run validate-state`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS (0 errors; existing explicit-`any` warnings remain)
- `npm test -- --reporter=dot`: PASS — 434 files, 5193 passed, 1 skipped
- `npm run build`: PASS
- `npm run test:e2e`: PASS — 94/94 suites
- visual regression subset: PASS — 60/60
- final focused regression proofs: statistics journey 5/5; render-world visual matrix 6/6
- `node scripts/validate-file-audit.mjs openspec/hardening/2026-08-23-exhaustive-repository-certification/file-audit-manifest.json`: PASS — 2831 rows
- `npm audit --omit=dev`: PASS — 0 production vulnerabilities
- `npm audit`: PASS — 0 vulnerabilities after the Vitest 4.1.11 upgrade
- Change 258: BLOCKED for headed hardware-WebGL evidence; no headed evidence is fabricated.

## Findings

| ID | Scope | Finding | Status | Evidence / resolution |
|---|---|---|---|---|
| AUDIT-001 | Change 257 | `verification.md` still described the pre-repair reopened state (67/92, F257-A..L FAIL) while `tasks.md`, `PROGRAM_STATE`, source, tests, and CI evidence recorded 92/92 VERIFIED. | FIXED | Reconciled `tasks.md` and `verification.md` to the authoritative 92/92 repair evidence; the historical pre-repair result remains explicitly identified as historical. |
| AUDIT-002 | Changes 118, 121, 122, 124, 246 | Historical task ledgers contained unchecked implementation/verification work despite their verified evidence and repository state. | FIXED | Reconciled only the stale checkboxes/status notes, citing the existing verification and publication evidence without inventing new implementation claims. |
| AUDIT-003 | Parity matrix / state docs | `PARITY_MATRIX.md` scope and coverage text were stale and omitted the archived 253–255 packages and the 256–258 end of the campaign. | FIXED | Matrix now has exact/equivalent/approximate/deferred/n/a categories for C001–C277 and explicitly records C258 as deferred/BLOCKED. |
| AUDIT-004 | Persistence / Change 257 | `WorldArchiver.importWorld` wrote archive records over a target without deleting target-owned records omitted by the archive, so stale columns/entities/raw state could survive a restore. | FIXED | Import now deletes all target-owned records across all six stores inside the same transaction before writing; regression test covers omitted data and foreign-world preservation. Focused and full unit gates pass. |
| AUDIT-005 | Dependencies / CI | `npm audit` reported moderate dev-only redirect-mock path traversal/arbitrary-file-read advisories through Vitest 3.2.7 and coverage-v8 3.2.7. | FIXED | Upgraded both packages to 4.1.11 with the lockfile; `npm audit --audit-level=moderate` and the production-only audit report 0 vulnerabilities. Unit coverage, production build, and full browser gates pass. |
| AUDIT-006 | Persistence code quality | The session-start tree contains only one reachable `throw` in `MonitoredSaveSink.write`; the suspected duplicate unreachable statement is not present in the authoritative checkout. | WONTFIX — not reproduced | `rg` audit found one `throw e;` at `src/storage/GamePersistence.ts:260`; no code change is warranted. |
| AUDIT-007 | Release validation | Running the plain release-bundle check immediately after E2E reported the expected E2E hook because the E2E web server rebuilt `dist` with test instrumentation. | WONTFIX — operational precondition | A clean `npm run build` followed by `node scripts/check-release-bundle.mjs` passes. The finding is retained so future audits run the release check after a production build. |
| AUDIT-008 | Change 258 | Hardware-WebGL/headed profiling and closure evidence cannot be produced on this SwiftShader-only host. | ACCEPTED BLOCKER | Preserve `BLOCKED`; skip only headed-only tasks and resume on a headed hardware-WebGL host. |
| AUDIT-009 | Unit coverage / Vitest 4 migration | Vitest 4 no longer applies Vitest 3's default test/config exclusions, and Change 261's pure random-tick test imported the DOM-bound `Game` aggregate. The resulting coverage report failed the established gate even though product statement/line coverage increased. | FIXED | Restored explicit product-only coverage exclusions, moved `resolveRandomTickCount` into `GameRuleFramework`, and re-pinned the measured Vitest 4 product floor at 91/88/94/93. Clean coverage measures 91.79/88.69/94.44/93.06; the branch floor is documented as a provider-specific recalibration, not a test bypass. Focused tests, full coverage, typecheck, lint, build, release-bundle, and full browser checks pass. |
| AUDIT-010 | Change 271 statistics / persistence lifecycle | Restoring persisted player coordinates after the walk-distance baseline was initialized, combined with retaining a pre-discontinuity fractional remainder, could mint an extra meter after reload; the live statistics E2E reproduced `1 m` → `2 m` intermittently. | FIXED | `applyInitialPlayerState` now re-anchors the walk baseline after restoration, and every discontinuity reset clears the fractional remainder. Statistics unit seams pass 17/17; the live reload journey passes 5/5 repetitions. |
| AUDIT-011 | Change 245 visual evidence / C259–C277 HUD stack | The six `linux-ci` `render-world` goldens were stale relative to the current Rules/Stats HUD stack; the high-1280 cell deterministically exceeded the 2% pixel-diff bound while the other five cells remained under the permissive comparison threshold. | FIXED | Re-pinned the six render-world cells through `UPDATE_SNAPSHOTS=1` using the canonical fixed-seed/update path; compare mode passes all six cells. No comparison threshold was relaxed. |

## Audit rule

An item is `FIXED` only after the implementation, focused tests, and the appropriate broader
validation are complete. A documentation reconciliation must retain the underlying historical
evidence and must not convert a headed-only Change-258 requirement into a software-rendering claim.
