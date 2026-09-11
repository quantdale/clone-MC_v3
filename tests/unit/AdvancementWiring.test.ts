import { describe, it, expect } from 'vitest';
import { coreProgressionAdvancements } from '../../src/simulation/CoreProgressionAdvancements';
import {
  applyTriggerToProgresses,
  createDefaultAdvancementProgresses,
} from '../../src/simulation/AdvancementSave';
import { describeAdvancements } from '../../src/simulation/AdvancementView';
import { createDefaultItemRegistry, ItemId } from '../../src/inventory/ItemRegistry';
import { Inventory } from '../../src/inventory/Inventory';
import { CraftingSystem } from '../../src/inventory/Crafting';

/**
 * Wiring oracles for the advancement panel UI (263): the exact composition
 * `Game` runs at its obtain chokes and trigger seam — numeric-id → registry
 * string-key mapping (unknown ids skip), fan-out over the real catalog at the
 * tick, row views, and the craft-output → obtain end-to-end over the real
 * inventory + transactional CraftingSystem.
 *
 * Game-structural guarantees (early-return before toast/persist when the
 * fan-out is identity; toast per completed key; panel re-render) are covered
 * here at the seam (identity refs) and in browser E2E (toast text, live row
 * flip, reload): Game itself is DOM-bound and has no node harness.
 */

const CATALOG = coreProgressionAdvancements();

describe('AdvancementWiring (263)', () => {
  it('defaults render 7 unachieved rows in chain order', () => {
    const rows = describeAdvancements(CATALOG, createDefaultAdvancementProgresses(CATALOG));
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.key)).toEqual(CATALOG.map((d) => d.key));
    expect(rows.every((r) => !r.achieved && r.achievedCount === 0 && r.totalCount === 1)).toBe(true);
  });

  it('obtain fan-out completes stone_age at the tick with 1/1 rows', () => {
    const store = createDefaultAdvancementProgresses(CATALOG);
    const { progresses, completedKeys } = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'obtain_item', itemKey: 'wooden_pickaxe' },
      42,
    );
    expect(completedKeys).toEqual(['minecraft:stone_age']);
    const rows = describeAdvancements(CATALOG, progresses);
    expect(rows[0]).toMatchObject({
      key: 'minecraft:stone_age',
      achieved: true,
      achievedTick: 42,
      achievedCount: 1,
      totalCount: 1,
      remaining: 0,
    });
  });

  it('wrong-key triggers are identity (Game persists/toasts nothing)', () => {
    const store = createDefaultAdvancementProgresses(CATALOG);
    const result = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'dimension_enter', dimensionKey: 'minecraft:the_end' },
      5,
    );
    // enter_the_end DOES match — use a truly foreign key for the no-op pin.
    expect(result.completedKeys).toEqual(['minecraft:enter_the_end']);
    const foreign = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'obtain_item', itemKey: 'not_a_real_item' },
      5,
    );
    expect(foreign.completedKeys).toEqual([]);
    expect(foreign.progresses).toBe(store);
  });

  it('double-fire is identity (Game early-returns before a second toast/persist)', () => {
    const store = createDefaultAdvancementProgresses(CATALOG);
    const first = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'obtain_item', itemKey: 'wooden_pickaxe' },
      42,
    );
    const second = applyTriggerToProgresses(
      first.progresses,
      CATALOG,
      { type: 'obtain_item', itemKey: 'wooden_pickaxe' },
      9000,
    );
    expect(second.completedKeys).toEqual([]);
    expect(second.progresses).toBe(first.progresses);
  });

  it('numeric item ids map to registry string keys; unknown ids skip', () => {
    const items = createDefaultItemRegistry();
    expect(items.getByLegacyId(ItemId.WoodenPickaxe)?.key).toBe('wooden_pickaxe');
    expect(items.getByLegacyId(ItemId.StonePickaxe)?.key).toBe('stone_pickaxe');
    expect(items.getByLegacyId(999999)).toBeUndefined();
  });

  it('craft-output → obtain completes stone_age through the real transaction path', () => {
    const items = createDefaultItemRegistry();
    const inventory = new Inventory();
    expect(inventory.addItem(ItemId.Planks, 3)).toBe(0);
    expect(inventory.addItem(ItemId.Stick, 2)).toBe(0);
    const system = new CraftingSystem(inventory);
    const crafted = system.craft('wooden_pickaxe');
    expect(crafted).not.toBeNull();
    // The choke mapping Game.noteItemObtained performs: numeric output → key.
    const key = items.getByLegacyId(crafted!.output)?.key;
    expect(key).toBe('wooden_pickaxe');
    const store = createDefaultAdvancementProgresses(CATALOG);
    const { progresses, completedKeys } = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'obtain_item', itemKey: key! },
      7,
    );
    expect(completedKeys).toEqual(['minecraft:stone_age']);
    expect(progresses[0]!.achievedTick).toBe(7);
    // The craft consumed the ingredients (transactional engine intact).
    expect(inventory.getItemCount(ItemId.Planks)).toBe(0);
    expect(inventory.getItemCount(ItemId.Stick)).toBe(0);
    expect(inventory.getItemCount(ItemId.WoodenPickaxe)).toBe(1);
  });

  it('dimension/boss/kill triggers fan out through the same seam', () => {
    const store = createDefaultAdvancementProgresses(CATALOG);
    const nether = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'dimension_enter', dimensionKey: 'minecraft:the_nether' },
      100,
    );
    expect(nether.completedKeys).toEqual(['minecraft:enter_the_nether']);
    const dragon = applyTriggerToProgresses(
      nether.progresses,
      CATALOG,
      { type: 'boss_defeat', bossKey: 'ender_dragon' },
      5000,
    );
    expect(dragon.completedKeys).toEqual(['minecraft:free_the_end']);
    const rows = describeAdvancements(CATALOG, dragon.progresses);
    expect(rows.filter((r) => r.achieved).map((r) => r.key)).toEqual([
      'minecraft:enter_the_nether',
      'minecraft:free_the_end',
    ]);
  });
});
