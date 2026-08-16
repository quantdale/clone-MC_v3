# Spec: inventory-network-transactions

## Requirements

### REQ-1 — State ID versioning
The server MUST maintain a monotonic `stateId`. Every incoming transaction MUST be rejected with reason `'wrong_state_id'` if the request's `stateId` does not match the server's current `stateId`. The authoritative slot state MUST be returned in all rejections.

### REQ-2 — Slot click (left-click)
The server MUST implement the standard Minecraft left-click slot interaction:
- Cursor null, slot null → no-op, accepted.
- Cursor null, slot has item → pick up entire stack, slot cleared.
- Cursor has item, slot null → place cursor to slot, cursor cleared.
- Cursor and slot have same type, combined count ≤ maxCount → merge, cursor reduced/cleared.
- Cursor and slot have same type, combined count > maxCount → fill slot to maxCount, cursor holds remainder.
- Cursor and slot have different types → swap cursor and slot.

### REQ-3 — Slot click (right-click)
The server MUST implement the standard Minecraft right-click slot interaction:
- Cursor null, slot has item → pick up ceil(count/2), leave floor(count/2) in slot.
- Cursor has item, slot null → place 1 from cursor.
- Cursor has item, slot same type, slot.count < maxCount → place 1 from cursor.
- Cursor has item, slot different type → swap.

### REQ-4 — Hotbar swap
The server MUST swap the contents of slot `slotId` with `hotbar[hotbarSlot]` (hotbarSlot in [0,8]).

### REQ-5 — Drop action
The server MUST set a slot to null (whole=true) or decrement its count by 1 (whole=false, null if count becomes 0).

### REQ-6 — Drag distribution
The server MUST support a three-phase drag (start/add/end):
- Start: begin new drag recording button. Reject with `'drag_not_started'` if already active when start re-sent.
- Add: record slot ID into the active drag set. Reject with `'drag_not_started'` if no active drag.
- End (left drag): distribute cursor item across recorded slots by ascending slotId, with `floor(count / n)` items per slot and the first `count % n` eligible slots receiving one additional item; update cursor with any remainder that could not be placed. End (right drag): place 1 item per recorded compatible slot.

### REQ-7 — Input validation
The validator MUST throw descriptive `InventoryTransaction: <detail>` errors for: invalid stateId, slot ID out of range, invalid count/maxCount, invalid hotbar slot, unknown transaction type, and non-integer numeric fields.

### REQ-8 — Client-side optimistic reconciliation
`ClientInventoryReconciler` MUST support:
- Recording predicted slot mutations and cursor state.
- On server acceptance: clear predictions, return null.
- On server rejection: clear predictions, return `ClientRollbackDirective` with authoritative slots.

### REQ-9 — Determinism
Drag slot distribution MUST process slots in ascending slotId order. All operations on equivalent initial state MUST produce identical results across repeated calls.
