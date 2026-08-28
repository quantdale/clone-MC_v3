# Release-Readiness Decision — Post-250 Persistence Hardening

- **Verdict: READY**
- **Date:** 2026-08-23 (decision finalized; campaign executed 2026-08-21 → 2026-08-23)
- **Remediation checkpoint:** `aa92a5c229a753f10f8c1677e836136962b5d07a` (= `origin/main`,
  refetch-proved; canonical CI run **32589457819** SUCCESS on this exact SHA — gate job
  **97078975848**, e2e job **97078975868**)
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
| **PH-6 — No regression to existing gates** | **PASS** | Full gate green on the remediation checkpoint tree, twice over: (a) local campaign 2026-08-22/23 — `validate-state`, typecheck, lint, build, unit 317 files / 4160 passed + 1 skipped, coverage thresholds, SEC-001 bundle assertion, both dependency audits, E2E 46/46; (b) canonical CI run **32589457819** on `aa92a5c` — gate job **97078975848** SUCCESS (all steps incl. coverage + audits) and e2e job **97078975868** SUCCESS. The Change 247 release-performance gate is included in the suite. |
| **PH-7 — Independent adversarial re-audit of final tree** | **PASS** | Gate E code audit + independent adversarial pass (`post-hardening-audit.md`), plus the 2026-08-23 **PH-7 incremental adversarial pass** covering the entire production delta between the audit snapshot (`32b0e76`) and the published checkpoint (`aa92a5c`) — the nine-commit deep-engine wave and gate-defect fixes (63 files): durability seams intact, worker lifecycle integrity verified, catch-up bounded, zero added eval/network/storage surface in the delta, determinism/budget matrices green; two non-blocking observations recorded; no blocking finding. |
| **PH-8 — Published to origin/main with canonical CI SUCCESS** | **PASS** | Remediation chain `ec6989b` → `a06b042` → `aa92a5c229a753f10f8c1677e836136962b5d07a` published with normal fast-forward pushes; refetch proves remote = local HEAD; canonical GitHub Actions run **32589457819** conclusion **SUCCESS** for that exact SHA (gate **97078975848**, e2e **97078975868**). The intermediate RED e2e run on `ec6989b` (**32577467105**) is retained as NEW-6 discovery evidence; its root cause is remediated in-tree and proven green by the final run. |
| **PH-9 — No unresolved data-loss/corruption/security/regression blocker** | **PASS (in-tree)** | All campaign findings closed (see `post-hardening-audit.md`); nothing open in the current tree. Re-affirmed after PH-6/PH-7. |

## Verdict rule

This decision becomes **READY** only when PH-6, PH-7, and PH-8 flip to PASS with recorded
evidence: full gate outputs on the exact intended tree, a completed independent adversarial
re-audit, publication refetch proving the exact SHA, and canonical GitHub Actions SUCCESS for
that SHA. **All three criteria flipped PASS on 2026-08-23** (see the criteria table); the verdict
is therefore **READY**, superseding the historical Change 250 decision for current release
authority. The repository remains subject to the standing governance rules in `AGENTS.md` and
`openspec/CHANGE_SEQUENCE_OVERRIDES.md`.
