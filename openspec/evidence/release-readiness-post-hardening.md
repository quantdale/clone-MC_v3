# Release-Readiness Decision — Post-250 Persistence Hardening

- **Verdict: NOT READY YET — implementation complete, final gates pending**
- **Date:** 2026-08-21
- **Evaluating authority:** post-250 hardening executor under
  `openspec/hardening/2026-08-21-post-250-production-persistence-hardening/` and the mandatory
  interlock in `openspec/CHANGE_SEQUENCE_OVERRIDES.md`
- **Supersedes:** the historical Change 250 `READY` decision
  (`openspec/evidence/release-readiness.md`) **for current release authority**, exactly as that
  document's acceptance of 249-DL-001/249-DL-002 is superseded by this campaign. The historical
  artifact itself is immutable evidence and is not rewritten.

## Why the historical READY is superseded

The Change 250 READY verdict rested on an explicit product decision accepting two blocking
data-loss findings (249-DL-001, 249-DL-002) and deferring their remediation (root gap 249-DL-005)
as post-release work. The governance interlock (`CHANGE_SEQUENCE_OVERRIDES.md`, this package)
rejects acceptance/waiver/rarity dispositions for these findings. This campaign therefore
remediated all three in production code, re-proved durability end-to-end, and issues this
replacement decision. While this interlock is incomplete, the repository MUST be treated as
**not release-ready** regardless of the historical READY text.

## Criteria results (mirrors historical RC structure)

| Criterion | Result | Evidence |
|---|---|---|
| **PH-1 — DL-001 resolved in production code** | **PASS** | Structured failure handling via `GamePersistence` (classification, bounded retry, health monitor); persistent `#save-status` warning cleared only on verified recovery; localStorage authoritative path deleted from `Game`. Fault-injection unit suites + browser E2E quota/unavailable tests pass. See `post-hardening-audit.md`. |
| **PH-2 — DL-002 resolved with zero dirty-loss eviction** | **PASS** | Resident-cache/durability split; capture-on-edit; eviction handoff; sync restore + async hydration. Deterministic >10,051-chunk churn test proves exact per-cell equality through save/reload (DIRTY-5). |
| **PH-3 — DL-005 resolved by live durable-stack integration** | **PASS** | `main.ts` composes + opens the facade before `Game`; World wired via `WorldEditDurability`; production-composition unit tests + real-browser IndexedDB save/reload E2E through the production bundle. |
| **PH-4 — Legacy saves preserved/migrated safely** | **PASS** | Copy-then-verify migration with read-back verification and completion marker; source never mutated; idempotent + interruption-safe; truncation bug fixed (index ≥ 4096 edits now survive); representative pre-hardening save loaded in a real browser (E2E #4). |
| **PH-5 — Durability matrix proven on the shipped path** | **PASS** | Normal save/reload, quota + visible warning + retained dirty + recovery, private-mode survival, pagehide abrupt-close recovery, corrupt-source handling, >10k churn, repeated-failure boundedness — unit + browser evidence recorded in `verification.md` Gates A-C. |
| **PH-6 — No regression to existing gates** | **PENDING** | Full tree must pass: `validate-state`, typecheck, lint, full unit suite, coverage thresholds, build, both dependency audits, complete E2E suite, Change 247 release-performance gate. Unit suite green at 3877 pre-final tree; E2E persistence spec at 5/6 with one timeout under diagnosis; final runs pending. |
| **PH-7 — Independent adversarial re-audit of final tree** | **PENDING** | Code-audit complete (`post-hardening-audit.md`); independent dynamic pass against the final published tree outstanding. |
| **PH-8 — Published to origin/main with canonical CI SUCCESS** | **PENDING** | Remediation checkpoint not yet pushed; exact SHA + GitHub Actions run/job IDs to be recorded here after publication. |
| **PH-9 — No unresolved data-loss/corruption/security/regression blocker** | **PASS (in-tree)** | All campaign findings closed (see `post-hardening-audit.md`); nothing open in the current tree. Re-affirmed after PH-6/PH-7. |

## Verdict rule

This decision becomes **READY** only when PH-6, PH-7, and PH-8 flip to PASS with recorded
evidence: full gate outputs on the exact intended tree, a completed independent adversarial
re-audit, publication refetch proving the exact SHA, and canonical GitHub Actions SUCCESS for
that SHA. Until then the historical Change 250 READY remains superseded and the repository stays
**not release-ready** by interlock.
