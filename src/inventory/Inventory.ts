import type { BlockSelector } from './BlockSelector';
import { PlayerEquipment, type EquipmentSnapshot } from './Equipment';
import { ItemId, type ItemTypeRegistry, createDefaultItemRegistry } from './ItemRegistry';
import {
  DAMAGE_COMPONENT,
  type DamageComponentValue,
  StackComponentMap,
  createDefaultStackComponentRegistry,
  emptyStackComponents,
} from './StackDataComponents';
import { applyDamage, repair } from './DurabilityRules';

/**
 * One unified occupied-slot value: item identity, quantity, and the immutable
 * component map backing per-stack state (e.g. tool damage, introduced in 008).
 * An unoccupied slot is represented by a stack with `count <= 0`; components are
 * only meaningful for occupied stacks.
 */
export interface ItemStack {
  id: number;
  count: number;
  /** Immutable per-stack component data; absent for plain items. */
  components?: StackComponentMap;
}

/**
 * Save representation for browser persistence. This keeps the pre-009 shape
 * (parallel id/count/durability arrays plus a `{id,count}` storage list) so that
 * existing saves restore verbatim; 009 encodes tool wear as the damage component
 * for the round trip but exports it through the legacy `durability` field.
 */
export interface InventorySnapshot {
  version: 1;
  slots: number[];
  counts: number[];
  storage: ItemStack[];
  selected: number;
  /** Optional for backwards compatibility with pre-tool saves. */
  durability?: number[];
  /** Worn equipment (Head/Chest/Legs/Feet/Offhand); absent in pre-113 saves. */
  equipment?: EquipmentSnapshot;
}

const MAX_STACK = 64;

// One shared, immutable component registry for every inventory instance.
const SHARED_COMPONENT_REGISTRY = createDefaultStackComponentRegistry();
// A shared empty component map used when comparing against an absent map.
const EMPTY_COMPONENTS = emptyStackComponents();

/**
 * Player inventory / hotbar backing store.
 *
 * Represents the 9 hotbar slots and 27 storage slots (occupied subset) as unified
 * {@link ItemStack} values. Implements {@link BlockSelector} so the interaction
 * system can query which block to place.
 *
 * Default slots use the stable ItemId values from the registry:
 * Grass / Dirt / Stone / Sand / Wood / Planks / Glass / Water / Apple.
 */
const DEFAULT_SLOTS: number[] = [
  ItemId.Grass,
  ItemId.Dirt,
  ItemId.Stone,
  ItemId.Sand,
  ItemId.Wood,
  ItemId.Planks,
  ItemId.Glass,
  ItemId.Water,
  ItemId.Apple,
];
const DEFAULT_COUNTS = [32, 32, 64, 16, 0, 0, 0, 8, 0];

export class Inventory implements BlockSelector {
  /** The unified hotbar stacks, one per hotbar slot. */
  slots: ItemStack[];
  /** Index of the currently selected hotbar slot. */
  selected: number;
  /** Occupied main-inventory stacks (not shown in the nine-slot hotbar). */
  readonly storage: ItemStack[];
  /** Worn equipment (Head/Chest/Legs/Feet/Offhand). The mainhand is the selected
   *  hotbar slot and is delegated, not stored here. */
  readonly equipment: PlayerEquipment;

  private readonly registry: ItemTypeRegistry;

  constructor(
    slots?: number[],
    counts?: number[],
    storage?: ItemStack[],
    itemRegistry: ItemTypeRegistry = createDefaultItemRegistry(),
  ) {
    this.registry = itemRegistry;
    this.equipment = new PlayerEquipment();
    if (slots && slots.length > 0) {
      const countsPresent = counts !== undefined && counts.length === slots.length;
      this.slots = slots.map((id, i): ItemStack => {
        const raw = countsPresent ? (counts[i] ?? 0) : MAX_STACK;
        return { id, count: this.clampCount(raw) };
      });
    } else {
      this.slots = DEFAULT_SLOTS.map((id, i) => ({ id, count: this.clampCount(DEFAULT_COUNTS[i] ?? 0) }));
    }
    this.selected = 0;
    this.storage = (storage ? storage : []).map((stack) => ({ id: stack.id, count: this.clampCount(stack.count) }));
  }

  /** Maximum stack size for an item, falling back to the global cap. */
  private maxStackFor(id: number): number {
    const def = this.registry.getByLegacyId(id);
    return def ? def.stackSize : MAX_STACK;
  }

  /**
   * Whether two stacks may merge: equal item identity and logically equal
   * component maps. A missing map is equivalent to an empty map.
   */
  private componentsCompatible(a?: StackComponentMap, b?: StackComponentMap): boolean {
    return (a ?? EMPTY_COMPONENTS).equals(b ?? EMPTY_COMPONENTS);
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

  /** The item id of the currently selected slot. */
  getSelectedItemId(): number {
    return this.slots[this.selected]?.id ?? 0;
  }

  /** Number of items in a hotbar slot. */
  getSlotCount(index = this.selected): number {
    return this.slots[index]?.count ?? 0;
  }

  /** Number of copies of an item across the hotbar and main inventory. */
  getItemCount(id: number): number {
    let total = 0;
    for (const stack of this.slots) {
      if (stack.id === id) {
        total += stack.count ?? 0;
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
    const max = this.maxStackFor(id);
    let capacity = 0;
    for (const stack of this.slots) {
      if (stack.id === id && this.componentsCompatible(stack.components, undefined) && stack.count < max) {
        capacity += max - stack.count;
      }
    }
    for (const stack of this.storage) {
      if (stack.id === id && this.componentsCompatible(stack.components, undefined) && stack.count < max) {
        capacity += max - stack.count;
      }
    }
    for (const stack of this.slots) {
      if (stack.id !== id && (stack.count ?? 0) <= 0) {
        capacity += max;
      }
    }
    capacity += (27 - this.storage.length) * max;
    return capacity >= Math.max(0, Math.trunc(amount));
  }

  /** Add items to existing compatible stacks, then to empty storage/hotbar slots. */
  addItem(id: number, amount: number): number {
    const max = this.maxStackFor(id);
    let remaining = Math.max(0, Math.trunc(amount));
    if (remaining === 0) {
      return 0;
    }

    for (const stack of this.slots) {
      if (stack.id === id && this.componentsCompatible(stack.components, undefined) && stack.count < max) {
        const moved = Math.min(remaining, max - stack.count);
        stack.count += moved;
        remaining -= moved;
        if (remaining === 0) return 0;
      }
    }
    for (const stack of this.storage) {
      if (stack.id === id && this.componentsCompatible(stack.components, undefined) && stack.count < max) {
        const moved = Math.min(remaining, max - stack.count);
        stack.count += moved;
        remaining -= moved;
        if (remaining === 0) return 0;
      }
    }

    // Empty zero-count hotbar cells behave like quick-access inventory slots,
    // which keeps crafted tools usable immediately instead of hiding them in
    // the storage grid.
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const stack = this.slots[i];
      if (!stack || (stack.count ?? 0) > 0) continue;
      const moved = Math.min(remaining, max);
      this.slots[i] = { id, count: moved };
      remaining -= moved;
    }

    while (remaining > 0 && this.storage.length < 27) {
      const moved = Math.min(remaining, max);
      this.storage.push({ id, count: moved });
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
    for (const stack of this.slots) {
      if (stack.id !== id) continue;
      const removed = Math.min(remaining, stack.count);
      stack.count -= removed;
      if (stack.count === 0) {
        stack.components = undefined;
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
    const stack = this.slots[this.selected];
    if (!stack || stack.count <= 0) {
      return false;
    }
    stack.count -= 1;
    if (stack.count === 0) {
      stack.components = undefined;
    }
    return true;
  }

  /** Read the selected slot's remaining durability for a newly crafted tool. */
  getSelectedDurability(maxDurability: number): number {
    return this.getSlotDurability(this.selected, maxDurability);
  }

  /**
   * Remaining durability for a slot. A stack with no damage component is treated
   * as pristine (full durability); a damaged stack yields `max - damage`.
   */
  getSlotDurability(index = this.selected, maxDurability = 0): number {
    const stack = this.slots[index];
    if (!stack || stack.count <= 0 || maxDurability <= 0) {
      return 0;
    }
    const damage = stack.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage ?? 0;
    return Math.max(0, Math.min(maxDurability, maxDurability - damage));
  }

  /** The full stack in the currently selected hotbar slot, or null when empty. */
  getSelectedStack(): ItemStack | null {
    return this.slots[this.selected] ?? null;
  }

  /**
   * Damage the selected tool; returns true when the tool breaks. Delegates the
   * wear math to {@link applyDamage} (change 115) with identical observable
   * behavior: a break at zero zeros the stack and clears its components (so
   * existing durability tests stay green). The optional `unbreakingLevel`/`rng`
   * (change 119) let Unbreaking probabilistically skip wear.
   */
  damageSelectedItem(
    amount: number,
    maxDurability: number,
    unbreakingLevel = 0,
    rng?: () => number,
  ): boolean {
    const stack = this.slots[this.selected];
    if (maxDurability <= 0 || !stack || stack.count <= 0) {
      return false;
    }
    const result = applyDamage(maxDurability, stack, amount, unbreakingLevel, rng);
    this.slots[this.selected] = result.stack;
    return result.broke;
  }

  /**
   * Repair the selected tool, reducing accumulated damage via {@link repair}
   * (change 115). Returns true when the selected stack actually changed. A tool
   * whose `maxDurability <= 0` is not repairable and yields no change.
   */
  repairSelectedItem(amount: number): boolean {
    const stack = this.slots[this.selected];
    if (!stack || stack.count <= 0) {
      return false;
    }
    const max = this.registry.getByLegacyId(stack.id)?.maxDurability ?? 0;
    if (max <= 0) {
      return false;
    }
    const repaired = repair(max, stack, amount);
    const changed = repaired !== stack;
    this.slots[this.selected] = repaired;
    return changed;
  }

  /** Compact save representation for browser persistence. */
  snapshot(): InventorySnapshot {
    return {
      version: 1,
      slots: this.slots.map((stack) => stack.id),
      counts: this.slots.map((stack) => stack.count),
      storage: this.storage.map((stack) => ({ id: stack.id, count: stack.count })),
      selected: this.selected,
      durability: this.slots.map((stack) => this.remainingDurability(stack)),
      equipment: this.equipment.serialize(),
    };
  }

  /**
   * Restore a legacy snapshot without allowing malformed values to escape. Tool
   * wear stored in the `durability` field is translated into the 008 damage
   * component for the round trip.
   */
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
      )) ||
      (candidate.equipment !== undefined && !PlayerEquipment.validateSnapshot(candidate.equipment, isValidItem))
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
    this.slots = candidate.slots.map((id, i) => {
      const count = candidate.counts![i] ?? 0;
      const stack: ItemStack = { id, count: this.clampCount(count) };
      const max = maxDurabilityForItem(id);
      const durability = candidate.durability?.[i];
      if (max > 0 && count > 0 && Number.isInteger(durability) && (durability as number) > 0) {
        stack.components = new StackComponentMap(SHARED_COMPONENT_REGISTRY).with(
          DAMAGE_COMPONENT,
          { damage: max - (durability as number) },
        );
      }
      return stack;
    });
    this.storage.length = 0;
    for (const stack of candidate.storage) {
      this.storage.push({ id: stack.id, count: this.clampCount(stack.count) });
    }
    if (candidate.equipment !== undefined) {
      this.equipment.restore(candidate.equipment, isValidItem);
    }
    this.select(candidate.selected!);
    return true;
  }

  /** Remaining durability to record for a stack in a legacy snapshot. */
  private remainingDurability(stack: ItemStack): number {
    const max = this.registry.getByLegacyId(stack.id)?.maxDurability ?? 0;
    if (max <= 0 || stack.count <= 0) {
      return 0;
    }
    const damage = stack.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage ?? 0;
    return Math.max(0, Math.min(max, max - damage));
  }

  private clampCount(count: number): number {
    return Math.max(0, Math.min(MAX_STACK, Math.trunc(count)));
  }
}
