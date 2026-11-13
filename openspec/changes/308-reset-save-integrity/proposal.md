# Proposal: 308-reset-save-integrity

## Problem

At `f1f1cac2506dffa7573fa67a7b2f95fa989ba85e`, a deterministic real `GamePersistence` test enqueues an unsaved chunk edit, injects a world-metadata delete failure during reset, and observes that `resetCurrentWorld()` returns failure while the unsaved pending edit has vanished. The method clears its queue and pending overlay before attempting the snapshot/delete. Independently, a real `DirtySaveQueue` experiment shows that an in-flight failed write requeues its key after `clear()`, allowing cancelled work to return. These are integrity defects, not documentation assumptions.

## Goals

A failed world reset preserves pending unsaved work and retry capability; a successful reset cannot be repopulated by stale queued writes. Queue cancellation during a failed in-flight write must not resurrect cleared work. Prove behavior with deterministic interleavings and real persistence integration tests.

## Non-goals

No save schema, gameplay retune, dependency, golden, or 258 headed GPU changes. The independently measured growth of `DirtySaveQueue`'s per-key epoch map after many successful unique writes is a separate finding for a subsequent narrow change; this package must not claim it fixed.

## Preconditions

307 VERIFIED 6/6 and published; start head `f1f1cac2506dffa7573fa67a7b2f95fa989ba85e` matched remote main with a clean tree before the failing-first test was added. Change 258 stays BLOCKED.

## Dependencies

Existing `GamePersistence`, `DirtySaveQueue`, `AutosaveCoordinator`, IndexedDB repositories and their test mocks. No new package.

## Proposed change

Introduce a safe reset barrier over queued writes, preserve uncommitted work when reset cannot complete, and cancel stale queue generations only after successful reset. Make `clear()` suppress requeue from an earlier in-flight failure without dropping newer post-clear marks. Make concurrent flush join earlier in-flight queue work before claiming success or pruning pending overlays, as required by a separately reproduced false-success test. Exact design and failure cases are normative in the capability spec.

## Compatibility and migration

No storage format changes. Existing successful reset remains world-scoped and idempotent; failed resets remain retryable and report failure rather than silently losing dirty data.

## Risks

Improper synchronization can lose a post-clear update, deadlock concurrent drains, break recovery-mode reset or resurrect stale writes. Deterministic gated-sink tests and real repository integration tests must cover all outcomes; full browser persistence/reset suites and baseline gates are mandatory.

## Rollback strategy

Revert the coherent change commits together; this restores the known failure-loss and cancellation defects.

## Definition of Done

Every normative failure, cancellation, concurrency and retry scenario passes; existing save/recovery tests and full mandatory gate plus isolated multiplayer performance pass; durable state and remote publication are reconciled.

## Advancement gate

100% of tasks, all mandatory requirements and tests pass; no unresolved data-loss or reset-corruption blocker. Change 258 remains BLOCKED without fabricated GPU evidence.
