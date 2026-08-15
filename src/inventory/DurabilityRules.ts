/**
 * General, component-driven durability rules for tools and armor (change 115).
 *
 * Centralizes the wear/break/repair math that previously lived inline in
 * `Inventory.damageSelectedItem`. Everything operates on an `ItemStack` plus the
 * item's `maxDurability` and the accumulated `DAMAGE_COMPONENT`. Functions are pure:
 * they return a new `ItemStack` and never mutate the input, which keeps them reusable
 * by later enchantment (119) and anvil/grindstone/mending (948/949/2202/2203) changes.
 */

import { type ItemStack } from './Inventory';
import {
  DAMAGE_COMPONENT,
  type DamageComponentValue,
  emptyStackComponents,
} from './StackDataComponents';

/** Result of applying wear: the (possibly new) stack and whether it broke. */
export interface DamageResult {
  stack: ItemStack;
  broke: boolean;
}

/**
 * Remaining durability for a stack: `clamp(max - damage, 0, max)` for a tool
 * (`max > 0`), `0` for a non-tool (`max <= 0`) or empty/missing stack.
 */
export function getRemainingDurability(
  maxDurability: number,
  stack: ItemStack | undefined,
): number {
  if (maxDurability <= 0 || !stack || stack.count <= 0) return 0;
  const damage = stack.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage ?? 0;
  return Math.max(0, Math.min(maxDurability, maxDurability - damage));
}

/**
 * Whether a stack is a broken tool: a tool (`max > 0`) whose remaining durability
 * `<= 0`, or a tool stack with `count <= 0`. Non-tools are never broken.
 */
export function isBroken(maxDurability: number, stack: ItemStack | undefined): boolean {
  if (maxDurability <= 0) return false;
  if (!stack || stack.count <= 0) return true;
  return getRemainingDurability(maxDurability, stack) <= 0;
}

/** Amount of wear to apply, coerced to at least `1` (matches prior inline math). */
function wearOf(amount: number): number {
  return Math.max(1, Math.trunc(amount));
}

/** Return a new stack carrying the given accumulated damage (or `undefined` at 0). */
function withDamage(stack: ItemStack, damage: number): ItemStack {
  if (damage <= 0) {
    if (stack.components?.has(DAMAGE_COMPONENT)) {
      return { ...stack, components: stack.components.without(DAMAGE_COMPONENT) };
    }
    return stack;
  }
  const map = stack.components ?? emptyStackComponents();
  return { ...stack, components: map.with(DAMAGE_COMPONENT, { damage }) };
}

/**
 * Apply `amount` wear to a stack. Accumulates `max(1, trunc(amount))` into the
 * `DAMAGE_COMPONENT` for a tool. When remaining durability reaches `<= 0` the
 * returned stack has `count = 0` and `components = undefined` (`broke = true`),
 * exactly matching the prior inline zeroing. Non-tools and empty/missing stacks are
 * returned unchanged with `broke = false`.
 */
export function applyDamage(
  maxDurability: number,
  stack: ItemStack,
  amount: number,
): DamageResult {
  if (maxDurability <= 0 || !stack || stack.count <= 0) {
    return { stack, broke: false };
  }
  const damage = stack.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage ?? 0;
  const remaining = maxDurability - damage;
  const next = remaining - wearOf(amount);
  if (next <= 0) {
    return { stack: { ...stack, count: 0, components: undefined }, broke: true };
  }
  const newDamage = maxDurability - next;
  return { stack: withDamage(stack, newDamage), broke: false };
}

/**
 * Repair a stack by reducing accumulated damage by `max(1, trunc(amount))`, clamped
 * at `0` (pristine). Preserves `count` and identity; non-tools, empty/missing, and
 * already-pristine stacks are returned unchanged.
 */
export function repair(maxDurability: number, stack: ItemStack, amount: number): ItemStack {
  if (maxDurability <= 0 || !stack || stack.count <= 0) {
    return stack;
  }
  const damage = stack.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage ?? 0;
  if (damage <= 0) return stack;
  const newDamage = Math.max(0, damage - wearOf(amount));
  return withDamage(stack, newDamage);
}
