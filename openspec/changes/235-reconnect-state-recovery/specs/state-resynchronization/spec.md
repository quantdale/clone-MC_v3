# Spec: state-resynchronization

## Contract

The client/server state-resynchronization protocol: authoritative and client state signatures,
deterministic divergence detection that decides whether a reconnecting client needs a full
resync, deterministic server-side full-state snapshot assembly, and client-side full-state
application that replaces the client's replicated summary, clears pending predictions, and
returns a concrete resync directive for the caller to apply to the existing movement/inventory/
block/chunk/entity components.

## Definitions

- **State Signature**: a snapshot summary of replicated state — `{ profile, epoch, tick,
  position, inventoryStateId, interest, entities }`.
- **Interest**: the sorted set of chunk keys a client currently holds / the server streams.
- **Full-State Snapshot**: the complete authoritative payload needed to rebuild a client:
  spawn position, tick, full interest chunk snapshots, in-range entity spawn descriptors, and
  the full inventory window (slots, hotbar, cursor, `stateId`).
- **Resync Directive**: the ordered set of concrete reset actions the caller executes against
  `MovementReconciler`, `ClientInventoryReconciler`, `ClientBlockReconciler`,
  `ChunkStreamManager`, and `ClientEntityStore`.

## Invariants

- **Divergence Rule**: `compareSignatures` returns `needsResync: false` iff the client and server
  signatures are equal on profile, epoch, tick, position, `inventoryStateId`, interest set, and
  entity set; any difference yields `needsResync: true` with a reason.
- **Epoch-Change Resync**: A client signature whose epoch differs from the server's current epoch
  MUST produce `needsResync: true`.
- **Snapshot Determinism**: `collectFullState` sorts chunk keys and chunk snapshots ascending and
  entity descriptors ascending by id; equivalent inputs yield identical outputs.
- **Current-Only Snapshot**: `collectFullState` and `applyFullState` MUST reject a non-current
  epoch.
- **Application Idempotence**: Applying the same full snapshot twice MUST produce an unchanged
  client summary and an unchanged directive on the second application.
- **Prediction Clearance**: Applying a full snapshot MUST clear pending predictions and leave
  `resyncPending` false.

## Requirements

### Requirement: REQ-1 State Signature Recording

The `ReconnectStateClient` SHALL record the client's replicated-state summary and produce a
`ClientStateSignature` that reflects it.

#### Scenario: Recorded state is reflected in the signature
- **GIVEN** a `ReconnectStateClient` connected with profile `"alice"` and epoch 2.
- **WHEN** `recordTick(120)`, `recordPosition({x:10,y:0,z:10})`, `recordInventoryStateId(7)`,
  `setInterest(["0,0","1,0"])`, and `setEntities([3,1])` are called, then `signature()` is read.
- **THEN** the signature MUST carry profile `"alice"`, epoch 2, tick 120, position `(10,0,10)`,
  `inventoryStateId` 7, interest `["0,0","1,0"]`, and entities `[1,3]`.

#### Scenario: Interest and entity sets are emitted sorted
- **GIVEN** `setInterest(["1,0","0,0"])` and `setEntities([3,1])`.
- **WHEN** `signature()` is read.
- **THEN** `interest` MUST be `["0,0","1,0"]` and `entities` MUST be `[1,3]`.

#### Scenario: Invalid recorded state throws
- **GIVEN** a connected `ReconnectStateClient`.
- **WHEN** `recordTick(-1)`, `recordPosition({x:NaN,y:0,z:0})`, `recordInventoryStateId(-3)`, or a
  non-integer entity id is recorded.
- **THEN** it MUST throw an error matching `Reconnect:` and the summary MUST be unchanged.

---

### Requirement: REQ-2 Divergence Detection

The `compareSignatures` function SHALL report whether a resync is needed, and the reason for any
divergence, comparing the client signature against the authoritative server signature.

#### Scenario: Equal signatures require no resync
- **GIVEN** identical client and server signatures (same profile, epoch, tick, position,
  `inventoryStateId`, interest, entities).
- **WHEN** `compareSignatures(client, server)` is called.
- **THEN** the result MUST be `{ needsResync: false, reasons: [] }`.

#### Scenario: Empty-vs-empty interest and entities are equal
- **GIVEN** client and server signatures identical except both have empty `interest` and empty
  `entities`.
- **WHEN** `compareSignatures(client, server)` is called.
- **THEN** the result MUST be `{ needsResync: false, reasons: [] }`.

#### Scenario: Differing inventory stateId triggers resync
- **GIVEN** a client signature with `inventoryStateId: 4` and a server signature with
  `inventoryStateId: 9` (all else equal).
- **WHEN** `compareSignatures(client, server)` is called.
- **THEN** the result MUST be `{ needsResync: true, reasons: ['inventory state mismatch'] }`.

#### Scenario: Differing interest set triggers resync
- **GIVEN** a client interest of `["0,0"]` and a server interest of `["0,0","1,0"]` (all else equal).
- **WHEN** `compareSignatures(client, server)` is called.
- **THEN** the result MUST be `{ needsResync: true, reasons: ['interest mismatch'] }`.

#### Scenario: Differing entity set triggers resync
- **GIVEN** client entities `[1,2]` and server entities `[1,2,3]` (all else equal).
- **WHEN** `compareSignatures(client, server)` is called.
- **THEN** the result MUST be `{ needsResync: true, reasons: ['entity set mismatch'] }`.

---

### Requirement: REQ-3 Reconnect Requires Resync

A reconnecting client whose signature carries an epoch older than the server's current epoch
MUST be flagged for a full resync.

#### Scenario: Reconnect after clean disconnect requires resync
- **GIVEN** a server whose current epoch for `"alice"` is 3 (after a disconnect and reconnect).
- **WHEN** a client signature with epoch 2 is compared against the server signature (epoch 3).
- **THEN** `compareSignatures` MUST return `{ needsResync: true, reasons: ['epoch mismatch'] }`.

#### Scenario: Reconnect after keepalive drop requires resync
- **GIVEN** a server whose current epoch for `"alice"` is 2 (reconnected after a keepalive timeout).
- **WHEN** a client signature with the stale epoch 1 is compared against the server signature.
- **THEN** `compareSignatures` MUST return `{ needsResync: true, reasons: ['epoch mismatch'] }`.

---

### Requirement: REQ-4 Full Snapshot Assembly

The `ReconnectStateManager.collectFullState(profile, input)` SHALL assemble a validated,
deterministic `FullStateSnapshot` for the profile's current session.

#### Scenario: Valid input assembles a deterministic snapshot
- **GIVEN** an active session for `"alice"` with epoch 2, and an input with chunk snapshots
  `["1,0"]`, `["0,0"]` (unsorted), entity descriptors with ids `[3,1]` (unsorted), and a valid
  inventory window.
- **WHEN** `collectFullState("alice", input)` is called.
- **THEN** the snapshot MUST have `chunkKeys` `["0,0","1,0"]`, `chunkSnapshots` in that same
  order, `entities` ordered `[1,3]`, and the inventory reproduced exactly; calling it again with
  the same input MUST produce the identical snapshot.

#### Scenario: Empty chunk and entity inputs are allowed
- **GIVEN** an active session and an input with an empty `chunks` array and an empty `entities`
  array.
- **WHEN** `collectFullState(profile, input)` is called.
- **THEN** it MUST NOT throw and the snapshot MUST have empty `chunkKeys` and empty `entities`.

#### Scenario: Stale epoch is rejected
- **GIVEN** an active session for `"alice"` with epoch 2.
- **WHEN** `collectFullState("alice", { ...epoch: 1 })` is called.
- **THEN** it MUST throw an error matching `Reconnect: epoch is not the current session`.

#### Scenario: Duplicate chunk key is rejected
- **GIVEN** an active session and an input whose chunks contain two snapshots both keyed `"0,0"`.
- **WHEN** `collectFullState(profile, input)` is called.
- **THEN** it MUST throw an error matching `Reconnect: duplicate chunk key`.

#### Scenario: Invalid inventory window is rejected
- **GIVEN** an active session and an input whose inventory has a hotbar of length 8 (not 9) or an
  out-of-range slot stack.
- **WHEN** `collectFullState(profile, input)` is called.
- **THEN** it MUST throw an error matching `Reconnect:` and no snapshot MUST be returned.

---

### Requirement: REQ-5 Full Snapshot Application

The `ReconnectStateClient.applyFullState(snapshot)` SHALL replace the client summary with the
snapshot's values, clear pending predictions, and return a `ClientResyncDirective` enumerating
the reset actions the caller applies to the concrete reconcilers and stores.

#### Scenario: Applying a full snapshot replaces state and returns a directive
- **GIVEN** a `ReconnectStateClient` connected with profile `"alice"` and epoch 2, with
  `resyncPending` true.
- **WHEN** `applyFullState` is called with a snapshot for profile `"alice"`, epoch 2, tick 120,
  position `(10,0,10)`, chunk keys `["0,0","1,0"]`, entity ids `[1,3]`, and inventory
  `stateId` 7.
- **THEN** the client summary MUST reflect those values, `resyncPending` MUST be false, and the
  returned directive MUST contain a `reset_movement` action with position `(10,0,10)` and tick
  120, a `reset_inventory` action with `stateId` 7, a `clear_block_predictions` action, a
  `reset_chunks` action with keys `["0,0","1,0"]`, and a `reset_entities` action with ids `[1,3]`.

#### Scenario: Duplicate application is idempotent
- **GIVEN** `applyFullState` was already called once with a snapshot.
- **WHEN** the same snapshot is applied again.
- **THEN** it MUST NOT throw, the client summary MUST be unchanged, and the returned directive
  MUST be unchanged.

#### Scenario: Stale-epoch snapshot is rejected
- **GIVEN** a `ReconnectStateClient` connected with epoch 2.
- **WHEN** `applyFullState` is called with a snapshot whose epoch is 1.
- **THEN** it MUST throw an error matching `Reconnect: snapshot epoch is not the current session`.

#### Scenario: Pending predictions are cleared by application
- **GIVEN** a `ReconnectStateClient` that had prior pending sub-state from an earlier session.
- **WHEN** a full snapshot for the current session is applied.
- **THEN** `resyncPending` MUST be false and the returned directive MUST include
  `clear_block_predictions`, ensuring the caller resets `ClientBlockReconciler` and
  `ClientInventoryReconciler` so no prior-session prediction is replayed.

---

## Error and failure behavior

- Invalid recorded state (negative/non-integer tick, non-finite position, negative
  `inventoryStateId`, non-integer entity id, non-string chunk key) → descriptive `Reconnect:`
  throw, summary unchanged.
- `collectFullState` with a non-current epoch, duplicate chunk key, or invalid inventory →
  descriptive `Reconnect:` throw, no snapshot returned.
- `applyFullState` with a non-current epoch → descriptive `Reconnect:` throw, summary unchanged.

## Performance and resource bounds

- `compareSignatures`: O(|interest| + |entities|).
- `collectFullState` / `applyFullState`: O(n log n) for sorts plus O(n) for copies (n = number of
  chunks/entities/slots).
- Client summary memory bounded by the current interest and entity set sizes.

## Compatibility and migration

- Pure additive module. Reuses the existing payload types from 226 (`ChunkSnapshot`), 229
  (`EntitySpawnDescriptor`), and 231 (`ItemStack`, `WindowSlots`), and consumes the existing
  components' `reset()`/reseed hooks via the returned directive; none of those modules changes.

## Security and integrity

- Snapshot application is current-epoch-gated and idempotent, so a stale, duplicate, or
  out-of-order snapshot cannot corrupt client state.
- All snapshot fields are validated before any state mutation.

## Observability

- `ReconnectStateClient.signature()`, `resyncPending`, `lastDirective`, and `pendingActions`
  (action count of the last directive).

## Verification mapping

- Tests in `tests/unit/ReconnectStateRecovery.test.ts` verify every scenario above; the
  integration scenario wires the returned directive to the existing 227/228/229/230/231
  components to prove consistent reseeding.
