# Proposal: 249-whole-codebase-adversarial-audit

## Problem

The repository has accumulated a very large surface — ~300 TypeScript source files across
`engine/`, `rendering/`, `simulation/`, `world/`, `worldgen/`, `storage/`, `player/`,
`inventory/`, `audio/`, `data/`, `config/`, `math/`, and `ui/` — plus a large headless unit
suite (260+ unit test files) and one Playwright E2E suite. The only whole-codebase review to
date is `FULL_AUDIT_REPORT.md`, a one-off narrative audit (findings `AUDIT-001..030`) authored
against an early, much smaller codebase (pre-registries, pre-workers, pre-persistence, single
player only). That report is stale in both form and content:

- It is narrative prose with ad-hoc severity/confidence, not a machine-checkable contract.
- Several of its findings are already resolved in the current code (e.g. WebGL context loss is
  now handled in `src/engine/Renderer.ts`; the `?e2e` parameter was replaced by a build-time
  `VITE_E2E` flag), yet no durable record says so.
- It predates the multiplayer, persistence, worker, and stress-hardening eras (237-248), so it
  carries no evidence about the current adversarial posture, save-recovery guarantees,
  concurrency discipline, or performance budgets.

There is no defined audit protocol, no shared finding taxonomy (blocking vs non-blocking), no
per-category coverage requirement, and no evidence standard. A fresh session cannot tell which
claims are current, which are resolved, and which were never verified.

## Goals

1. Define and apply a single structured, repeatable audit protocol covering seven categories:
   **security, correctness, reliability, data-loss, concurrency, performance, architecture**.
2. Produce a durable structured audit report artifact that supersedes/extends
   `FULL_AUDIT_REPORT.md`, containing: methodology, per-category coverage statements, a
   classified finding catalog, and an evidence index.
3. Establish a shared finding taxonomy — every finding is uniquely identified, categorized,
   classified **blocking** or **non-blocking**, assigned a severity and confidence, and backed
   by static and/or dynamic evidence.
4. Reconcile every legacy `FULL_AUDIT_REPORT` finding (`AUDIT-001..030`) against the current
   codebase, marking each resolved / persists / not-an-issue with evidence.
5. Reuse the audit-relevant evidence already produced by prior changes (237 network
   adversarial validation, 238 worker/main-thread stress, 239 long-session memory stress, 240
   save-recovery stress, 241 deterministic replay, and the 242-248 matrices) rather than
   duplicating it.
6. Record any coverage gap or thin evidence area explicitly (not silently skipped).

## Non-goals

- **Remediation.** This change audits, classifies, and reports. It MUST NOT fix findings,
   change production behavior, or refactor architecture. Remediation of blocking findings is
   tracked for subsequent changes / the program backlog.
- **Release-readiness decision.** The final program-wide verification, evidence archive, and
   release-readiness verdict are change **250**'s scope. 249 stops at producing the audit and
   its classified findings; it does not make or gate the 250 decision.
- **New features or content.** No gameplay, persistence, networking, or rendering behavior is
   added or changed.
- **Duplicate re-verification.** 249 does not re-run every stress/matrix suite from 237-248; it
   cites their verification evidence and runs only targeted characterization probes where a
   category needs fresh evidence.
- **Coverage-raising for its own sake.** Closing test-coverage gaps is a separate concern; 249
   only records coverage gaps as findings.

## Preconditions

- Change 248 is VERIFIED and advancement to 249 is allowed (per `AGENTS.md`).
- The baseline commands (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e`) run green at session start so the audit's "current state" claim is real.
- `FULL_AUDIT_REPORT.md`, the `coverage/` report, and the `openspec/changes/` verification
  files for 237-248 are readable.

## Dependencies

- Change **250-final-program-verification**: consumes this change's report/findings as its
  evidence input; 249 does not depend on 250.
- Prior evidence providers (read-only inputs): **237**, **238**, **239**, **240**, **241**,
  **242**, **243**, **244**, **245**, **246**, **247**, **248** verification files and
  `FULL_AUDIT_REPORT.md`.
- No runtime or build dependency is added or removed.

## Proposed change

Author and apply an adversarial whole-codebase audit:

1. **Protocol contract** (`specs/audit-protocol/spec.md`) — the shared framework: seven
   categories, finding taxonomy (blocking/non-blocking; severity; confidence; evidence tier),
   evidence requirements (static citation and/or dynamic result; no fabricated evidence),
   insufficient/contradictory-evidence rules, coverage rules, and the report artifact schema.
2. **Per-category contracts** (`specs/audit-{security,correctness,reliability,data-loss,
   concurrency,performance,architecture}/spec.md`) — each defines that category's scope,
   method (static review + targeted characterization probes), minimum coverage, and evidence
   standard.
3. **Audit execution** — apply the protocol across the codebase per category, producing
   classified findings with evidence.
4. **Report assembly** — a single structured artifact at
   `openspec/changes/249-whole-codebase-adversarial-audit/report.md` (methodology, coverage
   matrix, finding catalog, evidence index, category summaries, legacy-finding reconciliation).

The audit is a read-only, evidence-producing activity. It adds, at most, characterization
probe scripts/tests that only measure and document current behavior; it does not alter
production behavior.

## Compatibility and migration

- No public API, stored-data format, serialized schema, or configuration changes.
- The new report supersedes the narrative `FULL_AUDIT_REPORT.md` as the authoritative
  whole-codebase audit; the legacy report is reconciled, not deleted.
- No backward-compatibility or migration work is required for data or consumers.

## Risks

- **Stale-claim risk** — citing prior-change evidence that no longer matches the actual code
  if those changes are re-verified differently. Mitigation: every cited evidence is re-read at
  audit time and cross-checked against the current tree; insufficient evidence is recorded as
  such.
- **Scope creep** — the auditor (implementing agent) is tempted to fix found issues.
  Mitigation: non-goals are explicit; fixing a finding is a hard scope violation for this
  change.
- **Report bloat / unusability** — an exhaustive narrative again. Mitigation: a fixed report
  schema with unique IDs, statuses, and an evidence index keeps it queryable.
- **Fabricated evidence** — inventing file:line citations or test results. Mitigation:
  evidence rules (spec REQ-P3) require real citations and recorded command output; the
  verification gate cross-checks citations.

## Rollback strategy

Documentation-only change. The report and spec artifacts are additive files under the 249
change directory. Rolling back is deleting the added files; no production or test behavior is
affected.

## Definition of Done

- All seven categories audited with a documented coverage statement (each coverage minimum in
  the category specs met, or the gap recorded as a finding / blocked entry).
- Every finding has a unique ID, category, blocking/non-blocking classification, severity,
  confidence, evidence (static and/or dynamic), and status.
- The structured report at `report.md` is assembled, internally consistent (unique IDs, valid
  statuses, complete evidence index), and reconciles all legacy `AUDIT-001..030` findings.
- No production code was changed by this audit; any characterization probe files are
  read-only and do not alter behavior.
- The baseline gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e`) passes with recorded evidence.
- `verification.md` maps every protocol/category requirement to evidence and status.

## Advancement gate

Target 100% task completion with every MUST/SHALL requirement evidenced and the baseline gate
green. Because 249 produces an audit rather than production behavior, the advancement gate is
satisfied by: all coverage minimums met or explicitly recorded as blocked; all findings
classified and evidenced; report assembled and internally consistent; baseline gate green; and
no production code changed. Final release-readiness is deferred to change 250 by design.
