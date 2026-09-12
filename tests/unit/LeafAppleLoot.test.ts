import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createResourceId } from '../../src/data/ResourceId';
import { Player } from '../../src/player/Player';
import { PlayerInteraction } from '../../src/player/PlayerInteraction';
import { BlockId, createDefaultBlockRegistry, createDefaultBlockTags } from '../../src/world/BlockRegistry';
import { ItemId, createDefaultItemRegistry, createDefaultItemTags } from '../../src/inventory/ItemRegistry';
import { createDefaultEnchantmentRegistry } from '../../src/inventory/EnchantmentRegistry';
import { setStackEnchantments } from '../../src/inventory/EnchantmentApplication';
import { LootTableRegistry, buildCurrentLootTables } from '../../src/inventory/LootTable';
import { HarvestRules } from '../../src/world/HarvestRules';
import { ItemEntityManager } from '../../src/simulation/ItemEntityManager';
import type { ItemStack } from '../../src/inventory/Inventory';

const rid = (k: string) => createResourceId('minecraft', k);
const enchantReg = createDefaultEnchantmentRegistry();

function makeLeavesWorld(): import('../../src/world/WorldAccess').WorldAccess {
  const blocks = new Map<string, number>([['2,1,0', BlockId.Leaves]]);
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  return {
    getBlock(x, y, z) {
      return blocks.get(key(x, y, z)) ?? BlockId.Air;
    },
    isSolid(x, y, z) {
      return this.getBlock(x, y, z) === BlockId.Leaves;
    },
    setBlock(x, y, z, id) {
      blocks.set(key(x, y, z), id);
    },
  };
}

function makeInput(state: { breakRequested: boolean; held: boolean }) {
  return {
    moveForward: false,
    moveBack: false,
    moveLeft: false,
    moveRight: false,
    jump: false,
    sprint: false,
    isLocked: () => true,
    consumeMouseDelta: () => ({ dyaw: 0, dpitch: 0 }),
    consumeBreak: () => {
      const value = state.breakRequested;
      state.breakRequested = false;
      return value;
    },
    isBreakHeld: () => state.held,
    consumePlace: () => false,
    consumeHotbarDelta: () => 0,
    consumeHotbarIndex: () => -1,
    consumeDebugToggle: () => false,
    consumeCraftingToggle: () => false,
    consumeEat: () => false,
  };
}

function mineUntilBroken(
  interaction: PlayerInteraction,
  world: { getBlock(x: number, y: number, z: number): number },
  state: { breakRequested: boolean; held: boolean },
): void {
  state.breakRequested = true;
  state.held = true;
  for (let i = 0; i < 400 && world.getBlock(2, 1, 0) !== BlockId.Air; i++) {
    interaction.update(0.05);
  }
}

function aim(player: Player, camera: THREE.PerspectiveCamera): void {
  camera.position.copy(player.eyePosition);
  camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
  camera.updateMatrixWorld(true);
}

function breakLeaves(opts: {
  rng?: () => number;
  withLootTables?: boolean;
  silkTouch?: boolean;
}): { world: { getBlock(x: number, y: number, z: number): number }; itemEntities: ItemEntityManager } {
  const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
  aim(player, camera);
  const world = makeLeavesWorld();
  const itemRegistry = createDefaultItemRegistry();
  const itemEntities = new ItemEntityManager({ itemRegistry });
  const harvestRules = new HarvestRules(
    createDefaultBlockTags(createDefaultBlockRegistry()),
    createDefaultItemTags(createDefaultItemRegistry()),
  );
  const lootTables =
    opts.withLootTables === false
      ? undefined
      : new LootTableRegistry(buildCurrentLootTables(createDefaultBlockRegistry(), itemRegistry), itemRegistry);
  const enchanted = (id: number, key: string, level: number): ItemStack =>
    setStackEnchantments({ id, count: 1 }, [{ id: rid(key), level }], enchantReg);
  const state = { breakRequested: true, held: true };
  const interaction = new PlayerInteraction({
    world,
    registry: createDefaultBlockRegistry(),
    itemRegistry,
    selector: {
      getSelectedItemId: () => ItemId.Dirt,
      getSlotCount: () => 1,
      getSelectedStack: () => (opts.silkTouch ? enchanted(ItemId.Dirt, 'silk_touch', 1) : null),
    },
    player,
    camera,
    input: makeInput(state),
    itemEntities,
    harvestRules,
    lootTables,
    rng: opts.rng,
    enchantmentRegistry: enchantReg,
  });

  mineUntilBroken(interaction, world, state);
  interaction.dispose();
  return { world, itemEntities };
}

describe('leaf apple loot via the loot-table path (270)', () => {
  it('spawns leaves + apple on a lucky leaf break', () => {
    const { world, itemEntities } = breakLeaves({ rng: () => 0 });
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    expect(itemEntities.size).toBe(2);
    const ids = itemEntities.getItemEntities().map((e) => e.item).sort();
    expect(ids).toEqual([ItemId.Apple, ItemId.Leaves].sort());
  });

  it('spawns leaves only (no forced apple) on an unlucky leaf break', () => {
    const { world, itemEntities } = breakLeaves({ rng: () => 0.999 });
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    expect(itemEntities.size).toBe(1);
    expect(itemEntities.getItemEntities()[0]!.item).toBe(ItemId.Leaves);
    expect(itemEntities.getItemEntities()[0]!.count).toBe(1);
  });

  it('spawns the block item only with zero apples under silk touch, even on a lucky roll', () => {
    const { world, itemEntities } = breakLeaves({ rng: () => 0, silkTouch: true });
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    expect(itemEntities.size).toBe(1);
    expect(itemEntities.getItemEntities()[0]!.item).toBe(ItemId.Leaves);
    expect(itemEntities.getItemEntities()[0]!.count).toBe(1);
  });

  it('falls back to the block item only with no apple when no loot registry is injected', () => {
    const { world, itemEntities } = breakLeaves({ withLootTables: false });
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    expect(itemEntities.size).toBe(1);
    expect(itemEntities.getItemEntities()[0]!.item).toBe(ItemId.Leaves);
  });
});
