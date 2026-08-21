# Design: Post-250 Production Persistence Hardening

## Design principles

- **Single production truth:** durability tests must exercise the same persistence composition instantiated by the shipped game.
- **Commit before forget:** dirty state cannot be evicted, overwritten, or acknowledged as durable until a durable sink has accepted it.
- **Fail visibly:** quota, unavailable storage, transaction abort, migration failure, and repeated write failure must produce a durable/observable health state and user-visible warning.
- **Retry without corruption:** retry queues must be bounded, idempotent, and preserve ordering/version invariants needed by the existing storage contracts.
- **Migration is copy-then-verify:** legacy localStorage remains intact until durable import commits and validation succeeds.
- **No fake E2E:** component-only tests cannot close a live-integration finding.

## Target composition

The executor must first inventory the existing storage stack from Changes 034-043 and 234 and reuse compatible components rather than creating a parallel persistence subsystem. Expected reusable surfaces include repositories, `RepositorySaveSink`, dirty-save queue/autosave coordination, storage health classification/monitoring, persistent codecs, migration utilities, archive/import logic, and server/world save lifecycle pieces.

Introduce one explicit production composition boundary owned by the game/bootstrap layer. The game should depend on a narrow persistence facade rather than directly calling `window.localStorage.setItem` for authoritative world/player durability.

The facade should expose at minimum:

- startup/open + migration result;
- load latest valid world/player snapshot;
- mark/enqueue dirty world edits and player state;
- flush/commit with structured success/failure;
- storage health/status subscription;
- pagehide/dispose best-effort flush semantics;
- testable fault-injection seams for quota/abort/unavailable/corrupt-data cases.

Exact names are implementation choices; semantic requirements are not.

## Dirty edit eviction

`World` currently owns a capped in-memory edit overlay. The cap may remain, but eviction may occur only after one of these is true:

1. the evicted chunk's latest committed edits are durably persisted and recoverable; or
2. ownership of those edits has atomically transferred to a durable/retry queue whose loss semantics satisfy the storage requirements.

A raw `Map.delete` of the only authoritative dirty copy is forbidden.

Prefer separating `resident edit cache` from `dirty durability ownership`, so memory pressure can evict resident representations without deleting pending durable state.

## Save failure behavior

Every production write failure must:

- preserve unsaved state for retry when technically possible;
- classify the error (quota, unavailable/security, transaction/unknown);
- update storage-health state;
- emit a user-visible non-modal persistent warning/status;
- avoid falsely reporting save success;
- recover/clear the warning after a verified successful commit.

Console-only logging is insufficient for DL-001.

## Legacy migration

On first durable-store startup for an existing seed/world:

1. discover legacy edit/player payloads;
2. parse and validate without mutating source;
3. write to the durable store transactionally;
4. read back/validate semantic equivalence;
5. record migration completion/version;
6. only then permit legacy cleanup, and cleanup is optional during this campaign.

If migration fails, keep the legacy data and surface the failure. Repeated startup must be idempotent.

## Test architecture

Add deterministic unit/integration tests for the facade and migration, plus browser E2E that boots through the real production composition with test-only fault injection gated out of release builds.

Mandatory scenarios:

- normal save/reload;
- quota failure + retained dirty state + visible warning + later retry success;
- storage unavailable/private-mode equivalent;
- transaction abort/partial failure;
- abrupt close/pagehide then recovery;
- corrupt latest snapshot with newest-valid fallback where supported;
- migration success, migration interruption, repeated migration;
- >10,000 distinct dirty-chunk churn proving no edit loss;
- save while chunks unload/evict;
- repeated failures without unbounded queue/listener/memory growth;
- import/archive compatibility if touched by the integration.

## Release revalidation

After code remediation, repeat the affected 249 data-loss/security/reliability/architecture review, then run the full repository gate and release-performance gate. The new release decision must cite the exact remediation SHA and canonical CI run. Historical Change 250 documents remain historical evidence but are explicitly superseded by the post-250 decision.
