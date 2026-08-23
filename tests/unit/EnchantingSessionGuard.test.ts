import { describe, it, expect } from 'vitest';
import { enchantingTargetMatches } from '../../src/inventory/EnchantingTable';
import {
  emptyStackComponents,
  DAMAGE_COMPONENT,
  ENCHANTMENTS_COMPONENT,
} from '../../src/inventory/StackDataComponents';
import type { ItemStack } from '../../src/inventory/Inventory';

/**
 * Regression oracle (hardening 2026-08-23, F-INV-3): a stale enchanting
 * session used to apply against whatever stack was selected at apply time,
 * overwriting unrelated slot contents with an enchanted copy of the captured
 * item. The identity guard must accept only the captured stack itself.
 */
describe('enchantingTargetMatches', () => {
  const captured: ItemStack = { id: 20, count: 1 };

  it('accepts the identical pristine stack', () => {
    expect(enchantingTargetMatches({ id: 20, count: 1 }, captured)).toBe(true);
  });

  it('rejects a null live stack', () => {
    expect(enchantingTargetMatches(null, captured)).toBe(false);
  });

  it('rejects a different item or count', () => {
    expect(enchantingTargetMatches({ id: 21, count: 1 }, captured)).toBe(false);
    expect(enchantingTargetMatches({ id: 20, count: 2 }, captured)).toBe(false);
  });

  it('rejects extra accumulated wear', () => {
    const worn: ItemStack = {
      id: 20,
      count: 1,
      components: emptyStackComponents().with(DAMAGE_COMPONENT, { damage: 3 }),
    };
    expect(enchantingTargetMatches(worn, captured)).toBe(false);
  });

  it('rejects an enchantment change since capture', () => {
    const enchantedCapture: ItemStack = {
      ...captured,
      components: emptyStackComponents().with(ENCHANTMENTS_COMPONENT, {
        'minecraft:efficiency': 3,
      }),
    };
    const reEnchanted: ItemStack = {
      ...captured,
      components: emptyStackComponents().with(ENCHANTMENTS_COMPONENT, {
        'minecraft:efficiency': 4,
      }),
    };
    expect(enchantingTargetMatches(enchantedCapture, enchantedCapture)).toBe(true);
    expect(enchantingTargetMatches(reEnchanted, enchantedCapture)).toBe(false);
    // A pristine copy is not the enchanted capture either.
    expect(enchantingTargetMatches({ ...captured }, enchantedCapture)).toBe(false);
  });
});
