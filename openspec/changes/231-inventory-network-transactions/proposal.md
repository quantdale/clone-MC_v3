# Proposal: 231-inventory-network-transactions

## Summary
Implement a pure headless server-authoritative inventory/container transaction system with client-side optimistic prediction and reconciliation. This covers the core network transaction protocol for slot click, item drag, hotbar slot swap, drop, and cursor item tracking — with server rejection and client resynchronization.

## Motivation
Block interaction networking (230) provides the spatial interaction model. Container and inventory mutation must follow the same pattern: every client-initiated slot action is validated server-side, accepted or rejected with the authoritative state, and if rejected, the client rolls back its optimistic prediction.

## Scope
**In scope:**
- `InventoryTransactionValidator` (server-side): validates click, swap, drop, and drag actions on inventory/container windows against server-authoritative slot state, returning accept/reject results.
- `ClientInventoryReconciler` (client-side): tracks predicted local slot mutations and applies server rollback directives on rejection.
- Transaction types: slot click (left/right), item drag (start/add/end), hotbar slot swap, throw/drop, and cursor item set.
- Rejection reasons: `'wrong_state_id'`, `'out_of_range'`, `'cannot_merge'`, `'drag_not_started'`, `'invalid_action'`.
- Deterministic operation on top of plain arrays (no DOM, no WebSocket, no game engine coupling).

**Out of scope:**
- Actual inventory GUI rendering (handled elsewhere).
- ItemStack duplication/NBT mergeability (treats stacks as opaque `{ id, count, maxCount }` records).
- Real networking transport (pure in-memory model).
- Crafting result slots and container-specific logic (separate change).

## Deliverables
1. `src/simulation/InventoryTransactionNetworking.ts` — types, validator, and reconciler.
2. `tests/unit/InventoryTransactionNetworking.test.ts` — ≥22 unit tests.
3. `openspec/changes/231-inventory-network-transactions/` — full OpenSpec artifact package.
