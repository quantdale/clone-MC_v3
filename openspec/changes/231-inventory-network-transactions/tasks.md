# Tasks: 231-inventory-network-transactions

## 1. Implementation

- [x] 1.1 Define all types in `src/simulation/InventoryTransactionNetworking.ts`: `ItemStack`, `SlotId`, `StateId`, `WindowSlots`, `SlotMutation`, `SlotClickRequest`, `HotbarSwapRequest`, `DropRequest`, `DragRequest`, `InventoryTransaction`, `TransactionResult`, `ClientRollbackDirective`.
- [x] 1.2 Implement `InventoryTransactionValidator` constructor with slot/hotbar/cursor/stateId/activeDrag management and input validation.
- [x] 1.3 Implement left-click and right-click slot interaction logic.
- [x] 1.4 Implement hotbar swap and drop action logic.
- [x] 1.5 Implement drag start/add/end logic with deterministic sorted slot distribution.
- [x] 1.6 Implement `ClientInventoryReconciler` prediction tracking and rollback reconciliation.

## 2. Validation & Unit Tests

- [x] 2.1 Unit tests for state ID validation (accept match, reject mismatch).
- [x] 2.2 Unit tests for left-click permutations (null/null, pick-up, place, merge, overflow, swap).
- [x] 2.3 Unit tests for right-click permutations (half-pick, place 1, swap).
- [x] 2.4 Unit tests for hotbar swap and drop (whole/partial).
- [x] 2.5 Unit tests for drag lifecycle (start, add slots, end with left/right distribution, duplicate-start rejection, drag without start rejection).
- [x] 2.6 Unit tests for `ClientInventoryReconciler` prediction tracking, acceptance, and rollback.
- [x] 2.7 Unit tests for input validation and determinism.

## 3. Integration & Verification

- [x] 3.1 Run baseline verification gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`).
- [x] 3.2 Update `verification.md`, `PROGRAM_STATE.json`, and `PROGRAM_STATE.md` with complete evidence and advance change to VERIFIED.
