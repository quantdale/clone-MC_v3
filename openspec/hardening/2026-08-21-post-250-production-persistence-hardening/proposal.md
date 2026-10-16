# Proposal: Post-250 Production Persistence Hardening

## Why

Change 249 found two blocking silent data-loss paths and one high-severity live-integration gap. Change 250 did not remediate them; it accepted them through a documentation-only release decision. The published source still contains empty save-error catches and destructive dirty-overlay eviction. Under `AGENTS.md`, unresolved data-loss blockers are incompatible with release advancement.

## Outcome

Make the shipped browser game use a durable, observable persistence path with no silent loss of committed progress under the covered failure model, then repeat release verification against the real production path.

## Required scope

1. Resolve `249-DL-001`: failed writes must be detected, classified, surfaced, retained for retry where safe, and covered by deterministic tests.
2. Resolve `249-DL-002`: dirty edits must never be destroyed by in-memory eviction before durable handoff/commit.
3. Resolve `249-DL-005`: integrate the existing transactional IndexedDB persistence architecture (034-043/234) into the shipped game, or prove and document an equivalent durable replacement.
4. Preserve/migrate existing localStorage worlds and player state without silent overwrite or loss.
5. Exercise quota/unavailable storage, abrupt close, partial write, migration, corrupt payload, repeated save failure, >10k dirty-chunk churn, reload, and recovery against the same path used by production.
6. Keep offline-first browser play functional. Storage failure may degrade durability, but never silently.
7. Re-run the whole-codebase adversarial audit areas affected by persistence and all mandatory regression/performance gates.
8. Supersede the historical Change 250 READY decision with a post-hardening release-readiness record based on actual remediation evidence.

## Non-goals

- No unrelated gameplay/content expansion.
- No Change 251 numbering.
- No weakening of existing test, coverage, performance, or E2E gates.
- No declaring a blocker resolved solely through documentation, severity changes, rarity arguments, or scope constraints.
- No destructive migration that removes the legacy save before the durable replacement is verified committed.

## Completion definition

This campaign is VERIFIED only when production integration is complete, targeted adversarial durability tests pass, the full repository gate passes, the relevant 249 findings are re-audited as resolved with current-tree evidence, canonical CI is green on the exact published SHA, and the final release-readiness decision is regenerated without accepting DL-001/DL-002.
