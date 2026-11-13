# Design: 308-reset-save-integrity

## Context/current state

A deterministic integration test against the actual `GamePersistence` and fault-injectable IDB mock enqueues a chunk edit then forces a reset delete failure. Before any destructive work, `resetCurrentWorld()` calls `coordinator.stop()`, `queue.clear()` and `pendingEdits.clear()`. The reset returns `{ok:false}` but `restorePendingChunkEdits` is `null`; the user's dirty edit is no longer pending or durable. Separately, a gated real `DirtySaveQueue` write rejected after `clear()` reappears as pending. A 10,000-unique-key drain left 10,000 retained epoch keys despite an empty queue; that separate boundedness issue is not solved by this change.

## Concurrent flush false success discovered during implementation

A gated real `GamePersistence` test starts a flush and holds its chunk write after the queue removes the in-flight entry. A second flush sees pending size zero, resolves before the first write and prunes the still-needed pending overlay; the failing-first test independently observed premature completion and an absent overlay. Flush must join the queue's serialization boundary even when the pending map is empty, before inspecting and draining subsequent work. An additional persistent-failure test demonstrated overlapping flushes can still see one another's in-flight writes as an empty pending map. Track the in-flight key and include it in outstanding size and key-presence checks (deduplicating a same-key re-mark), so facade failure reporting and overlay pruning cannot treat an in-flight write as durable. This is separate from the reset barrier and protects truthful flush outcomes.

## Target state

Reset must coordinate with queued writes as a transaction-like lifecycle: do not discard pending edits until reset succeeds, do not allow earlier in-flight queue writes to land after successful deletion, and preserve newly enqueued snapshots on failure. The coordinator's scheduling and queue semantics must resume after a failed reset. Clear cancellation is generation-aware and cannot requeue an entry invalidated by a later clear.

## Invariants

No failed reset may silently discard pending edits or player/chunk queue units. Successful world-scoped reset remains idempotent and must not recreate reset records from stale queue work. Newer marks after clear must not be removed by an older failing write. `resetCompleted`, world ownership and save formats retain their existing contract.

## API and data model

Use existing public methods where possible. A private/internal queue barrier or cancellation token and coordinator pause/resume seam may be added, with idempotent bounded behavior and no exposed gameplay API or schema change. A reset already in progress must not start a second destructive operation.

## Control/data flow

Establish a reset barrier before the snapshot; wait for already-started queued writes and prevent new drains from racing the destructive operation. Keep dirty units and pending overlay information available until the transaction succeeds. On reset failure, preserve or restore uncommitted units and resume normal scheduling; on success, discard only work invalidated by the intentional reset and remain inert. A queue clear invalidates prior in-flight requeue eligibility but not later marks.

## Detailed behavior

The implementation must cover queued chunk, player and other unit kinds through the same queue semantics rather than a special-case test bypass. Test mark-during-write, clear-during-failure, clear-then-new-mark, reset failure at snapshot and delete, retry, concurrent drain/reset and success/no-resurrection. A controlled delayed raw game-mode write actually resurrected its record after reset reported success; therefore track all direct raw metadata save promises, wait for pre-existing ones before snapshot, and defer latest per-record raw writes arriving during reset until failure (retry) or discard them only after successful intentional reset. A concurrent reset shares or serializes the same operation. A failing-first test proved retaining a deferred payload by reference writes a caller's later mutation; capture a structured-clone snapshot at the save call so both deferred writes and retries preserve the value originally submitted. A separate failing-first test demonstrated same-key direct raw saves could complete out of order, leaving an older payload durable; serialize raw writes per record key and retain only the latest eligible retry when resetting.

## Failure modes

A snapshot or delete failure returns a failure and retains recoverable dirty units, including any marks received while the attempt was running. A failing old in-flight write after clear cannot resurrect the old payload or overwrite a new mark. No promise may resolve as a successful reset while pre-reset queue work can write afterwards.

## Compatibility/migration

No database version or serialized representation change. Normal autosave, pagehide, import/export, quota recovery and transaction rollback behavior remain compatible.

## Performance/resource constraints

Queue operations remain bounded by existing pending batch sizes; reset may await existing in-flight operations but must not spin on an unbounded loop. No new globally unbounded per-key tracking. The already-observed existing epoch-map retention is separate and must remain honestly recorded.

## Testing seams

Gated write promises, fault-injectable in-memory IDB factory, pending overlay getters, persistent repository reads and real Playwright recovery/reset journeys. Test both write success and failure with re-marking during each lifecycle boundary.

## Observability/debugging

Failure results remain visible to the existing recovery UI; no success result after partial failure. Tests inspect actual queue keys and durable records rather than only call counts.

## Affected files/symbols

`src/storage/GamePersistence.ts`, `src/storage/DirtySaveQueue.ts`, `src/storage/AutosaveCoordinator.ts` if a pause/barrier is required, `tests/unit/RecoveryBackupAndAtomicReset.test.ts`, `tests/unit/DirtySaveQueue.test.ts`, relevant integration/browser tests, state and change artifacts.

## Rejected alternatives

Clearing the queue up front then returning failure is the reproduced data-loss bug. Blindly flushing and discarding failed units before reset can also lose edits. Treating `stop()` as cancellation is unsafe: it only removes timers/listeners, not already-started asynchronous writes. Declaring a passing existing reset suite sufficient would ignore the missing dirty-state interleaving.

## Downstream dependencies

World reset recovery UI, `GamePersistence.flush`, autosave and pagehide handlers, `WorldEditDurability`, import/export and 257 atomic reset tests.
