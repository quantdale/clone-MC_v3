/**
 * Pure headless inventory/container network transaction framework (231).
 *
 * Implements server-side authoritative validation of slot click, right-click,
 * hotbar swap, drop, and drag transactions, plus client-side optimistic
 * prediction and rollback reconciliation. No DOM or transport dependencies.
 */

export type SlotId = number;
export type StateId = number;
export type SlotClickButton = 'left' | 'right';
export type DragPhase = 'start' | 'add' | 'end';

export interface ItemStack {
  readonly id: number;
  readonly count: number;
  readonly maxCount: number;
}

export type WindowSlots = ReadonlyArray<ItemStack | null>;

export interface SlotMutation {
  readonly slotId: SlotId;
  readonly stack: ItemStack | null;
}

export interface SlotClickRequest {
  readonly type: 'slot_click';
  readonly windowId: number;
  readonly stateId: StateId;
  readonly slotId: SlotId;
  readonly button: SlotClickButton;
}

export interface HotbarSwapRequest {
  readonly type: 'hotbar_swap';
  readonly windowId: number;
  readonly stateId: StateId;
  readonly slotId: SlotId;
  readonly hotbarSlot: number;
}

export interface DropRequest {
  readonly type: 'drop';
  readonly windowId: number;
  readonly stateId: StateId;
  readonly slotId: SlotId;
  readonly whole: boolean;
}

export interface DragRequest {
  readonly type: 'drag';
  readonly windowId: number;
  readonly stateId: StateId;
  readonly phase: DragPhase;
  readonly button: SlotClickButton;
  readonly slotId?: SlotId;
}

export type InventoryTransaction = SlotClickRequest | HotbarSwapRequest | DropRequest | DragRequest;

export type TransactionResult =
  | {
      readonly accepted: true;
      readonly stateId: StateId;
      readonly mutations: readonly SlotMutation[];
    }
  | {
      readonly accepted: false;
      readonly reason: string;
      readonly authoritativeSlots: WindowSlots;
      readonly authoritativeCursor: ItemStack | null;
      readonly stateId: StateId;
    };

export interface ClientRollbackDirective {
  readonly authoritativeSlots: WindowSlots;
  readonly authoritativeCursor: ItemStack | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Internal validation helpers
// ────────────────────────────────────────────────────────────────────────────

function requireSafeNonNegInt(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    throw new Error(`InventoryTransaction: ${label} must be a non-negative safe integer`);
  }
  return v;
}

function requirePositiveInt(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
    throw new Error(`InventoryTransaction: ${label} must be a positive safe integer`);
  }
  return v;
}

function validateItemStack(stack: ItemStack, label: string): ItemStack {
  requireSafeNonNegInt(stack.id, `${label}.id`);
  requirePositiveInt(stack.maxCount, `${label}.maxCount`);
  if (typeof stack.count !== 'number' || !Number.isSafeInteger(stack.count) || stack.count < 1 || stack.count > stack.maxCount) {
    throw new Error(`InventoryTransaction: ${label}.count must be in [1, maxCount]`);
  }
  return stack;
}

function validateSlots(slots: WindowSlots, label: string): void {
  if (!Array.isArray(slots)) {
    throw new Error(`InventoryTransaction: ${label} must be an array`);
  }
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s !== null && s !== undefined) validateItemStack(s, `${label}[${i}]`);
  }
}

function validateSlotId(slotId: unknown, length: number): number {
  requireSafeNonNegInt(slotId, 'slotId');
  if ((slotId as number) >= length) {
    throw new Error(`InventoryTransaction: slotId ${slotId} out of range [0, ${length})`);
  }
  return slotId as number;
}

function validateHotbarSlot(slot: unknown): number {
  requireSafeNonNegInt(slot, 'hotbarSlot');
  if ((slot as number) > 8) {
    throw new Error('InventoryTransaction: hotbarSlot must be in [0, 8]');
  }
  return slot as number;
}

function isSameType(a: ItemStack, b: ItemStack): boolean {
  return a.id === b.id && a.maxCount === b.maxCount;
}

/** Read slot from mutable array with bounds safety (slot already validated). */
function getSlot(slots: (ItemStack | null)[], idx: number): ItemStack | null {
  return idx < slots.length ? (slots[idx] ?? null) : null;
}

function snapshots(slots: (ItemStack | null)[]): WindowSlots {
  return slots.map((s) => (s ? { id: s.id, count: s.count, maxCount: s.maxCount } : null));
}

// ────────────────────────────────────────────────────────────────────────────
// Server-side validator
// ────────────────────────────────────────────────────────────────────────────

export interface InventoryTransactionValidatorOptions {
  /** Initial window slots (array of ItemStack | null). Length determines window size. */
  readonly slots: WindowSlots;
  /** Hotbar (9 slots). */
  readonly hotbar?: WindowSlots;
  /** Initial cursor item (default null). */
  readonly cursorItem?: ItemStack | null;
  /** Initial stateId (default 0). */
  readonly initialStateId?: StateId;
}

export class InventoryTransactionValidator {
  private slots: (ItemStack | null)[];
  private hotbar: (ItemStack | null)[];
  private cursorItem: ItemStack | null;
  private stateId: StateId;
  private activeDrag: { button: SlotClickButton; slots: Set<SlotId> } | null = null;

  constructor(options: InventoryTransactionValidatorOptions) {
    if (typeof options !== 'object' || options === null) {
      throw new Error('InventoryTransaction: options must be an object');
    }
    validateSlots(options.slots, 'slots');
    const hotbar = options.hotbar ?? new Array<null>(9).fill(null);
    if (hotbar.length !== 9) {
      throw new Error('InventoryTransaction: hotbar must have exactly 9 slots');
    }
    validateSlots(hotbar, 'hotbar');
    if (options.cursorItem != null) validateItemStack(options.cursorItem, 'cursorItem');
    const sid = options.initialStateId ?? 0;
    requireSafeNonNegInt(sid, 'initialStateId');

    this.slots = Array.from(options.slots).map((s) => (s ? { ...s } : null));
    this.hotbar = Array.from(hotbar).map((s) => (s ? { ...s } : null));
    this.cursorItem = options.cursorItem ? { ...options.cursorItem } : null;
    this.stateId = sid;
  }

  get currentStateId(): StateId {
    return this.stateId;
  }

  get currentSlots(): WindowSlots {
    return snapshots(this.slots);
  }

  get currentHotbar(): WindowSlots {
    return snapshots(this.hotbar);
  }

  get currentCursorItem(): ItemStack | null {
    return this.cursorItem ? { ...this.cursorItem } : null;
  }

  get activeSlotCount(): number {
    return this.slots.length;
  }

  private reject(reason: string): TransactionResult {
    return {
      accepted: false,
      reason,
      authoritativeSlots: snapshots(this.slots),
      authoritativeCursor: this.cursorItem ? { ...this.cursorItem } : null,
      stateId: this.stateId,
    };
  }

  private accept(mutations: SlotMutation[]): TransactionResult {
    this.stateId++;
    return {
      accepted: true,
      stateId: this.stateId,
      mutations,
    };
  }

  processTransaction(tx: InventoryTransaction): TransactionResult {
    if (typeof tx !== 'object' || tx === null) {
      throw new Error('InventoryTransaction: transaction must be an object');
    }

    requireSafeNonNegInt(tx.stateId, 'stateId');
    if (tx.stateId !== this.stateId) {
      return this.reject('wrong_state_id');
    }

    switch (tx.type) {
      case 'slot_click':
        return this.processSlotClick(tx);
      case 'hotbar_swap':
        return this.processHotbarSwap(tx);
      case 'drop':
        return this.processDrop(tx);
      case 'drag':
        return this.processDrag(tx);
      default:
        throw new Error(`InventoryTransaction: unknown transaction type`);
    }
  }

  private processSlotClick(tx: SlotClickRequest): TransactionResult {
    const slotIdx = validateSlotId(tx.slotId, this.slots.length);
    const slot: ItemStack | null = getSlot(this.slots, slotIdx);
    const cursor: ItemStack | null = this.cursorItem;
    const mutations: SlotMutation[] = [];

    if (tx.button === 'left') {
      if (cursor === null && slot === null) {
        // No-op
        return this.accept([]);
      }

      if (cursor === null && slot !== null) {
        // Pick up entire slot
        this.cursorItem = { ...slot };
        this.slots[slotIdx] = null;
        mutations.push({ slotId: slotIdx, stack: null });
        return this.accept(mutations);
      }

      if (cursor !== null && slot === null) {
        // Place entire cursor
        this.slots[slotIdx] = { ...cursor };
        this.cursorItem = null;
        mutations.push({ slotId: slotIdx, stack: { ...cursor } });
        return this.accept(mutations);
      }

      if (cursor !== null && slot !== null) {
        if (isSameType(cursor, slot)) {
          const available = slot.maxCount - slot.count;
          const transfer = Math.min(cursor.count, available);
          if (transfer === 0) {
            // Swap (full slot, cannot merge)
            this.slots[slotIdx] = { ...cursor };
            this.cursorItem = { ...slot };
            mutations.push({ slotId: slotIdx, stack: { ...cursor } });
            return this.accept(mutations);
          }
          // Merge
          const newSlotCount = slot.count + transfer;
          const newCursorCount = cursor.count - transfer;
          const merged: ItemStack = { id: slot.id, count: newSlotCount, maxCount: slot.maxCount };
          this.slots[slotIdx] = merged;
          this.cursorItem = newCursorCount > 0 ? { id: cursor.id, count: newCursorCount, maxCount: cursor.maxCount } : null;
          mutations.push({ slotId: slotIdx, stack: merged });
          return this.accept(mutations);
        } else {
          // Different types — swap
          this.slots[slotIdx] = { ...cursor };
          this.cursorItem = { ...slot };
          mutations.push({ slotId: slotIdx, stack: { ...cursor } });
          return this.accept(mutations);
        }
      }
    }

    if (tx.button === 'right') {
      if (cursor === null && slot !== null) {
        // Pick up half (ceil)
        const take = Math.ceil(slot.count / 2);
        const leave = slot.count - take;
        this.cursorItem = { id: slot.id, count: take, maxCount: slot.maxCount };
        const leftover: ItemStack | null = leave > 0 ? { id: slot.id, count: leave, maxCount: slot.maxCount } : null;
        this.slots[slotIdx] = leftover;
        mutations.push({ slotId: slotIdx, stack: leftover });
        return this.accept(mutations);
      }

      if (cursor !== null && slot === null) {
        // Place 1
        const placed: ItemStack = { id: cursor.id, count: 1, maxCount: cursor.maxCount };
        this.slots[slotIdx] = placed;
        this.cursorItem = cursor.count > 1 ? { id: cursor.id, count: cursor.count - 1, maxCount: cursor.maxCount } : null;
        mutations.push({ slotId: slotIdx, stack: placed });
        return this.accept(mutations);
      }

      if (cursor !== null && slot !== null) {
        if (isSameType(cursor, slot) && slot.count < slot.maxCount) {
          // Place 1
          const updated: ItemStack = { id: slot.id, count: slot.count + 1, maxCount: slot.maxCount };
          this.slots[slotIdx] = updated;
          this.cursorItem = cursor.count > 1 ? { id: cursor.id, count: cursor.count - 1, maxCount: cursor.maxCount } : null;
          mutations.push({ slotId: slotIdx, stack: updated });
          return this.accept(mutations);
        } else {
          // Swap
          this.slots[slotIdx] = { ...cursor };
          this.cursorItem = { ...slot };
          mutations.push({ slotId: slotIdx, stack: { ...cursor } });
          return this.accept(mutations);
        }
      }

      // cursor null, slot null — no-op
      return this.accept([]);
    }

    throw new Error('InventoryTransaction: invalid button');
  }

  private processHotbarSwap(tx: HotbarSwapRequest): TransactionResult {
    const slotIdx = validateSlotId(tx.slotId, this.slots.length);
    const hotbarIdx = validateHotbarSlot(tx.hotbarSlot);

    const windowSlot: ItemStack | null = getSlot(this.slots, slotIdx);
    const hbSlot: ItemStack | null = getSlot(this.hotbar, hotbarIdx);

    this.slots[slotIdx] = hbSlot;
    this.hotbar[hotbarIdx] = windowSlot;

    const mutations: SlotMutation[] = [{ slotId: slotIdx, stack: hbSlot }];
    return this.accept(mutations);
  }

  private processDrop(tx: DropRequest): TransactionResult {
    const slotIdx = validateSlotId(tx.slotId, this.slots.length);
    const slot: ItemStack | null = getSlot(this.slots, slotIdx);

    if (slot === null) {
      // Nothing to drop
      return this.accept([]);
    }

    if (tx.whole) {
      this.slots[slotIdx] = null;
      return this.accept([{ slotId: slotIdx, stack: null }]);
    } else {
      if (slot.count <= 1) {
        this.slots[slotIdx] = null;
        return this.accept([{ slotId: slotIdx, stack: null }]);
      } else {
        const newSlot: ItemStack = { id: slot.id, count: slot.count - 1, maxCount: slot.maxCount };
        this.slots[slotIdx] = newSlot;
        return this.accept([{ slotId: slotIdx, stack: newSlot }]);
      }
    }
  }

  private processDrag(tx: DragRequest): TransactionResult {
    if (tx.phase === 'start') {
      if (this.activeDrag !== null) {
        // Duplicate start while a drag is active is a protocol violation.
        // Reject without mutating drag or slot state.
        return this.reject('drag_not_started');
      }
      this.activeDrag = { button: tx.button, slots: new Set() };
      // Drag start: no stateId increment, no mutations
      return {
        accepted: true,
        stateId: this.stateId,
        mutations: [],
      };
    }

    if (tx.phase === 'add') {
      if (this.activeDrag === null) {
        return this.reject('drag_not_started');
      }
      if (tx.slotId !== undefined) {
        validateSlotId(tx.slotId, this.slots.length);
        this.activeDrag.slots.add(tx.slotId);
      }
      return {
        accepted: true,
        stateId: this.stateId,
        mutations: [],
      };
    }

    if (tx.phase === 'end') {
      if (this.activeDrag === null) {
        return this.reject('drag_not_started');
      }

      const drag = this.activeDrag;
      this.activeDrag = null;

      const cursor: ItemStack | null = this.cursorItem;
      if (cursor === null || drag.slots.size === 0) {
        return this.accept([]);
      }

      // Sort slots ascending for determinism
      const sortedSlots = [...drag.slots].sort((a, b) => a - b);
      const mutations: SlotMutation[] = [];

      if (drag.button === 'left') {
        // Distribute as evenly as possible: base per slot, with the first
        // `extra` slots that can take a full share receiving one additional
        // item. Anything that cannot be placed stays on the cursor.
        const perSlot = Math.floor(cursor.count / sortedSlots.length);
        let extra = cursor.count % sortedSlots.length;
        let remaining = cursor.count;
        for (const sid of sortedSlots) {
          if (remaining <= 0) break;
          const desired = perSlot + (extra > 0 ? 1 : 0);
          const target: ItemStack | null = getSlot(this.slots, sid);
          if (target === null) {
            const give = Math.min(desired, remaining, cursor.maxCount);
            if (give < 1) continue;
            const placed: ItemStack = { id: cursor.id, count: give, maxCount: cursor.maxCount };
            this.slots[sid] = placed;
            remaining -= give;
            if (give === desired) extra = Math.max(0, extra - 1);
            mutations.push({ slotId: sid, stack: placed });
          } else if (isSameType(cursor, target)) {
            const available = target.maxCount - target.count;
            const give = Math.min(desired, remaining, available);
            if (give < 1) continue;
            const merged: ItemStack = { id: target.id, count: target.count + give, maxCount: target.maxCount };
            this.slots[sid] = merged;
            remaining -= give;
            if (give === desired) extra = Math.max(0, extra - 1);
            mutations.push({ slotId: sid, stack: merged });
          }
        }
        this.cursorItem = remaining > 0 ? { id: cursor.id, count: remaining, maxCount: cursor.maxCount } : null;
      } else {
        // Right drag: place 1 per slot
        let remaining = cursor.count;
        for (const sid of sortedSlots) {
          if (remaining <= 0) break;
          const target: ItemStack | null = getSlot(this.slots, sid);
          if (target === null) {
            const placed: ItemStack = { id: cursor.id, count: 1, maxCount: cursor.maxCount };
            this.slots[sid] = placed;
            remaining--;
            mutations.push({ slotId: sid, stack: placed });
          } else if (isSameType(cursor, target) && target.count < target.maxCount) {
            const updated: ItemStack = { id: target.id, count: target.count + 1, maxCount: target.maxCount };
            this.slots[sid] = updated;
            remaining--;
            mutations.push({ slotId: sid, stack: updated });
          }
        }
        this.cursorItem = remaining > 0 ? { id: cursor.id, count: remaining, maxCount: cursor.maxCount } : null;
      }

      return this.accept(mutations);
    }

    throw new Error('InventoryTransaction: invalid drag phase');
  }

  reset(slots: WindowSlots, hotbar?: WindowSlots, cursorItem?: ItemStack | null, stateId?: StateId): void {
    validateSlots(slots, 'slots');
    const hb = hotbar ?? new Array<null>(9).fill(null);
    if (hb.length !== 9) throw new Error('InventoryTransaction: hotbar must have exactly 9 slots');
    validateSlots(hb, 'hotbar');
    if (cursorItem != null) validateItemStack(cursorItem, 'cursorItem');
    const sid = stateId ?? 0;
    requireSafeNonNegInt(sid, 'stateId');

    this.slots = Array.from(slots).map((s) => (s ? { ...s } : null));
    this.hotbar = Array.from(hb).map((s) => (s ? { ...s } : null));
    this.cursorItem = cursorItem ? { ...cursorItem } : null;
    this.stateId = sid;
    this.activeDrag = null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Client-side reconciler
// ────────────────────────────────────────────────────────────────────────────

export class ClientInventoryReconciler {
  private pendingMutations: SlotMutation[] | null = null;

  get hasPending(): boolean {
    return this.pendingMutations !== null;
  }

  predict(mutations: readonly SlotMutation[]): void {
    for (const m of mutations) {
      requireSafeNonNegInt(m.slotId, 'mutation.slotId');
      if (m.stack !== null) validateItemStack(m.stack, 'mutation.stack');
    }
    this.pendingMutations = mutations.map((m) => ({ slotId: m.slotId, stack: m.stack ? { ...m.stack } : null }));
  }

  reconcile(result: TransactionResult): ClientRollbackDirective | null {
    if (typeof result !== 'object' || result === null) {
      throw new Error('InventoryTransaction: result must be an object');
    }
    this.pendingMutations = null;

    if (!result.accepted) {
      return {
        authoritativeSlots: result.authoritativeSlots.map((s) => (s ? { ...s } : null)),
        authoritativeCursor: result.authoritativeCursor ? { ...result.authoritativeCursor } : null,
      };
    }
    return null;
  }

  reset(): void {
    this.pendingMutations = null;
  }
}
