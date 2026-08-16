# Design: 231-inventory-network-transactions

## Architecture overview

This change adds a pure headless inventory transaction model with no dependencies on rendering, networking transport, or game engine state. It mirrors the pattern from `228-client-prediction-reconciliation` and `230-block-interaction-networking`:

- **Server side**: `InventoryTransactionValidator` receives typed transaction requests, validates against authoritative window slot state, and returns `TransactionResult`.
- **Client side**: `ClientInventoryReconciler` records optimistic slot predictions and handles rollbacks when the server rejects.

Both classes are side-effect-free and fully deterministic.

## Types

```ts
type SlotId = number;   // non-negative safe integer

interface ItemStack {
  readonly id: number;      // non-negative safe integer item type ID
  readonly count: number;   // 1..maxCount
  readonly maxCount: number; // positive safe integer
}

// Window = ordered array of slots (null = empty)
type WindowSlots = ReadonlyArray<ItemStack | null>;

// State ID: server increments per accepted mutation; client echoes it back
type StateId = number; // non-negative safe integer

// Transaction types
type SlotClickButton = 'left' | 'right';
type DragPhase = 'start' | 'add' | 'end';

interface SlotClickRequest { readonly type: 'slot_click'; readonly windowId: number; readonly stateId: StateId; readonly slotId: SlotId; readonly button: SlotClickButton; }
interface HotbarSwapRequest { readonly type: 'hotbar_swap'; readonly windowId: number; readonly stateId: StateId; readonly slotId: SlotId; readonly hotbarSlot: number; }
interface DropRequest { readonly type: 'drop'; readonly windowId: number; readonly stateId: StateId; readonly slotId: SlotId; readonly whole: boolean; }
interface DragRequest { readonly type: 'drag'; readonly windowId: number; readonly stateId: StateId; readonly phase: DragPhase; readonly button: SlotClickButton; readonly slotId?: SlotId; }

type InventoryTransaction = SlotClickRequest | HotbarSwapRequest | DropRequest | DragRequest;

// Result
type TransactionResult =
  | { accepted: true;  stateId: StateId; mutations: SlotMutation[] }
  | { accepted: false; reason: string; authoritativeSlots: WindowSlots; stateId: StateId };

interface SlotMutation { slotId: SlotId; stack: ItemStack | null; }
```

## Server validator design

`InventoryTransactionValidator` holds:
- `slots: (ItemStack | null)[]` — current authoritative window content.
- `cursorItem: ItemStack | null` — item held on cursor (server-tracked).
- `stateId: StateId` — monotonic counter, starts at 0.
- `activeDrag: { button: SlotClickButton; slots: Set<SlotId> } | null` — current drag state.
- `hotbar: (ItemStack | null)[]` — hotbar slots (separate fixed-length array, length 9).

### Slot click

Left-click behavior:
- If cursor is null and slot is null → no-op (accepted, 0 mutations).
- If cursor is null and slot has item → pick up stack to cursor, clear slot.
- If cursor has item and slot is null → place cursor item in slot, clear cursor.
- If cursor has item and slot has same type and cursor.count + slot.count ≤ maxCount → merge to slot, reduce/clear cursor.
- If cursor has item and slot has same type but would overflow → place as many as possible, cursor retains remainder.
- If cursor has item and slot has different type → swap cursor and slot.

Right-click behavior:
- If cursor is null and slot has item → pick up half (ceil), leave half (floor) in slot.
- If cursor has item and slot is null → place 1 from cursor.
- If cursor has item and slot has same type and count < maxCount → place 1 from cursor.
- If cursor has item and slot has different type → swap cursor and slot.

### Hotbar swap

Exchange slot at `slotId` in the window with `hotbar[hotbarSlot]`.

### Drop

Whole=true: drop entire slot stack (set to null). Whole=false: drop 1 from top (reduce count, or null if 1).

### Drag

Start: begin drag, record button (left or right). Re-sending start while a drag is active is rejected with `'drag_not_started'` and leaves the existing drag and slot state untouched.
Add: add slotId to drag set. Reject with `'drag_not_started'` if no active drag.
End: distribute cursor item across all recorded drag slots in ascending slotId order:
- Left drag: `floor(count / n)` items per slot, with the first `count % n` eligible slots receiving one additional item; any remainder that cannot be placed stays on the cursor.
- Right drag: place 1 item per recorded slot where compatible.

### State ID validation

Every request must include a `stateId` matching the server's current `stateId`. Mismatch → reject with `'wrong_state_id'` and return current authoritative state.

## Client reconciler design

`ClientInventoryReconciler` holds:
- `predicted: Map<SlotId, ItemStack | null>` — pending optimistic slot changes.
- `predictedCursor: ItemStack | null | undefined` — predicted cursor (undefined = no prediction).

`predict(mutations: SlotMutation[], cursor?: ItemStack | null)` → records optimistic changes.
`reconcile(result: TransactionResult): ClientRollbackDirective | null` → clears the prediction; if rejected, returns rollback directive with authoritative slot states. If accepted, returns null.

## Determinism

All input validation happens before any mutation; rejected transactions never mutate server or drag state and return an authoritative snapshot. Drag distribution processes slots in deterministic ascending `slotId` order.

## Input validation

All numeric IDs must be non-negative safe integers. Counts must be in `[1, maxCount]`. `maxCount` must be positive. Slot IDs must be in `[0, slots.length)`. Hotbar slots must be in `[0, 8]`. Invalid inputs throw descriptive `InventoryTransaction: <detail>` errors.
