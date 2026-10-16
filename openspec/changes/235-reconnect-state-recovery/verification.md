# Verification: 235-reconnect-state-recovery

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence

All evidence: `tests/unit/ReconnectStateRecovery.test.ts` (81 tests), all passing in the final gate run.

| Requirement | Evidence | Status |
|---|---|---|
| reconnect-session REQ-1 Session epoch issuance on connect | REQ-1 block (lines 109-243, 16 tests): first connect `{epoch: 1, isReconnect: false}`, reconnect-while-active and connect-after-clean-disconnect `{epoch: 2, isReconnect: true}`, per-profile independent counters, empty/whitespace profile throws `Reconnect: profile must be a non-empty string` with no session/history/epochCount mutation | PASS |
| reconnect-session REQ-2 Active-session tracking and disconnect | REQ-2 block (lines 109-243, 4 tests): disconnect ends the session (`hasActiveSession` false, `currentEpoch` null), disconnect-with-no-active-session and double-disconnect throw `Reconnect: profile has no active session` | PASS |
| reconnect-session REQ-3 Stale-session rejection | REQ-3 block (lines 245-373, 8 tests): current epoch accepted; previous-session epoch and all post-disconnect epochs rejected; unknown profile rejected; epoch validated (negative/non-integer/NaN → `Reconnect: epoch must be a non-negative safe integer`); profile validated | PASS |
| reconnect-session REQ-4 Bounded epoch history | REQ-4 block (lines 109-243, 5 tests): connect/disconnect/connect records oldest-first; `historyLimit: 2` drops the oldest; default limit 32 (35 transitions → 32 records, first = epoch 4); `historyLimit` 0/non-integer rejected at construction; history getter returns copies | PASS |
| reconnect-session REQ-5 Mid-transaction disconnect invalidation | REQ-5 block (lines 245-373, 2 tests + integration at 1006+): late mid-drag inventory drag-end tagged with the old epoch dropped at the server dispatch gate (real 231 `InventoryTransactionValidator` mid-drag state untouched); pending movement intent from the old session discarded; both prove `isSessionCurrent(alice, 1) === false` after reconnect | PASS |
| state-resynchronization REQ-1 State signature recording | REQ-1 block (lines 692-855, 14 tests): connect resets the summary + marks `resyncPending`; recorded tick/position/inventoryStateId/interest/entities reflected in `signature()`; interest/entities emitted sorted and de-duplicated; invalid tick/position/inventoryStateId/entity-id/chunk-key throws with summary unchanged; record methods throw `Reconnect: client is not connected` before connect; disconnect/double-disconnect; reset; reconnect resets summary; defensive copies | PASS |
| state-resynchronization REQ-2 Divergence detection | REQ-2 block (lines 374-511, 16 tests): equal → `{needsResync: false, reasons: []}`; empty-vs-empty sets equal; order-independent interest/entity set equality; one test per reason code (profile/epoch/tick/position/inventory state/interest/entity set); first-difference ordering; invalid signatures throw without a verdict | PASS |
| state-resynchronization REQ-3 Reconnect requires resync | REQ-3 block (lines 374-511, 2 tests): clean-disconnect reconnect (server epoch 3 vs client epoch 2) and keepalive-drop reconnect (server epoch 2 vs client epoch 1) both yield `['epoch mismatch']` | PASS |
| state-resynchronization REQ-4 Full snapshot assembly | REQ-4 block (lines 512-691, 13 tests): unsorted chunk/entity inputs assemble sorted de-duplicated `chunkKeys` + same-order `chunkSnapshots` + ascending-id `entities`; repeated calls byte-identical; empty chunks/entities allowed; stale-epoch and no-active-session throws `Reconnect: epoch is not the current session`; duplicate chunk key / duplicate entity id / input profile mismatch / invalid inventory (hotbar length, count > maxCount, negative stateId) / malformed snapshot / malformed descriptor / malformed tick/position throws; returned snapshot is a defensive copy | PASS |
| state-resynchronization REQ-5 Full snapshot application | REQ-5 block (lines 856-1005, 14 tests): application replaces the summary and returns the full 5-action directive (`reset_movement`, `reset_inventory`, `clear_block_predictions`, `reset_chunks`, `reset_entities`) with exact contents; duplicate application idempotent; stale-epoch snapshot throws `Reconnect: snapshot epoch is not the current session` with summary unchanged; mismatched profile / invalid inventory / unsorted or non-matching `chunkKeys` / unsorted or duplicate entity ids rejected; `pendingActions`/`lastDirective` defensive copies; predictions cleared | PASS |
| Integration (3.1) | Integration block (lines 1006-1190, 2 tests): end-to-end reconnect flow — client signature with stale epoch 1 vs authoritative epoch 2 → `epoch mismatch` resync verdict → `collectFullState` → `applyFullState` → directive executed against real `MovementAuthority`/`MovementReconciler`/`InventoryTransactionValidator`/`ClientInventoryReconciler`/`ClientBlockReconciler`/`ChunkStreamManager`/`ClientEntityStore`; reseeded state asserted consistent with the snapshot (position/tick/stateId/slots/hotbar/cursor, pending predictions cleared, chunk store rebuilt by key, entity store rebuilt by id, prior-session residue gone); mid-transaction drag disconnect dropped end-to-end at the session gate | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | PASS | `tsc --noEmit`, exit 0 (whole repo) |
| npm run lint | PASS | `eslint .`, exit 0 (whole repo) |
| npm test | PASS | 259 files, 3346/3346 tests (3265 baseline + 81 ReconnectStateRecovery) |
| npm run build | PASS | vite production build, 105 modules, exit 0 |
| npm run test:e2e | PASS | 22/22 Playwright tests |

## Edge/adversarial validation

- Stale/replay rejection: previous-session epochs, all post-disconnect epochs, and unknown profiles are rejected by `isSessionCurrent`; the epoch itself is validated (negative/non-integer/NaN throw) before the active-session check.
- Mid-transaction disconnect invalidation: a drag started under epoch 1 whose `end` arrives after reconnect to epoch 2 is dropped at the dispatch gate before reaching the 231 validator (validator state provably untouched); a pending movement intent from the old session is discarded.
- Snapshot assembly adversarials: duplicate chunk keys, duplicate entity ids, key/coordinate mismatches, hotbar length ≠ 9, `count > maxCount`, negative `stateId`, negative ticks, non-finite positions, malformed descriptors — all throw `Reconnect: <detail>` before any state mutation.
- Snapshot application adversarials: stale-epoch, mismatched-profile, internally inconsistent (unsorted/non-matching `chunkKeys`, unsorted/duplicate entity ids) and invalid-inventory snapshots are rejected; duplicate application of the same snapshot is idempotent (identical summary + directive).
- Defensive copies: mutating caller-held signatures/inputs/directories/history arrays cannot alter manager/client state.

## Migration/compatibility validation

- Pure additive module; no wire-format, registry, or save-schema changes. Imports only the established payload shapes from 226 (`ChunkSnapshot`/`columnKey`), 229 (`EntitySpawnDescriptor`), and 231 (`ItemStack`/`WindowSlots`) — none of those modules was edited.
- The existing 225-231 components are consumed only through their existing accessors and `reset()`/reseed hooks (verified in the integration tests): `MovementAuthority.spawn`, `MovementReconciler.reconcile`, `InventoryTransactionValidator.reset(slots, hotbar, cursorItem, stateId)`, `ClientInventoryReconciler.reset`, `ClientBlockReconciler.reset`, `ChunkStreamManager.reset`/`putSnapshot`, `ClientEntityStore.reset`/`applyBatch`.
- Full regression gate (existing 3265 unit + 22 e2e) stays green with the new module; build stays at 105 modules; the new module is pure and headless (no DOM/IO/transport).

## Performance/resource validation

- `connect`/`disconnect`/`isSessionCurrent`/`hasActiveSession`/`currentEpoch`: O(1).
- `compareSignatures`: O(|interest| + |entities|) via set comparison.
- `collectFullState`/`applyFullState`: O(n log n) for the sorts plus O(n) for defensive copies (n = chunks/entities/slots).
- Epoch history bounded by `historyLimit` (default 32, oldest dropped); client summary bounded by the current interest/entity set sizes.

## Regressions

None. Full suite green in the final gate run: typecheck PASS, lint PASS, unit 3346/3346, build PASS, e2e 22/22.

## Incomplete tasks

None. All 15 tasks complete (`tasks.md` all `[x]`).

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. Change 235-reconnect-state-recovery is complete and may advance. Next change: 236-multiplayer-load-tests.
