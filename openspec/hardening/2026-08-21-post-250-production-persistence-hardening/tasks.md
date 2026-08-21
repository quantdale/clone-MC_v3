# Tasks: Post-250 Production Persistence Hardening

Target: all tasks complete; no advancement exception may waive DL-001 or DL-002.

## 0. Rebaseline and freeze release

- [ ] 0.1 Fetch current `origin/main`, record exact session-start SHA, inspect working tree, and verify this interlock is the highest-precedence next action.
- [ ] 0.2 Reproduce/confirm `249-DL-001`, `249-DL-002`, and `249-DL-005` against current source with current file/line evidence and at least one executable reproducer for each runtime-reachable blocker.
- [ ] 0.3 Record baseline typecheck/lint/unit/build/E2E/coverage/audits and current canonical CI status without treating a green baseline as proof of durability.

## 1. Production persistence integration

- [ ] 1.1 Inventory Changes 034-043 and 234 storage components; map which are reusable, which are server-only, and which require an adapter for browser production.
- [ ] 1.2 Define/implement a narrow production persistence facade/composition root used by `Game`/bootstrap.
- [ ] 1.3 Remove authoritative direct localStorage-only save behavior from the live path; legacy localStorage may remain only as migration/fallback input under explicit semantics.
- [ ] 1.4 Wire storage health/error classification and bounded retry/dirty ownership into the production path.
- [ ] 1.5 Add lifecycle integration for startup/load, periodic/dirty save, pagehide, dispose, reload, and recovery.

## 2. Resolve DL-001 — silent save failure

- [ ] 2.1 Replace empty production save catches with structured failure handling.
- [ ] 2.2 Preserve unsaved data for retry after quota/unavailable/transaction failures where safe.
- [ ] 2.3 Surface a persistent user-visible save-health warning and clear it only after verified recovery.
- [ ] 2.4 Add deterministic failure-injection tests covering quota, unavailable/security-equivalent, repeated failure, and recovery.

## 3. Resolve DL-002 — dirty eviction loss

- [ ] 3.1 Refactor edit-cache/durability ownership so eviction cannot delete the sole dirty authoritative copy.
- [ ] 3.2 Prove chunk unload/LRU eviction after >10,000 distinct edited chunks retains every committed edit through save/reload.
- [ ] 3.3 Add boundedness tests showing the fix does not replace data loss with unbounded memory growth.

## 4. Resolve DL-005 — live durable stack gap

- [ ] 4.1 Ensure the shipped game constructs and uses the durable persistence path; component-only construction in tests/probes does not count.
- [ ] 4.2 Add a production-composition test that fails if the game regresses to localStorage-only authoritative persistence.
- [ ] 4.3 Verify persistent codecs/versioning and world/player identities are compatible with the live integration.

## 5. Legacy migration and compatibility

- [ ] 5.1 Implement copy-then-verify migration for existing legacy edit/player localStorage payloads.
- [ ] 5.2 Make migration idempotent and interruption-safe; never delete source data before verified commit.
- [ ] 5.3 Test valid, corrupt, partial, interrupted, repeated, and already-migrated states.
- [ ] 5.4 Verify existing playable saves from the pre-hardening build continue correctly after upgrade.

## 6. End-to-end durability matrix

- [ ] 6.1 Exercise normal save/reload through the exact production composition.
- [ ] 6.2 Exercise abrupt close/pagehide and newest-valid recovery.
- [ ] 6.3 Exercise quota/unavailable/transaction-abort paths with visible failure state and later recovery.
- [ ] 6.4 Exercise >10k edited-chunk churn + eviction/unload + reload with zero edit loss.
- [ ] 6.5 Exercise repeated failures/retries for queue/listener/memory boundedness.
- [ ] 6.6 Add browser E2E coverage for at least normal persistence, visible save failure, recovery, and migrated-save load.

## 7. Re-audit 249 findings

- [ ] 7.1 Re-audit DL-001, DL-002, DL-005 with current source and dynamic evidence; all three must be `resolved` for this campaign to pass.
- [ ] 7.2 Revisit affected related findings (DL-003, DL-004, SEC-001, reliability/architecture storage findings) and fix any newly blocking regression discovered.
- [ ] 7.3 Run targeted adversarial probes against the actual production persistence composition.

## 8. Full verification and release redecision

- [ ] 8.1 Run `npm run validate-state`, typecheck, lint, full unit, coverage, build, production/full dependency audits, and E2E with required retry policy.
- [ ] 8.2 Run the release-performance gate and confirm persistence changes remain within save/load/memory budgets.
- [ ] 8.3 Publish the intended remediation checkpoint to `origin/main`, refetch, and confirm exact remote SHA.
- [ ] 8.4 Require canonical GitHub Actions SUCCESS for that exact published SHA and record run/job IDs.
- [ ] 8.5 Author/update post-hardening audit and release-readiness evidence. The historical Change 250 READY decision must be explicitly superseded, not silently rewritten.
- [ ] 8.6 Mark this interlock VERIFIED only when all tasks above pass and no unresolved data-loss/corruption/security/regression blocker remains.
