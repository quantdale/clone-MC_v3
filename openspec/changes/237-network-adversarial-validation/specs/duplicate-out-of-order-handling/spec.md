# Spec: duplicate-out-of-order-handling

## Contract

Cross-cutting adversarial contract that a replayed, duplicated, or out-of-order client message is
detected and rejected with the module's documented reason (or, for idempotent server→client
application, applied exactly once), never double-applied, and never corrupts a monotonic counter.
Coverage spans the connection-level sequence guard (new), the tick/`stateId` monotonic checks in the
existing handlers (227, 231, 232), and the sequencing-sensitive state machines (230 break sequence,
226 snapshot dedup, 229 client-store ordering). Message types are referenced by their defining change;
chat/command messages defined by 233 are covered by the connection-level sequence guard by reference.

## Definitions

- **Replay**: the same message sequence, tick, or `stateId` submitted again after having been accepted.
- **Out-of-order**: a message whose sequence/tick/`stateId`/phase is lower than or otherwise inconsistent
  with the last accepted value or the required state-machine ordering.
- **Sequence**: a per-connection monotonic integer carried by the dispatch layer and tracked by
  `MessageSequenceGuard` (not part of the 223 envelope schema; supplied by the dispatcher).
- **Stale tick**: `tick <= lastAcceptedTick` as enforced by 227 (`MovementAuthority`) and 232
  (`CombatValidator`).
- **StateId**: the 231 inventory/container mutation counter.
- **Idempotent application**: a server→client batch/snapshot that, when re-delivered, yields the same
  resulting state (replacement, not accumulation).

## Invariants

- **Monotonicity**: sequence, tick, and `stateId` counters advance strictly, or are reset only by the
  documented lifecycle events (`reset`, reconnect, spawn/teleport).
- **No double-apply**: a duplicate or out-of-order message MUST NOT change authoritative state a second
  time.
- **No mutation on rejection**: a rejected duplicate/out-of-order message MUST NOT mutate any counter,
  store, or registry.
- **Exactly-once**: replication events (combat batches, chunk updates) MUST be delivered/consumed
  exactly once.

## Requirements

### Requirement: connection-level message sequence replay/ordering detection

`MessageSequenceGuard.track(sequence)` MUST reject a sequence equal to or lower than the last accepted
as `'duplicate'` (equal) or `'out_of_order'` (lower), MUST accept a strictly greater sequence, and MUST
be resettable on disconnect/reconnect so a post-reconnect sequence restarts from 0.

#### Scenario: replayed sequence is rejected
- **GIVEN** `track(10)` was accepted (last accepted 10).
- **WHEN** `track(10)` is called again.
- **THEN** it MUST return `'duplicate'` and `lastAccepted` MUST remain 10.

#### Scenario: out-of-order sequence is rejected
- **GIVEN** `track(10)` accepted.
- **WHEN** `track(7)` is called.
- **THEN** it MUST return `'out_of_order'` and `lastAccepted` MUST remain 10.

#### Scenario: monotonic sequence advances
- **GIVEN** `track(10)` accepted.
- **WHEN** `track(11)` is called.
- **THEN** it MUST return `'accept'` and `lastAccepted` MUST be 11.

#### Scenario: reset allows a fresh sequence after reconnect
- **GIVEN** `track(10)` accepted.
- **WHEN** `reset()` is called (matching the 225 disconnect/reconnect) and then `track(3)`.
- **THEN** `track(3)` MUST return `'accept'` (the sequence epoch restarted) and `lastAccepted` MUST be 3.

#### Scenario: guard integrates the sequence check
- **GIVEN** `AdversarialMessageGuard` tracking sequence 10.
- **WHEN** `inspectIncoming(protocol, envelope, tick, 10)` is called with a valid envelope.
- **THEN** the result MUST be `{ dispatch: false, reason: 'duplicate_message' }` and the handler MUST
  NOT run.

### Requirement: movement stale-tick and reorder rejection

`MovementAuthority.submitIntent` MUST reject with `'stale tick'` an intent whose tick is equal to or
lower than the last accepted tick, and MUST NOT change the authoritative position or tick.

#### Scenario: replayed tick is rejected
- **GIVEN** `spawn({0,0,0}, 100)` and an accepted intent at tick 110.
- **WHEN** an intent at tick 110 (and then tick 109) is submitted.
- **THEN** each MUST be `{ accepted: false, reason: 'stale tick' }` and `position`/`lastTick` MUST remain
  those of tick 110.

#### Scenario: teleport resets tick ordering
- **GIVEN** an accepted intent at tick 110.
- **WHEN** `teleport({5,0,0}, 200)` then an intent at tick 201 is submitted.
- **THEN** the intent MUST be accepted (teleport legitimately jumps the tick) and `position` MUST be the
  new teleported position.

### Requirement: combat stale-tick and interval ordering rejection

`CombatValidator` MUST reject `'stale_tick'` a melee/fire/shield request whose tick is equal to or lower
than the player's last accepted tick for that action kind, and MUST NOT regress the per-player tracker.

#### Scenario: replayed melee tick is rejected
- **GIVEN** an accepted melee attack by player 1 at tick 100.
- **WHEN** a second attack by player 1 at tick 100 (then tick 99) is submitted.
- **THEN** each MUST be rejected with reason `'stale_tick'` and a third attack at tick 110 MUST be
  accepted (tracker not regressed).

#### Scenario: replayed shield request is rejected
- **GIVEN** a recorded shield request at tick 300.
- **WHEN** the same request with tick 300 (or a lower tick) is re-submitted.
- **THEN** it MUST be rejected with reason `'stale_tick'` and `getShieldRaised` MUST remain the first
  request's value.

### Requirement: inventory stateId replay rejection

`InventoryTransactionValidator.processTransaction` MUST reject with `'wrong_state_id'` any transaction
whose `stateId` does not match the current authoritative `stateId`, and MUST return the authoritative
slot/cursor snapshot.

#### Scenario: replayed transaction is rejected
- **GIVEN** an accepted transaction advancing the validator to `stateId` 4.
- **WHEN** a transaction carrying `stateId: 3` (the value before the accepted one) is re-submitted.
- **THEN** it MUST be rejected `'wrong_state_id'` and `currentStateId` MUST remain 4.

#### Scenario: out-of-order transaction is rejected with authoritative snapshot
- **GIVEN** `stateId` 2 and a transaction carrying `stateId: 1`.
- **WHEN** `processTransaction` is called.
- **THEN** it MUST be rejected `'wrong_state_id'` and the returned result MUST include the authoritative
  slots and cursor.

### Requirement: block-break sequence ordering

`BlockInteractionValidator` MUST reject `'no_active_break'` a `finish` for a block with no matching
active break, MUST reject `'break_too_fast'` a `finish` inside `minBreakTicks`, and MUST NOT corrupt the
active-break map on a rejected finish.

#### Scenario: finish without start is rejected
- **GIVEN** no active break for `(5, 5, 5)`.
- **WHEN** `validateBreak` is called with action `finish` at `(5, 5, 5)`.
- **THEN** it MUST be rejected `'no_active_break'` and the active-break map MUST remain empty.

#### Scenario: finish for a different block than the active break is rejected
- **GIVEN** an active break at `(1, 2, 3)`.
- **WHEN** `validateBreak` is called with action `finish` at `(9, 9, 9)`.
- **THEN** it MUST be rejected `'no_active_break'` and the active break at `(1, 2, 3)` MUST remain.

#### Scenario: finish inside the minimum break interval is rejected
- **GIVEN** `minBreakTicks: 5`, a break started at tick 100, and a `finish` at tick 102.
- **WHEN** `validateBreak` is called.
- **THEN** it MUST be rejected `'break_too_fast'` and the active break MUST remain (a later finish at
  tick 105 MUST be accepted).

### Requirement: inventory drag lifecycle ordering

`InventoryTransactionValidator` MUST reject `'drag_not_started'` a drag `add` or `end` without an active
drag, and MUST reject a duplicate `start` while a drag is active without mutating the existing drag or
slot state.

#### Scenario: drag end without start is rejected
- **GIVEN** no active drag.
- **WHEN** a `drag` request with phase `end` is processed.
- **THEN** it MUST be rejected `'drag_not_started'` and `currentSlots`/`currentStateId` MUST be unchanged.

#### Scenario: duplicate drag start is rejected without disturbing the drag
- **GIVEN** an active left drag with slot 2 recorded.
- **WHEN** a second `drag` `start` is processed.
- **THEN** it MUST be rejected `'drag_not_started'`; the original drag MUST still complete normally on
  `end` and include slot 2.

### Requirement: idempotent server→client application

Chunk snapshot replacement and entity-replica batch application MUST be idempotent: re-delivering the
same snapshot or batch MUST yield the same resulting state and MUST NOT double-count or duplicate.

#### Scenario: chunk snapshot replacement is idempotent
- **GIVEN** `ChunkStreamManager` with a snapshot for key `"0,0"`.
- **WHEN** `putSnapshot` is called again with an updated snapshot for `"0,0"`.
- **THEN** the store MUST contain exactly one snapshot for the key, holding the updated payload.

#### Scenario: duplicate section y is rejected in a snapshot
- **GIVEN** a snapshot for key `"0,0"` with two sections both at `y: 1`.
- **WHEN** `putSnapshot` is called.
- **THEN** it MUST throw an error matching `ChunkStream:` and the store MUST NOT contain the snapshot.

#### Scenario: entity store batch apply is idempotent on re-delivery
- **GIVEN** `ClientEntityStore` with entity 3 spawned from a batch.
- **WHEN** the same spawn batch is applied again, then the batch's despawn for entity 3 is applied.
- **THEN** re-applying the spawn leaves exactly one replica for id 3, and the despawn removes it
  (`hasEntity(3)` MUST be `false`).

#### Scenario: combat batch events are consumed exactly once
- **GIVEN** a `CombatReplicationBatch` with one melee hit and one spawn.
- **WHEN** `stepProjectiles` is called twice with no new requests or motion.
- **THEN** the first batch MUST contain the events and the second MUST contain empty event arrays (no
  double-delivery).

## Error and failure behavior

- Sequence guard: `'duplicate'`/`'out_of_order'` (returned), non-safe-int sequence throws
  `NetworkAdversarial: <detail>`.
- Movement: `'stale tick'` returned; combat: `'stale_tick'` returned; inventory: `'wrong_state_id'`
  returned with authoritative snapshot; block break: `'no_active_break'`/`'break_too_fast'` returned.
- Idempotent server→client paths replace or coalesce; rejected duplicates never mutate state.

## Performance and resource bounds

- Sequence guard and per-module stale checks are O(1) per message. Idempotent application is O(1) per
  key/id (Map-based), bounded by the module caps.

## Compatibility and migration

- Additive. The sequence guard adds `'duplicate_message'`/`'out_of_order'`; all existing reasons
  (`'stale tick'`, `'stale_tick'`, `'wrong_state_id'`, `'no_active_break'`, `'break_too_fast'`,
  `'drag_not_started'`) are preserved verbatim. No protocol or save-format change.

## Security and integrity

- Replay and reorder attacks are neutralized at the connection and per-module levels: a captured
  message cannot be replayed to double-apply a movement/combat/inventory/break effect, and lower/equal
  sequence messages cannot regress a monotonic counter.

## Observability

- `MessageSequenceGuard.lastAccepted`; `MovementAuthority.lastTick`/`position`; `CombatValidator`
  per-player tick trackers; `InventoryTransactionValidator.currentStateId`; `ChunkStreamManager` store;
  `ClientEntityStore.hasEntity`. Each is used to assert "unchanged/advanced exactly once" in tests.

## Verification mapping

| Requirement | Test / command |
|---|---|
| REQ-D1 connection sequence guard | `tests/unit/NetworkAdversarialGuard.test.ts` › sequence replay/order/reset/integration |
| REQ-D2 movement stale tick | `tests/unit/MovementAuthority.test.ts` adversarial |
| REQ-D3 combat stale tick | `tests/unit/CombatNetworking.test.ts` adversarial |
| REQ-D4 inventory stateId replay | `tests/unit/InventoryTransactionNetworking.test.ts` adversarial |
| REQ-D5 block-break ordering | `tests/unit/BlockInteractionNetworking.test.ts` adversarial |
| REQ-D6 drag lifecycle ordering | `tests/unit/InventoryTransactionNetworking.test.ts` adversarial |
| REQ-D7 idempotent server→client | `tests/unit/ChunkStreaming.test.ts`, `EntityReplication.test.ts`, `CombatNetworking.test.ts` |
