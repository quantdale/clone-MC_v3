import { describe, it, expect } from 'vitest';
import {
  PlayerEquipment,
  EquipmentSlot,
  EQUIPMENT_SLOT_ORDER,
  ARMOR_SLOTS,
} from '../../src/inventory/Equipment';
import { Inventory } from '../../src/inventory/Inventory';
import {
  DAMAGE_COMPONENT,
  type DamageComponentValue,
  StackComponentMap,
  createDefaultStackComponentRegistry,
} from '../../src/inventory/StackDataComponents';
import { createDefaultItemRegistry } from '../../src/inventory/ItemRegistry';

const registry = createDefaultItemRegistry();

const isValid = (id: number) => registry.has(id);
const maxDur = (id: number) => registry.getByLegacyId(id)?.maxDurability ?? 0;

// Item ids from the default registry (stable values per ItemRegistry.ts).
const GRASS = 1;
const DIRT = 2;
const WOOD = 7;
const APPLE = 13;
const WOODEN_PICKAXE = 20; // tool with maxDurability 59

/** A damaged tool stack carrying the damage component. */
function damagedPickaxe(damage: number) {
  const components = new StackComponentMap(createDefaultStackComponentRegistry()).with(
    DAMAGE_COMPONENT,
    { damage },
  );
  return { id: WOODEN_PICKAXE, count: 1, components };
}

describe('Equipment: slot model and mainhand delegation', () => {
  it('starts empty with exactly five slots', () => {
    const eq = new PlayerEquipment();
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      expect(eq.getEquipment(slot)).toBeNull();
    }
    expect(EQUIPMENT_SLOT_ORDER.length).toBe(5);
    expect(ARMOR_SLOTS.length).toBe(4);
  });

  it('new Inventory starts with empty equipment', () => {
    const inv = new Inventory();
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      expect(inv.equipment.getEquipment(slot)).toBeNull();
    }
  });

  it('mainhand is the selected hotbar slot, not an equipment slot', () => {
    const inv = new Inventory([GRASS, DIRT], [5, 3]);
    inv.select(1);
    // Mainhand reads from the hotbar, not from equipment.
    expect(inv.getSelectedItemId()).toBe(DIRT);
    expect(inv.equipment.getEquipment(EquipmentSlot.Offhand)).toBeNull();
    // No sixth mainhand slot exists in equipment.
    expect((EQUIPMENT_SLOT_ORDER as readonly string[]).includes('mainhand')).toBe(false);
  });
});

describe('Equipment: get', () => {
  it('empty slot returns null', () => {
    const eq = new PlayerEquipment();
    expect(eq.getEquipment(EquipmentSlot.Head)).toBeNull();
  });

  it('occupied slot returns the stored stack', () => {
    const eq = new PlayerEquipment();
    eq.setEquipment(EquipmentSlot.Chest, { id: WOOD, count: 1 });
    expect(eq.getEquipment(EquipmentSlot.Chest)).toEqual({ id: WOOD, count: 1 });
  });
});

describe('Equipment: set / swap', () => {
  it('equip stores and returns the previous (empty) slot', () => {
    const eq = new PlayerEquipment();
    const prev = eq.setEquipment(EquipmentSlot.Head, { id: GRASS, count: 1 });
    expect(prev).toBeNull();
    expect(eq.getEquipment(EquipmentSlot.Head)).toEqual({ id: GRASS, count: 1 });
  });

  it('re-equip swaps and returns the old stack', () => {
    const eq = new PlayerEquipment();
    eq.setEquipment(EquipmentSlot.Head, { id: GRASS, count: 1 });
    const prev = eq.setEquipment(EquipmentSlot.Head, { id: DIRT, count: 1 });
    expect(prev).toEqual({ id: GRASS, count: 1 });
    expect(eq.getEquipment(EquipmentSlot.Head)).toEqual({ id: DIRT, count: 1 });
  });

  it('setting null clears and returns the previous', () => {
    const eq = new PlayerEquipment();
    eq.setEquipment(EquipmentSlot.Feet, { id: WOOD, count: 1 });
    const prev = eq.setEquipment(EquipmentSlot.Feet, null);
    expect(prev).toEqual({ id: WOOD, count: 1 });
    expect(eq.getEquipment(EquipmentSlot.Feet)).toBeNull();
  });

  it('preserves components (tool damage) through equip', () => {
    const eq = new PlayerEquipment();
    const tool = damagedPickaxe(10);
    eq.setEquipment(EquipmentSlot.Offhand, tool);
    const got = eq.getEquipment(EquipmentSlot.Offhand);
    expect(got?.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(10);
  });

  it('clamps count into [1, MAX_STACK]', () => {
    const eq = new PlayerEquipment();
    eq.setEquipment(EquipmentSlot.Head, { id: GRASS, count: 0 });
    expect(eq.getEquipment(EquipmentSlot.Head)?.count).toBe(1);
    eq.setEquipment(EquipmentSlot.Head, { id: GRASS, count: 999 });
    expect(eq.getEquipment(EquipmentSlot.Head)?.count).toBe(64);
  });
});

describe('Equipment: clear', () => {
  it('empties every slot', () => {
    const eq = new PlayerEquipment();
    eq.setEquipment(EquipmentSlot.Head, { id: GRASS, count: 1 });
    eq.setEquipment(EquipmentSlot.Offhand, { id: APPLE, count: 1 });
    eq.clear();
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      expect(eq.getEquipment(slot)).toBeNull();
    }
  });
});

describe('Equipment: armor stack accessor', () => {
  it('returns non-null armor in Head→Chest→Legs→Feet order', () => {
    const eq = new PlayerEquipment();
    eq.setEquipment(EquipmentSlot.Chest, { id: WOOD, count: 1 });
    eq.setEquipment(EquipmentSlot.Feet, { id: DIRT, count: 1 });
    eq.setEquipment(EquipmentSlot.Offhand, { id: APPLE, count: 1 });
    const armor = eq.getArmorStacks();
    expect(armor).toEqual([{ id: WOOD, count: 1 }, { id: DIRT, count: 1 }]);
  });

  it('skips empty armor slots and excludes offhand', () => {
    const eq = new PlayerEquipment();
    eq.setEquipment(EquipmentSlot.Offhand, { id: APPLE, count: 1 });
    expect(eq.getArmorStacks()).toEqual([]);
  });
});

describe('Equipment: serialize and restore', () => {
  it('round-trips through restore', () => {
    const a = new PlayerEquipment();
    a.setEquipment(EquipmentSlot.Head, { id: GRASS, count: 1 });
    a.setEquipment(EquipmentSlot.Offhand, { id: APPLE, count: 1 });
    const snap = a.serialize();
    expect(snap.version).toBe(1);
    expect(snap.slots.length).toBe(5);

    const b = new PlayerEquipment();
    expect(b.restore(snap, isValid)).toBe(true);
    expect(b.getEquipment(EquipmentSlot.Head)).toEqual({ id: GRASS, count: 1 });
    expect(b.getEquipment(EquipmentSlot.Offhand)).toEqual({ id: APPLE, count: 1 });
  });

  it('preserves components across serialize/restore', () => {
    const a = new PlayerEquipment();
    a.setEquipment(EquipmentSlot.Chest, damagedPickaxe(7));
    const b = new PlayerEquipment();
    expect(b.restore(a.serialize(), isValid)).toBe(true);
    expect(b.getEquipment(EquipmentSlot.Chest)?.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(7);
  });

  it('rejects wrong version atomically', () => {
    const eq = new PlayerEquipment();
    eq.setEquipment(EquipmentSlot.Head, { id: GRASS, count: 1 });
    const bad = { version: 2, slots: [null, null, null, null, null] };
    expect(eq.restore(bad, isValid)).toBe(false);
    expect(eq.getEquipment(EquipmentSlot.Head)).toEqual({ id: GRASS, count: 1 });
  });

  it('rejects wrong array length', () => {
    const eq = new PlayerEquipment();
    const bad = { version: 1, slots: [null, null, null, null] };
    expect(eq.restore(bad, isValid)).toBe(false);
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      expect(eq.getEquipment(slot)).toBeNull();
    }
  });

  it('rejects invalid item id', () => {
    const eq = new PlayerEquipment();
    const bad = { version: 1, slots: [{ id: 999, count: 1 }, null, null, null, null] };
    expect(eq.restore(bad, (id) => id !== 999)).toBe(false);
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      expect(eq.getEquipment(slot)).toBeNull();
    }
  });

  it('rejects non-positive or over-cap count', () => {
    const eq = new PlayerEquipment();
    const zero = { version: 1, slots: [{ id: GRASS, count: 0 }, null, null, null, null] };
    expect(eq.restore(zero, isValid)).toBe(false);
    const over = { version: 1, slots: [{ id: GRASS, count: 65 }, null, null, null, null] };
    expect(eq.restore(over, isValid)).toBe(false);
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      expect(eq.getEquipment(slot)).toBeNull();
    }
  });
});

describe('Inventory: equipment integration', () => {
  it('snapshot carries equipment and round-trips', () => {
    const inv = new Inventory();
    inv.equipment.setEquipment(EquipmentSlot.Head, { id: GRASS, count: 1 });
    const snap = inv.snapshot();
    expect(snap.equipment).toBeDefined();
    expect(snap.equipment?.slots[0]).toEqual({ id: GRASS, count: 1 });

    const restored = new Inventory();
    expect(restored.restore(snap, isValid, maxDur)).toBe(true);
    expect(restored.equipment.getEquipment(EquipmentSlot.Head)).toEqual({ id: GRASS, count: 1 });
  });

  it('absent equipment loads empty (backward compatible)', () => {
    const legacy = {
      version: 1,
      slots: [GRASS, DIRT],
      counts: [5, 3],
      storage: [],
      selected: 0,
    };
    const inv = new Inventory();
    expect(inv.restore(legacy, isValid, maxDur)).toBe(true);
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      expect(inv.equipment.getEquipment(slot)).toBeNull();
    }
  });

  it('malformed equipment rejects the whole restore (atomic)', () => {
    const inv = new Inventory();
    const snap = inv.snapshot();
    const tampered = {
      ...snap,
      equipment: { version: 2, slots: [null, null, null, null, null] },
    };
    const target = new Inventory([GRASS, DIRT], [5, 3]);
    expect(target.restore(tampered, isValid, maxDur)).toBe(false);
    // Inventory slots must be unchanged (still the non-default seed).
    expect(target.slots[0]).toEqual({ id: GRASS, count: 5 });
    expect(target.slots[1]).toEqual({ id: DIRT, count: 3 });
    expect(target.equipment.getEquipment(EquipmentSlot.Head)).toBeNull();
  });

  it('full round-trip keeps armor alongside a damaged tool', () => {
    const inv = new Inventory();
    inv.equipment.setEquipment(EquipmentSlot.Chest, damagedPickaxe(12));
    const restored = new Inventory();
    expect(restored.restore(inv.snapshot(), isValid, maxDur)).toBe(true);
    expect(restored.equipment.getEquipment(EquipmentSlot.Chest)?.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(12);
  });
});
