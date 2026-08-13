import type { BlockSelector } from './BlockSelector';
import { BlockId } from '../world/BlockRegistry';

export interface ItemStack {
  id: number;
  count: number;
}

export interface InventorySnapshot {
  version: 1;
  slots: number[];
  counts: number[];
  storage: ItemStack[];
  selected: number;
  /** Optional for backwards compatibility with pre-tool saves. */
  durability?: number[];
}

const MAX_STACK = 64;

/**
 * Player inventory / hotbar backing store.
 *
 * Holds an ordered list of block ids (one per hotbar slot) and tracks the
 * currently selected slot. Implements {@link BlockSelector} so the interaction
 * system can query which block to place.
 *
 * Default slots use the stable BlockId values from the registry:
 * Grass / Dirt / Stone / Sand / Wood / Planks / Glass / Water / Apple.
 */
const DEFAULT_SLOTS: number[] = [
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Sand,
  BlockId.Wood,
  BlockId.Planks,
  BlockId.Glass,
  BlockId.Water,
  BlockId.Apple,
];
const DEFAULT_COUNTS = [32, 32, 64, 16, 0, 0, 0, 8, 0];

export class Inventory implements BlockSelector {
  /** The block id in each hotbar slot. */
  slots: number[];
  /** The number of items in each hotbar slot. */
  counts: number[];
  /** Current durability for the item in each hotbar slot (0 for non-tools). */
  durability: number[];
  /** Index of the currently selected slot. */
  selected: number;
  /** Main-inventory stacks that are not shown in the nine-slot hotbar. */
  readonly storage: ItemStack[];

  constructor(slots?: number[], counts?: number[], storage?: ItemStack[]) {
    this.slots = slots && slots.length > 0 ? [...slots] : [...DEFAULT_SLOTS];
    this.counts = counts && counts.length === this.slots.length
      ? counts.map((count) => this.clampCount(count))
      : slots && slots.length > 0
        ? this.slots.map(() => MAX_STACK)
        : [...DEFAULT_COUNTS];
    this.durability = this.slots.map(() => 0);
    this.selected = 0;
    this.storage = storage
      ? storage.map((stack) => ({ id: stack.id, count: this.clampCount(stack.count) }))
      : [];
  }

  /**
   * Select a slot by index, clamping out-of-range values to the nearest valid
   * slot.
   */
  select(index: number): void {
    if (this.slots.length === 0) {
      return;
    }
    this.selected = Math.max(0, Math.min(this.slots.length - 1, Math.trunc(index)));
  }

  /**
   * Move the selection by a delta number of slots with wraparound.
   * Positive deltas move forward (past the last slot wraps to the first),
   * negative deltas move backward (past the first slot wraps to the last).
   */
  cycle(delta: number): void {
    if (this.slots.length === 0) {
      return;
    }
    const length = this.slots.length;
    const next = ((this.selected + delta) % length + length) % length;
    this.selected = next;
  }

  /** The block id of the currently selected slot. */
  getSelectedBlockId(): number {
    return this.slots[this.selected] ?? 0;
  }

  /** Number of items in a hotbar slot. */
  getSlotCount(index = this.selected): number {
    return this.counts[index] ?? 0;
  }

  /** Number of copies of an item across the hotbar and main inventory. */
  getItemCount(id: number): number {
    let total = 0;
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] === id) {
        total += this.counts[i] ?? 0;
      }
    }
    for (const stack of this.storage) {
      if (stack.id === id) {
        total += stack.count;
      }
    }
    return total;
  }

  /** Whether the inventory can pay an ingredient list. */
  hasItems(requirements: ReadonlyArray<readonly [number, number]>): boolean {
    return requirements.every(([id, count]) => this.getItemCount(id) >= count);
  }

  /** Whether a stack can be added without dropping the result on the ground. */
  canAddItem(id: number, amount: number): boolean {
    let capacity = 0;
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] === id) {
        capacity += MAX_STACK - (this.counts[i] ?? 0);
      }
    }
    for (const stack of this.storage) {
      if (stack.id === id) {
        capacity += MAX_STACK - stack.count;
      }
    }
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] !== id && (this.counts[i] ?? 0) <= 0) {
        capacity += MAX_STACK;
      }
    }
    capacity += (27 - this.storage.length) * MAX_STACK;
    return capacity >= Math.max(0, Math.trunc(amount));
  }

  /** Add items to existing stacks, then to empty storage/hotbar slots. */
  addItem(id: number, amount: number): number {
    let remaining = Math.max(0, Math.trunc(amount));
    if (remaining === 0) {
      return 0;
    }

    const targets: ItemStack[] = this.storage;
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] === id && (this.counts[i] ?? 0) < MAX_STACK) {
        const moved = Math.min(remaining, MAX_STACK - (this.counts[i] ?? 0));
        this.counts[i] = (this.counts[i] ?? 0) + moved;
        remaining -= moved;
        if (remaining === 0) return 0;
      }
    }
    for (const stack of targets) {
      if (stack.id === id && stack.count < MAX_STACK) {
        const moved = Math.min(remaining, MAX_STACK - stack.count);
        stack.count += moved;
        remaining -= moved;
        if (remaining === 0) return 0;
      }
    }

    // Empty zero-count hotbar cells behave like quick-access inventory slots,
    // which keeps crafted tools usable immediately instead of hiding them in
    // the storage grid.
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if ((this.counts[i] ?? 0) > 0) continue;
      const moved = Math.min(remaining, MAX_STACK);
      this.slots[i] = id;
      this.counts[i] = moved;
      this.durability[i] = 0;
      remaining -= moved;
    }

    while (remaining > 0 && targets.length < 27) {
      const moved = Math.min(remaining, MAX_STACK);
      targets.push({ id, count: moved });
      remaining -= moved;
    }
    return remaining;
  }

  /** Remove items from hotbar and storage. Returns false when unaffordable. */
  removeItem(id: number, amount: number): boolean {
    const requested = Math.max(0, Math.trunc(amount));
    if (this.getItemCount(id) < requested) {
      return false;
    }
    let remaining = requested;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (this.slots[i] !== id) continue;
      const removed = Math.min(remaining, this.counts[i] ?? 0);
      this.counts[i] = (this.counts[i] ?? 0) - removed;
      if (this.counts[i] === 0) {
        this.durability[i] = 0;
      }
      remaining -= removed;
    }
    for (let i = this.storage.length - 1; i >= 0 && remaining > 0; i--) {
      const stack = this.storage[i];
      if (!stack || stack.id !== id) continue;
      const removed = Math.min(remaining, stack.count);
      stack.count -= removed;
      remaining -= removed;
      if (stack.count === 0) {
        this.storage.splice(i, 1);
      }
    }
    return true;
  }

  /** Consume one item from the selected hotbar slot for placement. */
  consumeSelected(): boolean {
    const index = this.selected;
    if ((this.counts[index] ?? 0) <= 0) {
      return false;
    }
    this.counts[index]!--;
    return true;
  }

  /** Read the selected slot's durability, initializing a newly crafted tool. */
  getSelectedDurability(maxDurability: number): number {
    return this.getSlotDurability(this.selected, maxDurability);
  }

  getSlotDurability(index = this.selected, maxDurability = 0): number {
    if (index < 0 || index >= this.slots.length || (this.counts[index] ?? 0) <= 0 || maxDurability <= 0) {
      return 0;
    }
    if ((this.durability[index] ?? 0) <= 0) {
      this.durability[index] = Math.trunc(maxDurability);
    }
    return this.durability[index] ?? 0;
  }

  /** Damage the selected tool; returns true when the tool breaks. */
  damageSelectedItem(amount: number, maxDurability: number): boolean {
    if (maxDurability <= 0 || (this.counts[this.selected] ?? 0) <= 0) {
      return false;
    }
    const current = this.getSlotDurability(this.selected, maxDurability);
    const next = current - Math.max(1, Math.trunc(amount));
    if (next <= 0) {
      this.counts[this.selected] = 0;
      this.durability[this.selected] = 0;
      return true;
    }
    this.durability[this.selected] = next;
    return false;
  }

  /** Compact save representation for browser persistence. */
  snapshot(): InventorySnapshot {
    return {
      version: 1,
      slots: [...this.slots],
      counts: [...this.counts],
      storage: this.storage.map((stack) => ({ ...stack })),
      selected: this.selected,
      durability: [...this.durability],
    };
  }

  /** Restore a snapshot without allowing malformed values to escape. */
  restore(
    snapshot: unknown,
    isValidItem: (id: number) => boolean = () => true,
    maxDurabilityForItem: (id: number) => number = () => Infinity,
  ): boolean {
    if (typeof snapshot !== 'object' || snapshot === null) return false;
    const candidate = snapshot as Partial<InventorySnapshot>;
    if (
      candidate.version !== 1 ||
      !Array.isArray(candidate.slots) ||
      !Array.isArray(candidate.counts) ||
      candidate.slots.length !== candidate.counts.length ||
      candidate.slots.length === 0 ||
      candidate.slots.some((id) => !Number.isInteger(id) || !isValidItem(id)) ||
      candidate.counts.some((count) => !Number.isInteger(count) || count < 0 || count > MAX_STACK) ||
      !Array.isArray(candidate.storage) ||
      candidate.storage.length > 27 ||
      !Number.isInteger(candidate.selected) ||
      (candidate.durability !== undefined && (
        !Array.isArray(candidate.durability) ||
        candidate.durability.length !== candidate.slots.length ||
        candidate.durability.some((value, index) => (
          !Number.isInteger(value) ||
          value < 0 ||
          value > maxDurabilityForItem(candidate.slots?.[index] ?? -1)
        ))
      ))
    ) {
      return false;
    }
    for (const stack of candidate.storage) {
      if (
        typeof stack !== 'object' ||
        stack === null ||
        !Number.isInteger(stack.id) ||
        !isValidItem(stack.id) ||
        !Number.isInteger(stack.count) ||
        stack.count <= 0 ||
        stack.count > MAX_STACK
      ) {
        return false;
      }
    }
    this.slots = [...candidate.slots];
    this.counts = [...candidate.counts];
    this.durability = candidate.durability
      ? [...candidate.durability]
      : this.slots.map(() => 0);
    this.storage.length = 0;
    for (const stack of candidate.storage) {
      this.storage.push({ id: stack.id, count: stack.count });
    }
    this.select(candidate.selected!);
    return true;
  }

  private clampCount(count: number): number {
    return Math.max(0, Math.min(MAX_STACK, Math.trunc(count)));
  }
}
