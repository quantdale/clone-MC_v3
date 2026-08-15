import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  ItemTypeRegistry,
  type ItemTypeDefinition,
} from '../../src/inventory/ItemRegistry';
import { PlayerEquipment, EquipmentSlot } from '../../src/inventory/Equipment';
import {
  DAMAGE_COMPONENT,
  type DamageComponentValue,
  emptyStackComponents,
} from '../../src/inventory/StackDataComponents';
import type { ItemStack } from '../../src/inventory/Inventory';
import {
  ArmorProtection,
  applyArmorWear,
  computeArmorStats,
  reduceDamage,
} from '../../src/player/ArmorProtection';

const rid = (k: string) => createResourceId('minecraft', k);

function def(id: number, key: string, extra: Partial<ItemTypeDefinition> = {}): ItemTypeDefinition {
  return {
    id,
    resourceId: rid(key),
    key,
    name: key,
    iconTile: 0,
    stackSize: 1,
    ...extra,
  };
}

/** Test registry: three armor pieces, one fragile piece, one non-durable piece. */
const registry = new ItemTypeRegistry([
  def(100, 'a', { defensePoints: 12, toughness: 4, maxDurability: 100 }),
  def(101, 'b', { defensePoints: 10, toughness: 8, maxDurability: 100 }),
  def(102, 'c', { defensePoints: 6, toughness: 2, maxDurability: 100 }),
  def(103, 'fragile', { maxDurability: 10 }),
  def(104, 'cloth', { maxDurability: 0 }),
]);

const stack = (id: number, components?: ItemStack['components']): ItemStack => ({
  id,
  count: 1,
  ...(components ? { components } : {}),
});

const damagedStack = (id: number, damage: number): ItemStack =>
  stack(id, emptyStackComponents().with(DAMAGE_COMPONENT, { damage }));

describe('computeArmorStats', () => {
  it('sums defense points and toughness, capping each at 20', () => {
    const stats = computeArmorStats([stack(100), stack(101), stack(102)], registry);
    expect(stats).toEqual({ points: 20, toughness: 14 }); // 28->20, 14->14
  });

  it('treats a missing item definition as zero', () => {
    const stats = computeArmorStats([stack(999)], registry);
    expect(stats).toEqual({ points: 0, toughness: 0 });
  });
});

describe('reduceDamage', () => {
  it('nearly eliminates tiny damage with full armor (~80% low-damage cap)', () => {
    const r = reduceDamage(0.01, { points: 20, toughness: 0 }, false);
    expect(r.reduced).toBeCloseTo(0.0022, 4);
    expect(r.absorbed).toBeCloseTo(0.0078, 4);
    expect(r.absorbed).toBeGreaterThan(0.7 * 0.01);
    expect(r.absorbed).toBeLessThan(0.85 * 0.01);
  });

  it('provides no reduction with zero armor', () => {
    expect(reduceDamage(10, { points: 0, toughness: 0 }, false)).toEqual({
      reduced: 10,
      absorbed: 0,
    });
  });

  it('poorly absorbs high damage with zero toughness', () => {
    const r = reduceDamage(20, { points: 20, toughness: 0 }, false);
    expect(r.reduced).toBeCloseTo(12.446, 3);
    expect(r.absorbed).toBeCloseTo(7.554, 3);
    expect(r.reduced + r.absorbed).toBeCloseTo(20, 6);
  });

  it('preserves protection at high damage with full toughness', () => {
    const r = reduceDamage(20, { points: 20, toughness: 20 }, false);
    expect(r.reduced).toBeCloseTo(5.476, 3);
    expect(r.absorbed).toBeCloseTo(14.524, 3);
    expect(r.absorbed).toBeGreaterThan(7.554); // more than zero-toughness case
  });

  it('passes through non-positive raw damage', () => {
    expect(reduceDamage(0, { points: 20, toughness: 0 }, false)).toEqual({
      reduced: 0,
      absorbed: 0,
    });
  });

  it('passes through when bypass armor is set', () => {
    expect(reduceDamage(20, { points: 20, toughness: 20 }, true)).toEqual({
      reduced: 20,
      absorbed: 0,
    });
  });
});

describe('applyArmorWear', () => {
  it('spreads equal wear across four durable pieces', () => {
    const result = applyArmorWear(
      [stack(100), stack(101), stack(102), stack(103)],
      8,
      registry,
    );
    expect(result).toHaveLength(4);
    for (const s of result) {
      expect(s).not.toBeNull();
      expect(s!.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(2); // ceil(8/4)
      expect(s!.count).toBe(1);
    }
  });

  it('returns null for a piece that breaks', () => {
    const result = applyArmorWear([damagedStack(103, 9)], 4, registry); // remaining 1; wear 4
    expect(result).toHaveLength(1);
    expect(result[0]).toBeNull();
  });

  it('skips non-durable pieces unchanged', () => {
    const input = stack(104);
    const result = applyArmorWear([input], 4, registry);
    expect(result[0]).toBe(input); // same reference, unchanged
  });

  it('is a no-op when nothing is absorbed', () => {
    const input = stack(100);
    const result = applyArmorWear([input], 0, registry);
    expect(result[0]).toBe(input);
  });
});

describe('ArmorProtection class', () => {
  it('aggregates stats from worn equipment', () => {
    const equipment = new PlayerEquipment();
    equipment.setEquipment(EquipmentSlot.Head, stack(100));
    equipment.setEquipment(EquipmentSlot.Chest, stack(101));
    equipment.setEquipment(EquipmentSlot.Legs, stack(102));
    const armor = new ArmorProtection(equipment, registry);
    expect(armor.getStats()).toEqual({ points: 20, toughness: 14 });
  });

  it('applies wear to slots and clears a broken piece', () => {
    const equipment = new PlayerEquipment();
    equipment.setEquipment(EquipmentSlot.Head, damagedStack(103, 9)); // breaks
    equipment.setEquipment(EquipmentSlot.Chest, stack(100)); // wears
    const armor = new ArmorProtection(equipment, registry);
    armor.applyWear(4); // pieceCount 2 => wear 2 each
    expect(equipment.getEquipment(EquipmentSlot.Head)).toBeNull();
    const chest = equipment.getEquipment(EquipmentSlot.Chest);
    expect(chest?.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(2);
  });
});
