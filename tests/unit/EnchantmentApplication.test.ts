import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  createDefaultEnchantmentRegistry,
  type EnchantmentRegistry,
} from '../../src/inventory/EnchantmentRegistry';
import {
  ENCHANTMENTS_COMPONENT,
  createDefaultStackComponentRegistry,
} from '../../src/inventory/StackDataComponents';
import type { ItemStack } from '../../src/inventory/Inventory';
import {
  applyArmorEnchantReduction,
  armorEnchantEPF,
  efficiencySpeedMultiplier,
  fortuneBonusCount,
  getEnchantmentLevel,
  getStackEnchantments,
  protectionEnchantKeysFor,
  protectionEPF,
  setStackEnchantments,
  silkTouchActive,
  unbreakingWearChance,
  weaponDamageBonus,
} from '../../src/inventory/EnchantmentApplication';

const reg: EnchantmentRegistry = createDefaultEnchantmentRegistry();
const rid = (k: string) => createResourceId('minecraft', k);

/** Attach a single enchantment to a fresh stack. */
function enchanted(id: number, key: string, level: number): ItemStack {
  return setStackEnchantments(
    { id, count: 1 },
    [{ id: rid(key), level }],
    reg,
  );
}

describe('EnchantmentApplication storage', () => {
  it('round-trips enchantments through set/get', () => {
    const stack = enchanted(20, 'efficiency', 3);
    const list = getStackEnchantments(stack, reg);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toEqual(rid('efficiency'));
    expect(list[0]!.level).toBe(3);
    expect(getEnchantmentLevel(stack, 'efficiency', reg)).toBe(3);
  });

  it('returns 0 level for an unknown key or absent enchantments', () => {
    const stack = enchanted(20, 'efficiency', 2);
    expect(getEnchantmentLevel(stack, 'fortune', reg)).toBe(0);
    expect(getEnchantmentLevel({ id: 20, count: 1 }, 'efficiency', reg)).toBe(0);
    expect(getStackEnchantments({ id: 20, count: 1 }, reg)).toEqual([]);
  });

  it('removes the component when storing an empty list', () => {
    const base = enchanted(20, 'efficiency', 3);
    const cleared = setStackEnchantments(base, [], reg);
    expect(getStackEnchantments(cleared, reg)).toEqual([]);
    expect(cleared.components?.has(ENCHANTMENTS_COMPONENT)).toBe(false);
  });

  it('does not mutate the input stack', () => {
    const before = enchanted(20, 'efficiency', 3);
    const after = setStackEnchantments(before, [{ id: rid('fortune'), level: 1 }], reg);
    expect(getEnchantmentLevel(before, 'fortune', reg)).toBe(0);
    expect(after).not.toBe(before);
  });
});

describe('EnchantmentApplication validation', () => {
  it('rejects an unknown enchantment id', () => {
    expect(() =>
      setStackEnchantments({ id: 20, count: 1 }, [{ id: rid('nope'), level: 1 }], reg),
    ).toThrow();
  });

  it('rejects a level above the enchantment max', () => {
    expect(() =>
      setStackEnchantments({ id: 20, count: 1 }, [{ id: rid('efficiency'), level: 6 }], reg),
    ).toThrow();
  });

  it('rejects conflicting enchantments (fortune + silk_touch)', () => {
    expect(() =>
      setStackEnchantments(
        { id: 20, count: 1 },
        [
          { id: rid('fortune'), level: 1 },
          { id: rid('silk_touch'), level: 1 },
        ],
        reg,
      ),
    ).toThrow();
  });

  it('rejects a non-integer level for the component value', () => {
    const componentReg = createDefaultStackComponentRegistry();
    expect(
      componentReg.get(ENCHANTMENTS_COMPONENT).validate({ ['minecraft:efficiency']: 1.5 }),
    ).toBe(false);
  });
});

describe('EnchantmentApplication mining primitives', () => {
  it('scales efficiency speed by 1 + 0.3*level (floored at 1)', () => {
    expect(efficiencySpeedMultiplier(0)).toBe(1);
    expect(efficiencySpeedMultiplier(3)).toBeCloseTo(1.9, 6);
    expect(efficiencySpeedMultiplier(5)).toBeCloseTo(2.5, 6);
  });

  it('activates silk touch at level >= 1', () => {
    expect(silkTouchActive(0)).toBe(false);
    expect(silkTouchActive(1)).toBe(true);
  });

  it('computes fortune bonus in 0..level from the rng', () => {
    expect(fortuneBonusCount(0, () => 0.999)).toBe(0);
    expect(fortuneBonusCount(3, () => 0)).toBe(0);
    expect(fortuneBonusCount(3, () => 0.99)).toBe(3); // floor(0.99 * 4)
    expect(fortuneBonusCount(3, () => 0.25)).toBe(1); // floor(0.25 * 4)
  });
});

describe('EnchantmentApplication durability primitives', () => {
  it('wears with probability 1/(level+1)', () => {
    expect(unbreakingWearChance(0)).toBe(1);
    expect(unbreakingWearChance(1)).toBe(0.5);
    expect(unbreakingWearChance(3)).toBeCloseTo(0.25, 6);
  });
});

describe('EnchantmentApplication weapon primitives', () => {
  it('adds sharpness 1 + 0.5*level', () => {
    expect(weaponDamageBonus('sharpness', 0)).toBe(0);
    expect(weaponDamageBonus('sharpness', 1)).toBe(1.5);
    expect(weaponDamageBonus('sharpness', 5)).toBe(3.5);
  });

  it('adds smite / bane_of_arthropods 2.5*level', () => {
    expect(weaponDamageBonus('smite', 2)).toBe(5);
    expect(weaponDamageBonus('bane_of_arthropods', 2)).toBe(5);
  });

  it('contributes 0 for unrelated or missing enchants', () => {
    expect(weaponDamageBonus('efficiency', 3)).toBe(0);
  });
});

describe('EnchantmentApplication armor EPF primitives', () => {
  it('gives protection level and specialized enchants 2*level', () => {
    expect(protectionEPF('protection', 4)).toBe(4);
    expect(protectionEPF('fire_protection', 4)).toBe(8);
    expect(protectionEPF('blast_protection', 3)).toBe(6);
  });

  it('maps damage types to the right specialized keys', () => {
    expect(protectionEnchantKeysFor('fire')).toEqual(['protection', 'fire_protection']);
    expect(protectionEnchantKeysFor('lava')).toEqual(['protection', 'fire_protection']);
    expect(protectionEnchantKeysFor('explosion')).toEqual(['protection', 'blast_protection']);
    expect(protectionEnchantKeysFor('blast')).toEqual(['protection', 'blast_protection']);
    expect(protectionEnchantKeysFor('projectile')).toEqual(['protection', 'projectile_protection']);
    expect(protectionEnchantKeysFor('arrow')).toEqual(['protection', 'projectile_protection']);
    expect(protectionEnchantKeysFor('fall')).toEqual(['protection']);
    expect(protectionEnchantKeysFor('drowning')).toEqual(['protection']);
    expect(protectionEnchantKeysFor()).toEqual(['protection']);
  });

  it('sums matching enchants capped at 20', () => {
    const stacks = [
      enchanted(100, 'fire_protection', 4),
      enchanted(101, 'fire_protection', 4),
      enchanted(102, 'fire_protection', 4),
    ];
    // 8 + 8 + 8 = 24, capped at 20.
    expect(armorEnchantEPF(stacks, reg, 'fire')).toBe(20);
  });

  it('counts only keys relevant to the damage type', () => {
    const stacks = [enchanted(100, 'protection', 4)];
    expect(armorEnchantEPF(stacks, reg, 'fall')).toBe(4);
    // A pure fire damage sees protection (4) + fire_protection (0 here) = 4.
    expect(armorEnchantEPF(stacks, reg, 'fire')).toBe(4);
  });

  it('ignores non-protection enchants for generic damage', () => {
    const stacks = [enchanted(100, 'fire_protection', 4)];
    expect(armorEnchantEPF(stacks, reg, 'fall')).toBe(0);
  });

  it('reduces post-armor damage by epf/(epf+1)', () => {
    expect(applyArmorEnchantReduction(20, 0)).toBe(20);
    expect(applyArmorEnchantReduction(20, 4)).toBeCloseTo(4, 6); // 20/5
    expect(applyArmorEnchantReduction(20, 19)).toBeCloseTo(1, 6); // 20/20
  });
});
