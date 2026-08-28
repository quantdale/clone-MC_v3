/**
 * Inventory ↔ 106-menu-slot conversion (251).
 *
 * The live furnace menu speaks `MenuSlot` (resource-id strings); the player
 * inventory speaks numeric-id `ItemStack`s. These helpers convert losslessly in
 * both directions, including per-stack components: the component map is carried
 * across as a plain record keyed by the component's string resource id, which
 * satisfies MenuTransaction's object-shaped `components` field. An unknown item
 * or a corrupt component record yields `null` so callers can quarantine the
 * payload instead of silently dropping items.
 */
import { parseResourceId, resourceIdToString } from '../data/ResourceId';
import type { MenuSlot } from './MenuTransaction';
import { MAX_CURSOR_COUNT } from './MenuTransaction';
import type { ItemStack } from './Inventory';
import type { ItemTypeRegistry } from './ItemRegistry';
import {
  StackComponentMap,
  createDefaultStackComponentRegistry,
  type StackComponentValue,
} from './StackDataComponents';

// Component maps validate against the same shared component vocabulary every
// other consumer constructs; instances are equal-by-content via `.equals`.
const COMPONENT_REGISTRY = createDefaultStackComponentRegistry();

function isFiniteCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function definitionForId(registry: ItemTypeRegistry, id: number) {
  try {
    return registry.getByLegacyId(id);
  } catch {
    return undefined;
  }
}

function definitionForKey(registry: ItemTypeRegistry, key: string) {
  try {
    const rid = parseResourceId(key);
    return registry.getByResourceId(rid);
  } catch {
    return undefined;
  }
}

/** Convert one inventory stack to its menu-slot form; empty stacks become null-item slots. */
export function stackToMenuSlot(
  stack: ItemStack | null | undefined,
  registry: ItemTypeRegistry,
): MenuSlot {
  if (!stack || !isFiniteCount(stack.count) || stack.count <= 0) {
    return { item: null, count: 0, maxStack: MAX_CURSOR_COUNT };
  }
  const def = definitionForId(registry, stack.id);
  if (!def) {
    // Unknown legacy id cannot be represented in the menu vocabulary.
    return { item: null, count: 0, maxStack: MAX_CURSOR_COUNT };
  }
  const slot: MenuSlot = {
    item: resourceIdToString(def.resourceId),
    count: stack.count,
    maxStack: Math.max(1, Math.min(MAX_CURSOR_COUNT, def.stackSize)),
  };
  if (stack.components !== undefined) {
    const components: Record<string, unknown> = {};
    for (const [id, value] of stack.components.entries()) {
      components[resourceIdToString(id)] = value;
    }
    if (Object.keys(components).length > 0) {
      slot.components = components;
    }
  }
  return slot;
}

/**
 * Convert a menu slot back into an inventory stack. Returns null when the slot is
 * empty or its contents are unusable (unknown item key / corrupt components) —
 * callers must treat null as "quarantine this slot", never as "delete silently".
 */
export function menuSlotToStack(slot: MenuSlot, registry: ItemTypeRegistry): ItemStack | null {
  if (slot.item === null || !isFiniteCount(slot.count) || slot.count <= 0) {
    return null;
  }
  const def = definitionForKey(registry, slot.item);
  if (!def) return null;
  const stack: ItemStack = { id: def.id, count: slot.count };
  if (slot.components !== undefined && typeof slot.components === 'object') {
    const entries: Array<[Parameters<typeof COMPONENT_REGISTRY.has>[0], unknown]> = [];
    for (const [key, value] of Object.entries(slot.components)) {
      try {
        const id = parseResourceId(key);
        if (!COMPONENT_REGISTRY.has(id)) return null;
        entries.push([id, value]);
      } catch {
        return null;
      }
    }
    if (entries.length > 0) {
      try {
        stack.components = new StackComponentMap(
          COMPONENT_REGISTRY,
          entries as Array<[Parameters<typeof COMPONENT_REGISTRY.has>[0], StackComponentValue]>,
        );
      } catch {
        return null;
      }
    }
  }
  return stack;
}
