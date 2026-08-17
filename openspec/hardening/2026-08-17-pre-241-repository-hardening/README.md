# Pre-241 Repository Hardening Interlock

Status: **MANDATORY / NOT VERIFIED**  
Authored: 2026-08-17  
Observed audit head: `6b69831503a2cdb5a749c2bba791e2d1632acaca`  
Scope: harden the repository before Change 241 may become ACTIVE.

## Why this exists

The numbered parity sequence is intentionally frozen before Change 241 because the canonical repository no longer satisfies its own advancement invariants. The observed `main` head is red in GitHub Actions, Change 241 production/test implementation exists while 241 is still not ACTIVE and its task ledger is 0%, program-state artifacts disagree, and the 241 replay contract contains internal contradictions that must be repaired before implementation resumes.

This package is an **out-of-band safety interlock**, not a new parity feature and not a renumbering of Changes 241-250. Existing future spec packages remain in place. Change 249 also remains later in the sequence; its release-era adversarial audit is not replaced by this pre-241 stabilization pass.

## Executor contract

1. Sync exactly to current `origin/main`; never assume the observed SHA above is still current.
2. Read `AGENTS.md`, `openspec/AUTONOMOUS_GOAL.md`, both `PROGRAM_STATE` files, `CHANGE_SEQUENCE.md`, `CHANGE_SEQUENCE_OVERRIDES.md`, `REVIEW_HANDOFF.md`, `SPEC_AUTHORING_PROTOCOL.md`, and **every file in this directory**.
3. Rebaseline all observed SHAs, run IDs, counts, and failures against current `origin/main` before editing.
4. Execute `tasks.md` in order. Do not skip blocked work and do not mark evidence from an older SHA as proof for a newer SHA.
5. **Do not activate or implement Change 241 or any higher numbered change while this interlock is incomplete.**
6. Preserve authored spec packages 241-250. Remove or quarantine only premature 241 production/test implementation as specified by the baseline-recovery contract.
7. Fix hardening findings; do not weaken tests, timeouts, resource budgets, type safety, or requirements merely to obtain green output.
8. Populate the repository-wide file audit to 100% tracked-file accountability.
9. Run every verification gate and publish only truthful evidence tied to the exact tested commit.
10. Commit and push the completed hardening work directly to `origin/main`, refetch, verify the published head, then require a green canonical GitHub Actions run for that published SHA before this interlock may be VERIFIED.

## Required artifacts

- `proposal.md` — problem, goals, scope, non-goals, risks.
- `design.md` — phased remediation and verification architecture.
- `tasks.md` — ordered execution ledger.
- `verification.md` — evidence ledger and final advancement gate.
- `audit-findings.md` — initial observed findings and required dispositions.
- `file-audit-manifest.md` — format and completion rules for file-by-file review.
- `specs/**/spec.md` — normative hardening contracts.

## Exit rule

The interlock is VERIFIED only when every task is complete, every MUST/SHALL requirement is evidenced, all blocking findings are closed, the file-audit manifest accounts for every tracked path, state artifacts agree with the published repository, and canonical CI for the published hardening SHA is green. Until then, numbered implementation remains frozen before 241.
