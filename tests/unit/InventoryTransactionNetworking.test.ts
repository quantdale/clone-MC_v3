import { describe, expect, it, beforeEach } from 'vitest';
import {
  InventoryTransactionValidator,
  ClientInventoryReconciler,
  type ItemStack,
  type WindowSlots,
} from '../../src/simulation/InventoryTransactionNetworking';

function stone(count: number): ItemStack {
  return { id: 1, count, maxCount: 64 };
}

function wood(count: number): ItemStack {
  return { id: 2, count, maxCount: 64 };
}

function bucket(count: number): ItemStack {
  return { id: 10, count, maxCount: 1 };
}

function makeSlots(size: number, ...filled: [number, ItemStack][]): WindowSlots {
  const slots: (ItemStack | null)[] = new Array<null>(size).fill(null);
  for (const [idx, stack] of filled) {
    slots[idx] = stack;
  }
  return slots;
}

describe('InventoryTransactionNetworking', () => {
  describe('State ID Versioning (REQ-1)', () => {
    it('rejects transaction with mismatched stateId', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9) });
      const result = v.processTransaction({
        type: 'slot_click',
        windowId: 0,
        stateId: 99,
        slotId: 0,
        button: 'left',
      });
      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.reason).toBe('wrong_state_id');
        expect(result.stateId).toBe(0);
      }
    });

    it('accepts transaction with matching stateId and increments stateId on mutation', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9, [0, stone(5)]) });
      expect(v.currentStateId).toBe(0);
      const r = v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' });
      expect(r.accepted).toBe(true);
      if (r.accepted) expect(r.stateId).toBe(1);
      expect(v.currentStateId).toBe(1);
    });

    it('does not increment stateId on no-op (null slot left-click)', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9) });
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' });
      expect(v.currentStateId).toBe(1);
    });
  });

  describe('Left-Click Slot Interaction (REQ-2)', () => {
    let v: InventoryTransactionValidator;
    beforeEach(() => {
      v = new InventoryTransactionValidator({ slots: makeSlots(9) });
    });

    it('no-op when cursor and slot are both null', () => {
      const r = v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' });
      expect(r.accepted).toBe(true);
      if (r.accepted) expect(r.mutations).toHaveLength(0);
    });

    it('picks up entire stack from slot to cursor', () => {
      v.reset(makeSlots(9, [0, stone(10)]));
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' });
      expect(v.currentCursorItem).toEqual(stone(10));
      expect(v.currentSlots[0]).toBeNull();
    });

    it('places cursor to empty slot', () => {
      v.reset(makeSlots(9), undefined, stone(5));
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 2, button: 'left' });
      expect(v.currentSlots[2]).toEqual(stone(5));
      expect(v.currentCursorItem).toBeNull();
    });

    it('merges same-type stacks when total fits', () => {
      v.reset(makeSlots(9, [0, stone(10)]), undefined, stone(20));
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' });
      expect(v.currentSlots[0]).toEqual(stone(30));
      expect(v.currentCursorItem).toBeNull();
    });

    it('fills slot to maxCount and cursor holds remainder on overflow', () => {
      v.reset(makeSlots(9, [0, stone(60)]), undefined, stone(10));
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' });
      expect(v.currentSlots[0]).toEqual(stone(64));
      expect(v.currentCursorItem).toEqual(stone(6));
    });

    it('swaps cursor and slot when different item types', () => {
      v.reset(makeSlots(9, [0, stone(5)]), undefined, wood(3));
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' });
      expect(v.currentSlots[0]).toEqual(wood(3));
      expect(v.currentCursorItem).toEqual(stone(5));
    });

    it('swaps cursor and slot when same type but slot is full', () => {
      v.reset(makeSlots(9, [0, stone(64)]), undefined, stone(32));
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' });
      expect(v.currentSlots[0]).toEqual(stone(32));
      expect(v.currentCursorItem).toEqual(stone(64));
    });
  });

  describe('Right-Click Slot Interaction (REQ-3)', () => {
    let v: InventoryTransactionValidator;
    beforeEach(() => {
      v = new InventoryTransactionValidator({ slots: makeSlots(9) });
    });

    it('picks up ceil(count/2) to cursor, leaves floor(count/2) in slot', () => {
      v.reset(makeSlots(9, [0, stone(7)]));
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'right' });
      expect(v.currentCursorItem).toEqual(stone(4)); // ceil(7/2)
      expect(v.currentSlots[0]).toEqual(stone(3)); // floor(7/2)
    });

    it('picks up single item from single-count slot', () => {
      v.reset(makeSlots(9, [0, stone(1)]));
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'right' });
      expect(v.currentCursorItem).toEqual(stone(1));
      expect(v.currentSlots[0]).toBeNull();
    });

    it('places 1 from cursor into empty slot', () => {
      v.reset(makeSlots(9), undefined, stone(10));
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 3, button: 'right' });
      expect(v.currentSlots[3]).toEqual(stone(1));
      expect(v.currentCursorItem).toEqual(stone(9));
    });

    it('places 1 from cursor into same-type slot that is not full', () => {
      v.reset(makeSlots(9, [0, stone(20)]), undefined, stone(5));
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'right' });
      expect(v.currentSlots[0]).toEqual(stone(21));
      expect(v.currentCursorItem).toEqual(stone(4));
    });

    it('swaps cursor and slot when different types (right-click)', () => {
      v.reset(makeSlots(9, [0, stone(5)]), undefined, wood(3));
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'right' });
      expect(v.currentSlots[0]).toEqual(wood(3));
      expect(v.currentCursorItem).toEqual(stone(5));
    });
  });

  describe('Hotbar Swap and Drop (REQ-4, REQ-5)', () => {
    it('swaps window slot with hotbar slot', () => {
      const hb = makeSlots(9, [2, wood(7)]);
      const v = new InventoryTransactionValidator({ slots: makeSlots(9, [0, stone(3)]), hotbar: hb });
      v.processTransaction({ type: 'hotbar_swap', windowId: 0, stateId: 0, slotId: 0, hotbarSlot: 2 });
      expect(v.currentSlots[0]).toEqual(wood(7));
      expect(v.currentHotbar[2]).toEqual(stone(3));
    });

    it('swaps null window slot with hotbar slot', () => {
      const hb = makeSlots(9, [0, stone(4)]);
      const v = new InventoryTransactionValidator({ slots: makeSlots(9), hotbar: hb });
      v.processTransaction({ type: 'hotbar_swap', windowId: 0, stateId: 0, slotId: 1, hotbarSlot: 0 });
      expect(v.currentSlots[1]).toEqual(stone(4));
      expect(v.currentHotbar[0]).toBeNull();
    });

    it('drops entire slot on whole=true', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9, [0, stone(10)]) });
      v.processTransaction({ type: 'drop', windowId: 0, stateId: 0, slotId: 0, whole: true });
      expect(v.currentSlots[0]).toBeNull();
    });

    it('drops 1 from slot on whole=false', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9, [0, stone(5)]) });
      v.processTransaction({ type: 'drop', windowId: 0, stateId: 0, slotId: 0, whole: false });
      expect(v.currentSlots[0]).toEqual(stone(4));
    });

    it('drops last item from slot on whole=false', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9, [0, stone(1)]) });
      v.processTransaction({ type: 'drop', windowId: 0, stateId: 0, slotId: 0, whole: false });
      expect(v.currentSlots[0]).toBeNull();
    });

    it('drop no-op on empty slot', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9) });
      const r = v.processTransaction({ type: 'drop', windowId: 0, stateId: 0, slotId: 0, whole: true });
      expect(r.accepted).toBe(true);
      if (r.accepted) expect(r.mutations).toHaveLength(0);
    });
  });

  describe('Drag Distribution (REQ-6)', () => {
    it('left drag distributes cursor evenly across empty slots (deterministic ascending order)', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9), cursorItem: stone(9) });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'start', button: 'left' });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 2 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 0 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 4 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'end', button: 'left' });
      // 9 / 3 = 3 per slot
      expect(v.currentSlots[0]).toEqual(stone(3));
      expect(v.currentSlots[2]).toEqual(stone(3));
      expect(v.currentSlots[4]).toEqual(stone(3));
      expect(v.currentCursorItem).toBeNull();
    });

    it('right drag places 1 per slot', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9), cursorItem: stone(10) });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'start', button: 'right' });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'right', slotId: 1 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'right', slotId: 3 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'end', button: 'right' });
      expect(v.currentSlots[1]).toEqual(stone(1));
      expect(v.currentSlots[3]).toEqual(stone(1));
      expect(v.currentCursorItem).toEqual(stone(8));
    });

    it('rejects add without start with drag_not_started', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9) });
      const r = v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 0 });
      expect(r.accepted).toBe(false);
      if (!r.accepted) expect(r.reason).toBe('drag_not_started');
    });

    it('rejects end without start with drag_not_started', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9) });
      const r = v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'end', button: 'left' });
      expect(r.accepted).toBe(false);
      if (!r.accepted) expect(r.reason).toBe('drag_not_started');
    });

    it('rejects duplicate start while drag active with drag_not_started', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9), cursorItem: stone(9) });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'start', button: 'left' });
      const r = v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'start', button: 'left' });
      expect(r.accepted).toBe(false);
      if (!r.accepted) {
        expect(r.reason).toBe('drag_not_started');
        // Rejection must not mutate state: authoritative snapshot returned, no stateId change
        expect(r.stateId).toBe(0);
        expect(r.authoritativeSlots).toHaveLength(9);
      }
      // The original drag remains active and can still complete
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 0 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'end', button: 'left' });
      expect(v.currentSlots[0]).toEqual(stone(9));
      expect(v.currentCursorItem).toBeNull();
    });

    it('left drag spreads remainder (+1 to earliest slots)', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9), cursorItem: stone(10) });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'start', button: 'left' });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 4 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 0 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 2 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'end', button: 'left' });
      // 10 / 3 = 3 per slot, remainder 1 goes to the earliest slot
      expect(v.currentSlots[0]).toEqual(stone(4));
      expect(v.currentSlots[2]).toEqual(stone(3));
      expect(v.currentSlots[4]).toEqual(stone(3));
      expect(v.currentCursorItem).toBeNull();
    });

    it('left drag with fewer items than slots places 1 in earliest slots', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9), cursorItem: stone(2) });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'start', button: 'left' });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 6 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 1 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 4 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'end', button: 'left' });
      expect(v.currentSlots[1]).toEqual(stone(1));
      expect(v.currentSlots[4]).toEqual(stone(1));
      expect(v.currentSlots[6]).toBeNull();
      expect(v.currentCursorItem).toBeNull();
    });

    it('left drag keeps unplaceable remainder on cursor when a slot is incompatible', () => {
      const v = new InventoryTransactionValidator({
        slots: makeSlots(9, [3, wood(64)]),
        cursorItem: stone(10),
      });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'start', button: 'left' });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 1 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 3 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 5 });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'end', button: 'left' });
      // 10 / 3 = 3 per slot with +1 to the earliest. Slot 3 is a full, incompatible
      // stack and is skipped; 4 + 3 placed, so the remaining 3 stays on the cursor.
      expect(v.currentSlots[1]).toEqual(stone(4));
      expect(v.currentSlots[3]).toEqual(wood(64));
      expect(v.currentSlots[5]).toEqual(stone(3));
      expect(v.currentCursorItem).toEqual(stone(3));
    });
  });

  describe('ClientInventoryReconciler (REQ-8)', () => {
    it('records predictions and returns null rollback on accepted result', () => {
      const reconciler = new ClientInventoryReconciler();
      expect(reconciler.hasPending).toBe(false);
      reconciler.predict([{ slotId: 0, stack: stone(5) }]);
      expect(reconciler.hasPending).toBe(true);

      const rollback = reconciler.reconcile({
        accepted: true,
        stateId: 1,
        mutations: [{ slotId: 0, stack: stone(5) }],
      });
      expect(rollback).toBeNull();
      expect(reconciler.hasPending).toBe(false);
    });

    it('returns rollback directive on server rejection', () => {
      const reconciler = new ClientInventoryReconciler();
      const authoritative = makeSlots(9, [0, stone(10)]);
      reconciler.predict([{ slotId: 0, stack: null }]);
      const rollback = reconciler.reconcile({
        accepted: false,
        reason: 'wrong_state_id',
        authoritativeSlots: authoritative,
        authoritativeCursor: null,
        stateId: 0,
      });
      expect(rollback).not.toBeNull();
      expect(rollback?.authoritativeSlots[0]).toEqual(stone(10));
      expect(rollback?.authoritativeCursor).toBeNull();
      expect(reconciler.hasPending).toBe(false);
    });

    it('resets cleanly', () => {
      const reconciler = new ClientInventoryReconciler();
      reconciler.predict([{ slotId: 0, stack: stone(5) }]);
      expect(reconciler.hasPending).toBe(true);
      reconciler.reset();
      expect(reconciler.hasPending).toBe(false);
    });
  });

  describe('Input Validation and Determinism (REQ-7, REQ-9)', () => {
    it('rejects invalid slot ID', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9) });
      expect(() =>
        v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 20, button: 'left' }),
      ).toThrow('InventoryTransaction: slotId 20 out of range [0, 9)');
    });

    it('rejects invalid hotbar slot', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9) });
      expect(() =>
        v.processTransaction({ type: 'hotbar_swap', windowId: 0, stateId: 0, slotId: 0, hotbarSlot: 9 }),
      ).toThrow('InventoryTransaction: hotbarSlot must be in [0, 8]');
    });

    it('rejects ItemStack with invalid count', () => {
      expect(() => new InventoryTransactionValidator({ slots: makeSlots(9, [0, { id: 1, count: 0, maxCount: 64 }]) })).toThrow(
        'InventoryTransaction: slots[0].count must be in [1, maxCount]',
      );
    });

    it('rejects ItemStack with count exceeding maxCount', () => {
      expect(() => new InventoryTransactionValidator({ slots: makeSlots(9, [0, { id: 1, count: 65, maxCount: 64 }]) })).toThrow(
        'InventoryTransaction: slots[0].count must be in [1, maxCount]',
      );
    });

    it('produces deterministic results across identical drag sequences', () => {
      const run = () => {
        const v = new InventoryTransactionValidator({ slots: makeSlots(9), cursorItem: stone(9) });
        v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'start', button: 'left' });
        v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 5 });
        v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 1 });
        v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', button: 'left', slotId: 3 });
        v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'end', button: 'left' });
        return v.currentSlots;
      };

      expect(run()).toEqual(run());
    });

    it('maxCount=1 stacks (bucket) support swap, not merge', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9, [0, bucket(1)]), cursorItem: bucket(1) });
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' });
      // Should swap: cursor gets the old slot bucket, slot gets the cursor bucket
      expect(v.currentSlots[0]).toEqual(bucket(1));
      expect(v.currentCursorItem).toEqual(bucket(1));
    });
  });

  describe('adversarial replay/ordering integrity (237)', () => {
    it('rejects a replayed stateId as wrong_state_id leaving state unchanged', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9) });
      v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' });
      const before = v.currentSlots;
      const result = v.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' });
      expect(result.accepted).toBe(false);
      if (!result.accepted) expect(result.reason).toBe('wrong_state_id');
      expect(v.currentStateId).toBe(1);
      expect(v.currentSlots).toEqual(before);
    });

    it('rejects drag end without start as drag_not_started leaving slots unchanged', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9) });
      const before = v.currentSlots;
      const end = v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'end', button: 'left' });
      expect(end.accepted).toBe(false);
      if (!end.accepted) expect(end.reason).toBe('drag_not_started');
      expect(v.currentStateId).toBe(0);
      expect(v.currentSlots).toEqual(before);
    });

    it('rejects a duplicate drag start without disturbing the active drag', () => {
      const v = new InventoryTransactionValidator({ slots: makeSlots(9) });
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'start', button: 'left' });
      const dup = v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'start', button: 'left' });
      expect(dup.accepted).toBe(false);
      if (!dup.accepted) expect(dup.reason).toBe('drag_not_started');
      v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'add', slotId: 2, button: 'left' });
      const end = v.processTransaction({ type: 'drag', windowId: 0, stateId: 0, phase: 'end', button: 'left' });
      expect(end.accepted).toBe(true);
    });
  });
});
