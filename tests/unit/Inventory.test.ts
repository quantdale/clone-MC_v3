import { describe, it, expect } from "vitest";
import { Inventory, type ItemStack } from "../../src/inventory/Inventory";
import { ItemId } from "../../src/inventory/ItemRegistry";
import {
  DAMAGE_COMPONENT,
  emptyStackComponents,
} from "../../src/inventory/StackDataComponents";

describe("inventory hotbar selection", () => {
  it("defaults to the first slot selected", () => {
    const inv = new Inventory();
    expect(inv.selected).toBe(0);
    expect(inv.getSelectedItemId()).toBe(inv.slots[0]?.id ?? 0);
  });

  it("selects a slot by index", () => {
    const inv = new Inventory();
    inv.select(5);
    expect(inv.selected).toBe(5);
  });

  it("clamps out-of-range selection", () => {
    const inv = new Inventory();
    inv.select(-3);
    expect(inv.selected).toBe(0);
    inv.select(999);
    expect(inv.selected).toBe(inv.slots.length - 1);
  });

  it("cycles forward with wraparound", () => {
    const inv = new Inventory();
    inv.select(0);
    inv.cycle(1);
    expect(inv.selected).toBe(1);
    // Wrap past the last slot back to the first.
    inv.select(inv.slots.length - 1);
    inv.cycle(1);
    expect(inv.selected).toBe(0);
  });

  it("cycles backward with wraparound", () => {
    const inv = new Inventory();
    inv.select(0);
    inv.cycle(-1);
    expect(inv.selected).toBe(inv.slots.length - 1);
    // Wrap past the first slot back to the last.
    inv.cycle(-1);
    expect(inv.selected).toBe(inv.slots.length - 2);
  });

  it("returns the selected block id", () => {
    const inv = new Inventory(
      [ItemId.Grass, ItemId.Stone, ItemId.Sand],
      [1, 1, 1],
    );
    inv.select(1);
    expect(inv.getSelectedItemId()).toBe(ItemId.Stone);
  });

  it("falls back to default slots when constructed empty", () => {
    const inv = new Inventory([]);
    expect(inv.slots.length).toBeGreaterThan(0);
    inv.select(0);
    expect(inv.getSelectedItemId()).toBe(inv.slots[0]?.id ?? 0);
  });

  it("default slots match the documented block order", () => {
    // Grass / Dirt / Stone / Sand / Wood / Planks / Glass / Water / Apple.
    const inv = new Inventory();
    expect(inv.slots.map((s) => s.id)).toEqual([
      ItemId.Grass,
      ItemId.Dirt,
      ItemId.Stone,
      ItemId.Sand,
      ItemId.Wood,
      ItemId.Planks,
      ItemId.Glass,
      ItemId.Water,
      ItemId.Apple,
    ]);
    expect(inv.slots.map((s) => s.count)).toEqual([
      32, 32, 64, 16, 0, 0, 0, 8, 0,
    ]);
  });

  it("cycles wrap with a delta larger than the slot count", () => {
    const inv = new Inventory();
    inv.select(0);
    inv.cycle(10); // 10 slots forward → wraps to 1 (10 % 9 = 1).
    expect(inv.selected).toBe(1);
    inv.cycle(-10); // back to 0.
    expect(inv.selected).toBe(0);
  });

  it("select truncates fractional indices to the nearest slot", () => {
    const inv = new Inventory();
    inv.select(1.7);
    expect(inv.selected).toBe(1);
    inv.select(-0.5);
    expect(inv.selected).toBe(0);
  });

  it("stacks items and spills overflow into main inventory", () => {
    const inv = new Inventory([ItemId.Stone], [60]);
    expect(inv.addItem(ItemId.Stone, 8)).toBe(0);
    expect(inv.getSlotCount(0)).toBe(64);
    expect(inv.storage).toEqual([{ id: ItemId.Stone, count: 4 }]);
    expect(inv.getItemCount(ItemId.Stone)).toBe(68);
  });

  it("removes items across hotbar and storage transactionally", () => {
    const inv = new Inventory(
      [ItemId.Sand],
      [2],
      [{ id: ItemId.Sand, count: 5 }],
    );
    expect(inv.removeItem(ItemId.Sand, 6)).toBe(true);
    expect(inv.getItemCount(ItemId.Sand)).toBe(1);
    expect(inv.removeItem(ItemId.Sand, 2)).toBe(false);
    expect(inv.getItemCount(ItemId.Sand)).toBe(1);
  });

  it("consumes only the selected hotbar stack", () => {
    const inv = new Inventory([ItemId.Stone, ItemId.Dirt], [1, 4]);
    expect(inv.consumeSelected()).toBe(true);
    expect(inv.getSlotCount(0)).toBe(0);
    inv.select(1);
    expect(inv.consumeSelected()).toBe(true);
    expect(inv.getSlotCount(1)).toBe(3);
  });

  it("round-trips a validated snapshot without leaking component state", () => {
    const source = new Inventory(
      [ItemId.Wood, ItemId.Planks],
      [2, 3],
      [{ id: ItemId.Sand, count: 4 }],
    );
    source.select(1);
    const restored = new Inventory();
    expect(restored.restore(source.snapshot())).toBe(true);
    expect(restored.slots.map((s) => s.id)).toEqual(
      source.slots.map((s) => s.id),
    );
    expect(restored.slots.map((s) => s.count)).toEqual(
      source.slots.map((s) => s.count),
    );
    expect(restored.storage).toEqual(source.storage);
    expect(restored.selected).toBe(1);
    expect(restored.restore({ version: 2 })).toBe(false);
    expect(
      restored.restore(source.snapshot(), (id) => id !== ItemId.Wood),
    ).toBe(false);
    const malformed = source.snapshot();
    malformed.durability = [99, 0];
    expect(
      restored.restore(
        malformed,
        () => true,
        (id) => (id === ItemId.Wood ? 10 : 0),
      ),
    ).toBe(false);
  });

  it("tracks tool durability and breaks the selected tool at zero", () => {
    const inv = new Inventory([ItemId.WoodenPickaxe], [1]);
    expect(inv.getSelectedDurability(3)).toBe(3);
    expect(inv.damageSelectedItem(1, 3)).toBe(false);
    expect(inv.getSelectedDurability(3)).toBe(2);
    expect(inv.damageSelectedItem(2, 3)).toBe(true);
    expect(inv.getSlotCount()).toBe(0);
    expect(inv.getSelectedDurability(3)).toBe(0);
  });

  it("expresses tool wear through the 008 damage component and round-trips it", () => {
    const inv = new Inventory([ItemId.WoodenPickaxe], [1]);
    expect(inv.damageSelectedItem(1, 59)).toBe(false);
    const stack = inv.slots[0]!;
    expect(stack.components?.has(DAMAGE_COMPONENT)).toBe(true);
    expect(
      stack.components?.get<{ damage: number }>(DAMAGE_COMPONENT)?.damage,
    ).toBe(1);
    // Remaining durability is the cap minus accumulated damage.
    expect(inv.getSelectedDurability(59)).toBe(58);

    const saved = inv.snapshot();
    const restored = new Inventory();
    expect(
      restored.restore(
        saved,
        () => true,
        (id) => (id === ItemId.WoodenPickaxe ? 59 : 0),
      ),
    ).toBe(true);
    expect(restored.getSelectedDurability(59)).toBe(58);
    expect(
      restored.slots[0]!.components?.get<{ damage: number }>(DAMAGE_COMPONENT)
        ?.damage,
    ).toBe(1);
  });

  it("does not merge stacks that share an id but differ in components", () => {
    const inv = new Inventory([ItemId.WoodenPickaxe], [1]);
    expect(inv.damageSelectedItem(1, 59)).toBe(false); // now damaged (damage 1)
    // Adding a fresh, pristine pickaxe must not merge into the damaged slot.
    expect(inv.addItem(ItemId.WoodenPickaxe, 1)).toBe(0);
    expect(inv.getItemCount(ItemId.WoodenPickaxe)).toBe(2);
    const damaged = inv.slots[0]!;
    const pristine =
      inv.storage[0] ?? inv.slots.find((s) => s.count > 0 && s !== damaged);
    expect(
      damaged.components?.get<{ damage: number }>(DAMAGE_COMPONENT)?.damage,
    ).toBe(1);
    expect(pristine?.components?.has(DAMAGE_COMPONENT) ?? false).toBe(false);
  });

  it("merges identical plain stacks up to the item-specific maximum", () => {
    const inv = new Inventory([ItemId.Coal], [60]);
    expect(inv.addItem(ItemId.Coal, 8)).toBe(0);
    expect(inv.getSlotCount(0)).toBe(64);
    expect(inv.storage).toEqual([{ id: ItemId.Coal, count: 4 }]);
  });

  it("rejects malformed snapshot restoration atomically", () => {
    const inv = new Inventory([ItemId.Stone], [4]);
    const snapshot = inv.snapshot();
    const goodCount = inv.getItemCount(ItemId.Stone);
    // Corrupt the slot count beyond the stack cap.
    const corrupted = JSON.parse(JSON.stringify(snapshot));
    corrupted.counts[0] = 999;
    expect(inv.restore(corrupted)).toBe(false);
    expect(inv.getItemCount(ItemId.Stone)).toBe(goodCount);
    // Corrupt the slot id.
    const badId = JSON.parse(JSON.stringify(snapshot));
    badId.slots[0] = 999;
    expect(inv.restore(badId, (id) => id !== 999)).toBe(false);
    expect(inv.getItemCount(ItemId.Stone)).toBe(goodCount);
  });

  it("keeps empty slots free of meaningful component state", () => {
    const inv = new Inventory([ItemId.WoodenPickaxe], [1]);
    inv.damageSelectedItem(1, 59);
    expect(inv.slots[0]!.components?.has(DAMAGE_COMPONENT)).toBe(true);
    // Consuming to zero clears the slot and any component it carried.
    inv.consumeSelected();
    expect(inv.getSlotCount(0)).toBe(0);
    expect(inv.slots[0]!.components).toBeUndefined();
  });

  it("repairs the selected tool and reports a change", () => {
    const inv = new Inventory([ItemId.WoodenPickaxe], [1]);
    // Seed accumulated wear of 10 directly on the selected slot (maxDurability 59).
    inv.slots[0]!.components = emptyStackComponents().with(DAMAGE_COMPONENT, {
      damage: 10,
    });
    expect(inv.getSelectedDurability(59)).toBe(49);
    expect(inv.repairSelectedItem(4)).toBe(true);
    expect(inv.getSelectedDurability(59)).toBe(53);
    expect(
      inv.slots[0]!.components?.get<{ damage: number }>(DAMAGE_COMPONENT)
        ?.damage,
    ).toBe(6);
  });

  it("does not change a pristine selected tool on repair", () => {
    const inv = new Inventory([ItemId.WoodenPickaxe], [1]);
    expect(inv.getSelectedDurability(59)).toBe(59);
    expect(inv.repairSelectedItem(4)).toBe(false);
    expect(inv.getSelectedDurability(59)).toBe(59);
  });

  it("restores a legacy snapshot that omits wear data as full tools", () => {
    const inv = new Inventory();
    const legacy = {
      version: 1 as const,
      slots: [ItemId.WoodenPickaxe],
      counts: [1],
      storage: [],
      selected: 0,
    };
    expect(
      inv.restore(
        legacy,
        () => true,
        (id) => (id === ItemId.WoodenPickaxe ? 59 : 0),
      ),
    ).toBe(true);
    expect(inv.getSlotCount(0)).toBe(1);
    expect(inv.getSelectedDurability(59)).toBe(59);
    expect(inv.slots[0]!.components?.has(DAMAGE_COMPONENT) ?? false).toBe(
      false,
    );
  });
});

// ── Inventory utility coverage (verification campaign) ──────────────────────

function toolStack(id: number, count = 1, damage?: number): ItemStack {
  if (damage === undefined) return { id, count };
  const components = emptyStackComponents().with(DAMAGE_COMPONENT, { damage });
  return { id, count, components };
}

describe("inventory — selection details", () => {
  it("fractional selects truncate to the integer slot", () => {
    const filled = new Inventory([1, 2, 3], [1, 1, 1]);
    filled.select(1.9);
    expect(filled.selected).toBe(1);
    // Out-of-range values clamp to the nearest valid slot.
    filled.select(99);
    expect(filled.selected).toBe(2);
    filled.select(-5);
    expect(filled.selected).toBe(0);
  });
});

describe("inventory — crafting payment queries", () => {
  it("hasItems checks every requirement against hotbar + storage counts", () => {
    const inv = new Inventory([1, 2], [5, 2], [{ id: 2, count: 3 }]);
    expect(inv.hasItems([[1, 4]])).toBe(true);
    expect(
      inv.hasItems([
        [1, 5],
        [2, 5],
      ]),
    ).toBe(true); // id 2: 2 hotbar + 3 storage
    expect(inv.hasItems([[1, 6]])).toBe(false); // only 5 of id 1 exist
    expect(inv.hasItems([])).toBe(true);
  });

  it("canAddItem counts merge headroom, empty cells and free storage rows", () => {
    // Two full hotbar stacks of id 1 with no other space used: free storage rows absorb more.
    const tight = new Inventory([1, 1], [64, 64]);
    expect(tight.canAddItem(1, 64)).toBe(true);

    // A partially-filled matching slot provides direct headroom.
    const partial = new Inventory([1], [10]);
    expect(partial.canAddItem(1, 54)).toBe(true); // exactly fills the stack
    expect(partial.canAddItem(1, 55)).toBe(true); // overflow lands in free storage
  });

  it("addItem merges into compatible stacks then fills storage rows, returning zero leftover when everything fits", () => {
    const inv = new Inventory([1], [10]);
    expect(inv.addItem(1, 100)).toBe(0); // 54 headroom + storage rows absorb the rest
    expect(inv.slots[0]!.count).toBe(64);
    const merged = inv.storage.find((s) => s.id === 1);
    expect(merged?.count).toBe(46);

    // Zero-amount adds are no-ops returning zero leftover.
    expect(inv.addItem(1, 0)).toBe(0);
  });

  it("consumeSelected decrements the selected stack and clears components at zero", () => {
    const inv = new Inventory([1], [2]);
    inv.select(0);
    expect(inv.consumeSelected()).toBe(true);
    expect(inv.getSelectedStack()?.count).toBe(1);
    expect(inv.consumeSelected()).toBe(true);
    expect(inv.getSelectedStack()?.count).toBe(0);

    // Damaged tool: hitting zero clears its component map.
    const damaged = new Inventory([2], [1]);
    damaged.slots[0] = toolStack(2, 1, 5);
    damaged.select(0);
    expect(damaged.consumeSelected()).toBe(true);
    expect(damaged.slots[0]!.components).toBeUndefined();
  });

  it("slot durability reads pristine stacks as full and clamps over-damage", () => {
    const inv = new Inventory([1, 1], [1, 1]);
    expect(inv.getSlotDurability(0, 250)).toBe(250); // pristine
    inv.slots[0] = toolStack(1, 1, 100);
    expect(inv.getSlotDurability(0, 250)).toBe(150);
    inv.slots[0] = toolStack(1, 1, 9999);
    expect(inv.getSlotDurability(0, 250)).toBe(0); // clamped
    expect(inv.getSlotDurability(5, 250)).toBe(0); // out of range
    expect(inv.getSlotDurability(0, 0)).toBe(0); // non-durable item type

    // Selected-slot variant reads whatever is selected.
    inv.select(1); // pristine
    expect(inv.getSelectedDurability(80)).toBe(80);
  });

  it("damageSelectedItem reports breaks and zeroes broken stacks", () => {
    const inv = new Inventory([1], [1]);
    inv.select(0);
    inv.slots[0] = toolStack(1, 1, 90);
    expect(inv.damageSelectedItem(5, 100, 0, () => 0.99)).toBe(false); // 95 damage
    expect(inv.damageSelectedItem(5, 100, 0, () => 0.99)).toBe(true); // reaches 100 → break
    expect(inv.slots[0]!.count).toBe(0);

    // Non-durable or empty selections never break.
    expect(inv.damageSelectedItem(5, 100)).toBe(false);
    expect(new Inventory([1], [1]).damageSelectedItem(5, 0)).toBe(false);
  });

  it("setSelectedStack replaces the selected slot in place", () => {
    const inv = new Inventory([1, 2], [1, 1]);
    inv.select(1);
    inv.setSelectedStack({ id: 9, count: 3 });
    expect(inv.slots[1]).toEqual({ id: 9, count: 3 });
  });
});
