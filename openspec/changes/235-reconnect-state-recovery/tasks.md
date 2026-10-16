# Tasks: 235-reconnect-state-recovery

## 1. Implementation

- [x] 1.1 Define all types in `src/simulation/ReconnectStateRecovery.ts`: `SessionEpoch`, `Position`, `ClientStateSignature`, `ServerStateSignature`, `ResyncVerdict`, `InventorySnapshot`, `FullStateInput`, `FullStateSnapshot`, `ResyncAction`, `ClientResyncDirective`, `ConnectResult`, and the `Reconnect: <detail>` validation helpers (non-empty profile, non-negative safe-integer epoch/tick, finite position, safe-integer entity ids, string chunk keys).
- [x] 1.2 Implement `ReconnectStateManager` session-epoch issuance on `connect(profile)` (first = 1, monotonic thereafter), `isReconnect` detection, and active-session tracking.
- [x] 1.3 Implement `ReconnectStateManager.disconnect(profile)` (ends active session; throws when none active), `hasActiveSession`, `currentEpoch`, `isSessionCurrent` stale/replay rejection, and the bounded epoch history (default `historyLimit` 32, oldest dropped).
- [x] 1.4 Implement the standalone `compareSignatures(client, server)` divergence detector producing the ordered reason codes (`profile`, `epoch`, `tick`, `position`, `inventory state`, `interest`, `entity set` mismatch) with set-order-independent interest/entity comparison.
- [x] 1.5 Implement `ReconnectStateManager.collectFullState(profile, input)`: current-epoch gate, sorted de-duplicated chunk keys + sorted chunk snapshots, ascending-entity-id order, inventory window validation (hotbar length 9, valid stacks, non-negative `stateId`), and deterministic snapshot assembly.
- [x] 1.6 Implement `ReconnectStateClient`: `connect(profile, epoch)` (summary reset, `resyncPending = true`), `disconnect()`, `recordTick`/`recordPosition`/`recordInventoryStateId`/`setInterest`/`setEntities`, `signature()`, `applyFullState(snapshot)` (current-epoch gate, summary replacement, `resyncPending` clearance, `ClientResyncDirective` generation), and `reset()`/`lastDirective`/`pendingActions` accessors.

## 2. Validation & Unit Tests

- [x] 2.1 Unit tests for `connect`/`disconnect`/reconnect/epoch issuance (REQ-1, REQ-2) and the bounded epoch history (REQ-4): first-connect epoch 1, reconnect-incremented epoch + `isReconnect`, connect-after-disconnect, double-disconnect and no-active-session throws, empty/whitespace profile throws, connect/disconnect record ordering, `historyLimit` bounding with oldest-drop, invalid `historyLimit` construction throw.
- [x] 2.2 Unit tests for `isSessionCurrent` stale/replay and mid-transaction-disconnect rejection (REQ-3, REQ-5): current epoch accepted, previous-session epoch rejected, all-epochs-after-disconnect rejected, unknown profile rejected, and a late mid-drag inventory transaction against the old epoch is rejected.
- [x] 2.3 Unit tests for `compareSignatures` (REQ-2, REQ-3): exact-equal no-resync, empty-vs-empty no-resync, and one test per reason code — `profile`, `epoch` (incl. reconnect-after-disconnect and reconnect-after-keepalive-drop), `tick`, `position`, `inventory state`, `interest`, and `entity set` mismatch.
- [x] 2.4 Unit tests for `collectFullState` assembly determinism and validation (REQ-4): sorted de-duplicated chunk keys/snapshots, ascending entity ids, empty chunk/entity inputs, stale-epoch throw, duplicate-chunk-key throw, invalid-inventory throw, repeated-call determinism.
- [x] 2.5 Unit tests for `applyFullState` (REQ-5): summary replacement + full directive contents, duplicate-application idempotence, stale-epoch throw, `resyncPending` clearance and `clear_block_predictions` inclusion.
- [x] 2.6 Unit tests for client signature recording and input validation (REQ-1): recorded state reflected in `signature()`, sorted interest/entity emission, invalid tick/position/inventoryStateId/entity-id throws with unchanged summary.

## 3. Integration & Verification

- [x] 3.1 Integration test wiring the `ClientResyncDirective` to the existing components headlessly: reseed `MovementAuthority`/`MovementReconciler` (position + tick), `InventoryTransactionValidator`/`ClientInventoryReconciler` (via `reset(slots, hotbar, cursor, stateId)`), `ClientBlockReconciler` (`reset`), `ChunkStreamManager` (`reset` + `putSnapshot` for keys), and `ClientEntityStore` (seed from entity descriptors), then assert the reseeded state is consistent with the snapshot.
- [x] 3.2 Run the baseline regression gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`).
- [x] 3.3 Update `verification.md` with actual evidence and advance `PROGRAM_STATE.json`/`PROGRAM_STATE.md` to VERIFIED.
