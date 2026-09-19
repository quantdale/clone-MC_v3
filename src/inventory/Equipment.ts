/**
 * Player equipment state.
 *
 * Owns the four armor slots (Head / Chest / Legs / Feet) and the Offhand, each
 * holding one `ItemStack | null` (null = empty). The *mainhand* is deliberately
 * NOT a stored slot — it is the currently selected hotbar slot and is delegated
 * to `Inventory` (see `Inventory.equipment` and the 113 design). Storing full
 * `ItemStack` values (not bare ids) preserves armor durability and tool
 * components across equip/unequip and save/load.
 *
 * This module is state + serialization only. Protection math (116), offhand
 * shield blocking (144), and the equipment HUD (205) consume these primitives.
 */

import type { ItemStack, SerializedStackComponent } from './Inventory';
import { applyDamage, getRemainingDurability } from './DurabilityRules';
import {
  StackComponentMap,
  StackComponentValue,
  createDefaultStackComponentRegistry,
} from './StackDataComponents';
import { parseResourceId, resourceIdToString, type ResourceId } from '../data/ResourceId';

/** A single worn equipment slot. */
export enum EquipmentSlot {
  Head = 'head',
  Chest = 'chest',
  Legs = 'legs',
  Feet = 'feet',
  Offhand = 'offhand',
}

/** Canonical, stable serialization order for `EquipmentSnapshot.slots`. */
export const EQUIPMENT_SLOT_ORDER: readonly EquipmentSlot[] = [
  EquipmentSlot.Head,
  EquipmentSlot.Chest,
  EquipmentSlot.Legs,
  EquipmentSlot.Feet,
  EquipmentSlot.Offhand,
];

/** The four armor slots in the fixed order 116's protection math expects. */
export const ARMOR_SLOTS: readonly EquipmentSlot[] = EQUIPMENT_SLOT_ORDER.slice(0, 4);

/** Save representation for equipment, nested inside `InventorySnapshot`. */
export interface EquipmentSnapshot {
  version: 1;
  /** Parallel to {@link EQUIPMENT_SLOT_ORDER}; length is always 5. */
  slots: (EquipmentStackSnapshot | null)[];
}

/** JSON-safe equipment stack representation; legacy in-memory component maps are also accepted. */
export interface EquipmentStackSnapshot {
  id: number;
  count: number;
  components?: SerializedStackComponent[];
}

/** Result of applying durability wear to one stored equipment stack. */
export interface EquipmentDamageResult {
  stack: ItemStack | null;
  broke: boolean;
  changed: boolean;
}

const MAX_STACK = 64;
const EQUIPMENT_COMPONENT_REGISTRY = createDefaultStackComponentRegistry();

function serializeComponents(components: StackComponentMap | undefined): SerializedStackComponent[] {
  if (!components) return [];
  return components.entries().map(([id, value]) => ({
    id: resourceIdToString(id),
    value: value as StackComponentValue,
  }));
}

function resourceIdFromUnknown(value: unknown): ResourceId | null {
  if (typeof value === 'string') {
    try {
      return parseResourceId(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { namespace?: unknown; path?: unknown };
  if (typeof candidate.namespace !== 'string' || typeof candidate.path !== 'string') return null;
  try {
    return parseResourceId(`${candidate.namespace}:${candidate.path}`);
  } catch {
    return null;
  }
}

/** Decode the current JSON-safe form plus pre-279 in-memory/structured-clone maps. */
function deserializeComponents(input: unknown): StackComponentMap | undefined | null {
  if (input === undefined) return undefined;
  if (input instanceof StackComponentMap) return input.copy();

  let entries: Array<readonly [ResourceId, StackComponentValue]> | null = null;
  if (Array.isArray(input)) {
    entries = [];
    for (const entry of input) {
      if (typeof entry !== 'object' || entry === null) return null;
      const candidate = entry as { id?: unknown; value?: unknown };
      const id = resourceIdFromUnknown(candidate.id);
      if (!id) return null;
      const value = candidate.value;
      if (value === null || typeof value === 'object') {
        if (value === null || Array.isArray(value)) return null;
      } else if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
        return null;
      }
      entries.push([id, value as StackComponentValue]);
    }
  } else if (typeof input === 'object' && input !== null) {
    // IndexedDB structured-clones the old StackComponentMap as an object with
    // its private `values` Map but without class methods. Recover that shape so
    // existing records remain readable after the codec hardening.
    const values = (input as { values?: unknown }).values;
    if (!(values instanceof Map)) return null;
    entries = [];
    for (const stored of values.values()) {
      if (typeof stored !== 'object' || stored === null) return null;
      const candidate = stored as { id?: unknown; value?: unknown };
      const id = resourceIdFromUnknown(candidate.id);
      if (!id) return null;
      entries.push([id, candidate.value as StackComponentValue]);
    }
  } else {
    return null;
  }

  try {
    return new StackComponentMap(EQUIPMENT_COMPONENT_REGISTRY, entries);
  } catch {
    return null;
  }
}

/**
 * Worn equipment: five `ItemStack | null` slots plus serialize / atomic restore.
 *
 * New instances start empty. `setEquipment` always returns the previous stack
 * (the swap primitive) and clamps `count` into `[1, MAX_STACK]`. `restore` is
 * atomic: on any invalid input it returns `false` and mutates no slot.
 */
export class PlayerEquipment {
  private readonly slots = new Map<EquipmentSlot, ItemStack | null>();

  constructor() {
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      this.slots.set(slot, null);
    }
  }

  /** The stored stack for a slot, or null when empty. */
  getEquipment(slot: EquipmentSlot): ItemStack | null {
    return this.slots.get(slot) ?? null;
  }

  /**
   * Store `stack` (or null to clear) in `slot`, replacing any prior content, and
   * return the previous stack (or null). `count` is clamped into `[1, MAX_STACK]`;
   * the stack's `components` map is preserved by reference.
   */
  setEquipment(slot: EquipmentSlot, stack: ItemStack | null): ItemStack | null {
    const previous = this.slots.get(slot) ?? null;
    if (stack === null) {
      this.slots.set(slot, null);
      return previous;
    }
    const count = Math.max(1, Math.min(MAX_STACK, Math.trunc(stack.count || 1)));
    const next: ItemStack = {
      id: stack.id,
      count,
      ...(stack.components ? { components: stack.components } : {}),
    };
    this.slots.set(slot, next);
    return previous;
  }

  /** Remaining durability for a stored stack, or zero for an empty/non-durable slot. */
  getEquipmentDurability(slot: EquipmentSlot, maxDurability: number): number {
    return getRemainingDurability(maxDurability, this.getEquipment(slot) ?? undefined);
  }

  /** Apply shared durability wear to one equipment slot. */
  damageEquipment(
    slot: EquipmentSlot,
    amount: number,
    maxDurability: number,
    unbreakingLevel = 0,
    rng?: () => number,
  ): EquipmentDamageResult {
    const current = this.getEquipment(slot);
    if (maxDurability <= 0 || !current || current.count <= 0) {
      return { stack: current, broke: false, changed: false };
    }
    const result = applyDamage(maxDurability, current, amount, unbreakingLevel, rng);
    if (result.broke) {
      this.slots.set(slot, null);
      return { stack: null, broke: true, changed: true };
    }
    this.slots.set(slot, result.stack);
    return { stack: result.stack, broke: false, changed: result.stack !== current };
  }

  /** Reset every slot to empty. */
  clear(): void {
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      this.slots.set(slot, null);
    }
  }

  /**
   * Non-null armor stacks only, in `Head, Chest, Legs, Feet` order. The Offhand
   * slot is excluded; empty armor slots are skipped — the fixed order lets 116
   * resolve protection deterministically.
   */
  getArmorStacks(): ItemStack[] {
    const result: ItemStack[] = [];
    for (const slot of ARMOR_SLOTS) {
      const stack = this.slots.get(slot);
      if (stack && stack.count > 0) {
        result.push(stack);
      }
    }
    return result;
  }

  /** Pure, versioned snapshot of all five slots. */
  serialize(): EquipmentSnapshot {
    return {
      version: 1,
      slots: EQUIPMENT_SLOT_ORDER.map((slot) => {
        const stack = this.slots.get(slot);
        if (!stack) return null;
        const components = serializeComponents(stack.components);
        return {
          id: stack.id,
          count: stack.count,
          ...(components.length > 0 ? { components } : {}),
        };
      }),
    };
  }

  /**
   * Validate an equipment snapshot without mutating state. Accepts a present,
   * version-1 object whose `slots` is a length-5 array where every non-null entry
   * has an `isValidItem`-approved integer id and a positive integer `count` in
   * `[1, MAX_STACK]`.
   */
  static validateSnapshot(data: unknown, isValidItem: (id: number) => boolean): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const candidate = data as Partial<EquipmentSnapshot>;
    if (candidate.version !== 1) return false;
    if (!Array.isArray(candidate.slots) || candidate.slots.length !== EQUIPMENT_SLOT_ORDER.length) {
      return false;
    }
    for (const entry of candidate.slots) {
      if (entry === null) continue;
      if (typeof entry !== 'object' || entry === null) return false;
      const stack = entry as Partial<ItemStack>;
      const id = stack.id as unknown;
      const count = stack.count as unknown;
      if (typeof id !== 'number' || !Number.isInteger(id) || !isValidItem(id)) return false;
      if (typeof count !== 'number' || !Number.isInteger(count) || (count as number) <= 0 || (count as number) > MAX_STACK) {
        return false;
      }
      if (deserializeComponents(stack.components) === null) return false;
    }
    return true;
  }

  /**
   * Populate the slots from a valid snapshot. Returns `true` on success and
   * `false` (without mutating any slot) when the payload is malformed.
   */
  restore(data: unknown, isValidItem: (id: number) => boolean): boolean {
    if (!PlayerEquipment.validateSnapshot(data, isValidItem)) return false;
    const candidate = data as EquipmentSnapshot;
    const restored = candidate.slots.map((entry) => {
      if (entry === null) return null;
      const components = deserializeComponents(entry.components);
      if (components === null) return null;
      return { id: entry.id, count: entry.count, ...(components ? { components } : {}) };
    });
    // Validation above guarantees this cannot fail; retaining the guard keeps
    // the mutation atomic if a future component codec changes independently.
    if (restored.some((entry, index) => candidate.slots[index] !== null && entry === null)) return false;
    EQUIPMENT_SLOT_ORDER.forEach((slot, index) => this.slots.set(slot, restored[index] ?? null));
    return true;
  }
}
