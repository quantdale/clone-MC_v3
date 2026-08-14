import { describe, expect, it } from 'vitest';
import {
  RecipeRegistry,
  RecipeError,
  type RecipeDefinition,
  buildCurrentRecipes,
  createDefaultRecipeRegistry,
} from '../../src/inventory/RecipeRegistry';
import { createResourceId, resourceIdToString } from '../../src/data/ResourceId';
import { createDefaultItemRegistry, ItemId } from '../../src/inventory/ItemRegistry';
import { TagRegistry } from '../../src/data/TagRegistry';
import { Inventory } from '../../src/inventory/Inventory';
import { CraftingSystem } from '../../src/inventory/Crafting';
import {
  StackComponentMap,
  DAMAGE_COMPONENT,
  createDefaultStackComponentRegistry,
} from '../../src/inventory/StackDataComponents';

const items = (): ReturnType<typeof createDefaultItemRegistry> => createDefaultItemRegistry();

describe('recipe identity and registration', () => {
  it('registers every current recipe with a unique ResourceId', () => {
    const registry = createDefaultRecipeRegistry();
    expect(registry.size).toBe(9);
    expect(registry.finalized).toBe(true);
    const planks = registry.get(createResourceId('minecraft', 'recipe/planks'));
    expect(resourceIdToString(planks.id)).toBe('minecraft:recipe/planks');
    expect(registry.getByKey('planks')).toBe(planks);
  });

  it('rejects duplicate recipe ids without replacing the original', () => {
    const itemReg = items();
    const planks = buildCurrentRecipes(itemReg).find((d) => d.key === 'planks')!;
    const duplicate = { ...planks, key: 'planks_dup' };
    expect(() => new RecipeRegistry(itemReg, undefined, [planks, duplicate])).toThrow(RecipeError);
    // The canonical registry is still usable and unchanged.
    const canonical = createDefaultRecipeRegistry();
    expect(canonical.getByKey('planks')?.name).toBe('Oak Planks');
    expect(canonical.getByKey('planks_dup')).toBeUndefined();
  });

  it('iterates recipes in deterministic registration order', () => {
    const order = createDefaultRecipeRegistry().entries().map((d) => d.key);
    expect(order).toEqual([
      'planks',
      'glass',
      'sticks',
      'gravel',
      'cobblestone',
      'bricks',
      'wooden_pickaxe',
      'stone_pickaxe',
      'wooden_axe',
    ]);
  });

  it('freezes definitions after finalization', () => {
    const registry = createDefaultRecipeRegistry();
    const def = registry.get(createResourceId('minecraft', 'recipe/planks'));
    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.ingredients)).toBe(true);
    const before = def.name;
    expect(() => {
      (def as { name: string }).name = 'hacked';
    }).toThrow();
    expect(def.name).toBe(before);
  });
});

describe('reference validation', () => {
  it('rejects a missing item reference before finalization', () => {
    const itemReg = items();
    const bad: RecipeDefinition = {
      id: createResourceId('minecraft', 'recipe/bad'),
      key: 'bad',
      name: 'bad',
      description: '',
      ingredients: [{ kind: 'item', item: createResourceId('minecraft', 'nope'), count: 1 }],
      output: { item: itemReg.getByLegacyId(ItemId.Gravel)!.resourceId, count: 1 },
    };
    expect(() => new RecipeRegistry(itemReg, undefined, [bad])).toThrow(RecipeError);
  });

  it('rejects a missing tag reference', () => {
    const itemReg = items();
    const tag = createResourceId('minecraft', 'missing_tag');
    const bad: RecipeDefinition = {
      id: createResourceId('minecraft', 'recipe/tagbad'),
      key: 'tagbad',
      name: 'tagbad',
      description: '',
      ingredients: [{ kind: 'tag', tag, count: 1 }],
      output: { item: itemReg.getByLegacyId(ItemId.Gravel)!.resourceId, count: 1 },
    };
    expect(() => new RecipeRegistry(itemReg, undefined, [bad])).toThrow(RecipeError);
  });

  it('rejects zero, negative, and non-integer quantities', () => {
    const itemReg = items();
    const wood = itemReg.getByLegacyId(ItemId.Wood)!.resourceId;
    const gravel = itemReg.getByLegacyId(ItemId.Gravel)!.resourceId;
    for (const count of [0, -1, 1.5]) {
      const bad: RecipeDefinition = {
        id: createResourceId('minecraft', `recipe/q${count}`),
        key: `q${count}`,
        name: '',
        description: '',
        ingredients: [{ kind: 'item', item: wood, count }],
        output: { item: gravel, count: 1 },
      };
      expect(() => new RecipeRegistry(itemReg, undefined, [bad])).toThrow(RecipeError);
    }
  });

  it('rejects an output that exceeds the item stack size', () => {
    const itemReg = items();
    const wood = itemReg.getByLegacyId(ItemId.Wood)!.resourceId;
    const bad: RecipeDefinition = {
      id: createResourceId('minecraft', 'recipe/big'),
      key: 'big',
      name: '',
      description: '',
      ingredients: [{ kind: 'item', item: wood, count: 1 }],
      output: { item: wood, count: 999 },
    };
    expect(() => new RecipeRegistry(itemReg, undefined, [bad])).toThrow(RecipeError);
  });

  it('validates output component data through the stack-component system', () => {
    const itemReg = items();
    const compReg = createDefaultStackComponentRegistry();
    const good = new StackComponentMap(compReg, [[DAMAGE_COMPONENT, { damage: 5 }]]);
    const withComp: RecipeDefinition = {
      id: createResourceId('minecraft', 'recipe/comp'),
      key: 'comp',
      name: 'comp',
      description: '',
      ingredients: [{ kind: 'item', item: itemReg.getByLegacyId(ItemId.Wood)!.resourceId, count: 1 }],
      output: { item: itemReg.getByLegacyId(ItemId.WoodenPickaxe)!.resourceId, count: 1, components: good },
    };
    expect(() => new RecipeRegistry(itemReg, undefined, [withComp])).not.toThrow();
    // A malformed component map cannot even be constructed, so a recipe carrying
    // it is rejected before it becomes craftable.
    expect(() => new StackComponentMap(compReg, [[DAMAGE_COMPONENT, { damage: -1 }]])).toThrow();
  });
});

describe('ingredient matching', () => {
  it('matches exact-item ingredients through one-click crafting', () => {
    const inventory = new Inventory([ItemId.Wood, ItemId.Planks], [1, 0]);
    const system = new CraftingSystem(inventory);
    const planks = system.recipes.find((r) => r.id === 'planks')!;
    expect(system.canCraft(planks)).toBe(true);
    expect(system.craft('planks')?.outputCount).toBe(4);
    expect(inventory.getItemCount(ItemId.Wood)).toBe(0);
    expect(inventory.getItemCount(ItemId.Planks)).toBe(4);
  });

  it('satisfies a tag ingredient from any member item', () => {
    const itemReg = items();
    const tagId = createResourceId('minecraft', 'plank_or_stick');
    const tagReg = new TagRegistry('item', [
      {
        id: tagId,
        members: [
          { kind: 'resource', id: itemReg.getByLegacyId(ItemId.Planks)!.resourceId },
          { kind: 'resource', id: itemReg.getByLegacyId(ItemId.Stick)!.resourceId },
        ],
      },
    ]);
    // Tag not finalized yet: definition must be rejected.
    const tagRecipe: RecipeDefinition = {
      id: createResourceId('minecraft', 'recipe/tag_test'),
      key: 'tag_test',
      name: 'Tag Test',
      description: '1 plank-or-stick → 1 gravel',
      ingredients: [{ kind: 'tag', tag: tagId, count: 1 }],
      output: { item: itemReg.getByLegacyId(ItemId.Gravel)!.resourceId, count: 1 },
    };
    expect(() => new RecipeRegistry(itemReg, tagReg, [tagRecipe])).toThrow(RecipeError);

    tagReg.finalize((id) => itemReg.hasByResourceId(id));
    const registry = new RecipeRegistry(itemReg, tagReg, [tagRecipe]);
    const inventory = new Inventory([ItemId.Planks, ItemId.Gravel], [1, 0]);
    const system = new CraftingSystem(inventory, registry);
    expect(system.craft('tag_test')).not.toBeNull();
    expect(inventory.getItemCount(ItemId.Planks)).toBe(0);
    expect(inventory.getItemCount(ItemId.Gravel)).toBe(1);

    // A non-member inventory cannot satisfy the tag ingredient.
    const empty = new Inventory([ItemId.Gravel], [0]);
    expect(new CraftingSystem(empty, registry).craft('tag_test')).toBeNull();
  });
});

describe('transactional craft behavior', () => {
  it('leaves the inventory unchanged when ingredients are insufficient', () => {
    const inventory = new Inventory([ItemId.Sand, ItemId.Glass], [3, 0]);
    const system = new CraftingSystem(inventory);
    expect(system.craft('glass')).toBeNull();
    expect(inventory.getItemCount(ItemId.Sand)).toBe(3);
    expect(inventory.getItemCount(ItemId.Glass)).toBe(0);
  });

  it('leaves the inventory unchanged when output capacity is full', () => {
    const slots = [
      ItemId.Glass, ItemId.Glass, ItemId.Glass, ItemId.Glass,
      ItemId.Glass, ItemId.Glass, ItemId.Glass, ItemId.Glass, ItemId.Sand,
    ];
    const counts = [64, 64, 64, 64, 64, 64, 64, 64, 4];
    const storage = Array.from({ length: 27 }, () => ({ id: ItemId.Stone, count: 64 }));
    const inventory = new Inventory(slots, counts, storage);
    const system = new CraftingSystem(inventory);
    expect(system.craft('glass')).toBeNull();
    expect(inventory.getItemCount(ItemId.Sand)).toBe(4);
    expect(inventory.getItemCount(ItemId.Glass)).toBe(8 * 64);
  });

  it('crafts a masonry chain and a tool transactionally', () => {
    const inventory = new Inventory(
      [ItemId.Planks, ItemId.Stick, ItemId.WoodenPickaxe],
      [5, 0, 0],
    );
    const system = new CraftingSystem(inventory);
    expect(system.craft('wooden_pickaxe')).toBeNull();
    expect(system.craft('sticks')?.output).toBe(ItemId.Stick);
    expect(inventory.getItemCount(ItemId.Stick)).toBe(4);
    expect(system.craft('wooden_pickaxe')?.output).toBe(ItemId.WoodenPickaxe);
    expect(inventory.getItemCount(ItemId.WoodenPickaxe)).toBe(1);
    expect(inventory.getItemCount(ItemId.Planks)).toBe(0);
  });
});

describe('current catalog equivalence', () => {
  it('migrates every recipe with equivalent ingredient costs and outputs', () => {
    const registry = createDefaultRecipeRegistry();
    const expected = [
      { key: 'planks', ingredient: 'minecraft:wood', count: 1, output: 'minecraft:planks', outputCount: 4 },
      { key: 'glass', ingredient: 'minecraft:sand', count: 4, output: 'minecraft:glass', outputCount: 1 },
      { key: 'sticks', ingredient: 'minecraft:planks', count: 2, output: 'minecraft:stick', outputCount: 4 },
      { key: 'gravel', ingredient: 'minecraft:stone', count: 2, output: 'minecraft:gravel', outputCount: 1 },
      { key: 'cobblestone', ingredient: 'minecraft:stone', count: 2, output: 'minecraft:cobblestone', outputCount: 2 },
      { key: 'bricks', ingredient: 'minecraft:cobblestone', count: 4, output: 'minecraft:bricks', outputCount: 4 },
      { key: 'wooden_pickaxe', ingredient: 'minecraft:planks', count: 3, output: 'minecraft:wooden_pickaxe', outputCount: 1 },
      { key: 'stone_pickaxe', ingredient: 'minecraft:stone', count: 3, output: 'minecraft:stone_pickaxe', outputCount: 1 },
      { key: 'wooden_axe', ingredient: 'minecraft:planks', count: 3, output: 'minecraft:wooden_axe', outputCount: 1 },
    ];
    for (const want of expected) {
      const def = registry.getByKey(want.key)!;
      const ing = def.ingredients.find(
        (i): i is { kind: 'item'; item: ReturnType<typeof createResourceId>; count: number } =>
          i.kind === 'item' && resourceIdToString(i.item) === want.ingredient,
      );
      expect(ing).toBeDefined();
      expect(ing!.count).toBe(want.count);
      expect(resourceIdToString(def.output.item)).toBe(want.output);
      expect(def.output.count).toBe(want.outputCount);
    }
    // The tool recipes add a second stick ingredient (3 planks/stones + 2 sticks).
    for (const key of ['wooden_pickaxe', 'stone_pickaxe', 'wooden_axe']) {
      const def = registry.getByKey(key)!;
      expect(def.ingredients).toHaveLength(2);
      const stick = def.ingredients[1]!;
      expect(stick.kind).toBe('item');
      if (stick.kind !== 'item') throw new Error('expected item ingredient');
      expect(resourceIdToString(stick.item)).toBe('minecraft:stick');
      expect(stick.count).toBe(2);
    }
  });
});

describe('scope discipline', () => {
  it('introduces no grid position or file-loader concepts', () => {
    const registryProto = Object.getOwnPropertyNames(RecipeRegistry.prototype);
    const craftingProto = Object.getOwnPropertyNames(CraftingSystem.prototype);
    for (const name of [...registryProto, ...craftingProto]) {
      expect(/grid|file|load/i.test(name)).toBe(false);
    }
    const defKeys = Object.keys(buildCurrentRecipes(items())[0]!).sort();
    expect(defKeys).toEqual(['description', 'id', 'ingredients', 'key', 'name', 'output']);
  });
});
