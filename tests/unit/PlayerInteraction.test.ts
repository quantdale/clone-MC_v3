import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createResourceId } from '../../src/data/ResourceId';
import { Player } from '../../src/player/Player';
import { PlayerInteraction } from '../../src/player/PlayerInteraction';
import type { InputState } from '../../src/engine/InputTypes';
import { BlockId, createDefaultBlockRegistry, createDefaultBlockTags } from '../../src/world/BlockRegistry';
import { ItemId, createDefaultItemRegistry, createDefaultItemTags } from '../../src/inventory/ItemRegistry';
import { createDefaultEnchantmentRegistry, type EnchantmentRegistry } from '../../src/inventory/EnchantmentRegistry';
import { setStackEnchantments } from '../../src/inventory/EnchantmentApplication';
import { HarvestRules } from '../../src/world/HarvestRules';
import { ItemEntityManager } from '../../src/simulation/ItemEntityManager';
import { XpOrbManager } from '../../src/simulation/XpOrbManager';
import type { ItemStack } from '../../src/inventory/Inventory';

function makeWorld(): import('../../src/world/WorldAccess').WorldAccess {
  return {
    getBlock(x: number, y: number, z: number): number {
      return x === 2 && y === 1 && z === 0 ? 3 : 0;
    },
    isSolid(x: number, y: number, z: number): boolean {
      return x === 2 && y === 1 && z === 0;
    },
    setBlock(): void {
      /* no-op */
    },
  };
}

function makeMutableWorld(blockId = BlockId.Stone): import('../../src/world/WorldAccess').WorldAccess {
  const blocks = new Map<string, number>([['2,1,0', blockId]]);
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  return {
    getBlock(x, y, z) {
      return blocks.get(key(x, y, z)) ?? BlockId.Air;
    },
    isSolid(x, y, z) {
      return this.getBlock(x, y, z) === blockId;
    },
    setBlock(x, y, z, id) {
      blocks.set(key(x, y, z), id);
    },
  };
}

function makeInput(state: { breakRequested: boolean; held: boolean }): InputState {
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

/**
 * Hold-mine the targeted block (hardening 2026-08-23): completion is owned by
 * break-duration progress, so tests step updates with the button held until
 * the block turns to air. Mirrors real survival mining.
 */
function mineUntilBroken(
  interaction: PlayerInteraction,
  world: { getBlock(x: number, y: number, z: number): number },
  state: { breakRequested: boolean; held: boolean },
  maxTicks = 400,
): void {
  state.breakRequested = true;
  state.held = true;
  for (let i = 0; i < maxTicks && world.getBlock(2, 1, 0) !== BlockId.Air; i++) {
    interaction.update(0.05);
  }
}

describe('player interaction selection', () => {
  it('aligns the selection outline with the targeted block bounds', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);

    const interaction = new PlayerInteraction({
      world: makeWorld(),
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => 3 },
      player,
      camera,
    });

    interaction.update(0.016);
    const outline = interaction.addTargetOutline();
    expect(outline).not.toBeNull();
    expect(outline!.visible).toBe(true);
    expect(interaction.getTarget()).toEqual({ blockX: 2, blockY: 1, blockZ: 0 });

    outline!.geometry.computeBoundingBox();
    const localBounds = outline!.geometry.boundingBox!;
    const worldMin = localBounds.min.clone().add(outline!.position);
    const worldMax = localBounds.max.clone().add(outline!.position);
    expect(worldMin.x).toBeCloseTo(2, 5);
    expect(worldMin.y).toBeCloseTo(1, 5);
    expect(worldMin.z).toBeCloseTo(0, 5);
    expect(worldMax.x).toBeCloseTo(3, 5);
    expect(worldMax.y).toBeCloseTo(2, 5);
    expect(worldMax.z).toBeCloseTo(1, 5);

    interaction.dispose();
  });

  it('collects a held-mined block into the selected stack', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);
    const world = makeMutableWorld();
    const selector = {
      getSelectedItemId: () => BlockId.Stone,
      getSlotCount: () => 2,
      consumeSelected: () => true,
      addItem: () => 0,
    };
    let collected = 0;
    const inputState = { breakRequested: true, held: true };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector,
      player,
      camera,
      input: makeInput(inputState),
      onAction: (action, id) => {
        if (action === 'break' && id === ItemId.Stone) collected++;
      },
    });

    mineUntilBroken(interaction, world, inputState);

    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    expect(collected).toBe(1);
    interaction.dispose();
  });

  it('turns held-mined ore blocks into their distinct world item entities', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);
    const world = makeMutableWorld(BlockId.CoalOre);
    const itemEntities = new ItemEntityManager({ itemRegistry: createDefaultItemRegistry() });
    const inputState = { breakRequested: true, held: true };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: {
        getSelectedItemId: () => BlockId.Stone,
        getSlotCount: () => 1,
      },
      player,
      camera,
      input: makeInput(inputState),
      itemEntities,
    });

    mineUntilBroken(interaction, world, inputState);
    expect(itemEntities.size).toBe(1);
    expect(itemEntities.getItemEntities()[0]!.item).toBe(ItemId.Coal);
    expect(itemEntities.getItemEntities()[0]!.count).toBe(1);
    interaction.dispose();
  });

  it('advances held breaking by block hardness and resets when released', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);
    const world = makeMutableWorld();
    const state = { breakRequested: true, held: true };
    const progress: number[] = [];
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => BlockId.Stone },
      player,
      camera,
      input: makeInput(state),
      onBreakProgress: (value) => progress.push(value),
    });

    interaction.update(0.1);
    expect(Math.max(...progress)).toBeGreaterThan(0);
    state.held = false;
    interaction.update(0.1);
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Stone);
    expect(progress.at(-1)).toBe(0);

    state.held = true;
    state.breakRequested = true;
    for (let i = 0; i < 20 && world.getBlock(2, 1, 0) !== BlockId.Air; i++) {
      interaction.update(0.1);
    }
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    expect(progress.at(-1)).toBe(0);
    interaction.dispose();
  });

  it('uses a matching pickaxe bonus and damages its durability on break', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);
    const world = makeMutableWorld();
    const state = { breakRequested: true, held: true };
    let durability = 5;
    let toolBreaks = 0;
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: {
        getSelectedItemId: () => ItemId.WoodenPickaxe,
        getSlotCount: () => 1,
        damageSelectedItem: () => {
          durability--;
          if (durability <= 0) toolBreaks++;
          return durability <= 0;
        },
      },
      player,
      camera,
      input: makeInput(state),
    });

    for (let i = 0; i < 10 && world.getBlock(2, 1, 0) !== BlockId.Air; i++) {
      interaction.update(0.1);
    }
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    expect(durability).toBe(4);
    expect(toolBreaks).toBe(0);
    interaction.dispose();
  });

  it('removes a non-harvestable block without spawning a drop when untooled', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);
    const world = makeMutableWorld();
    const itemEntities = new ItemEntityManager({ itemRegistry: createDefaultItemRegistry(), rng: Math.random });
    const spawnSpy = vi.spyOn(itemEntities, 'spawnLootStacks');
    const harvestRules = new HarvestRules(
      createDefaultBlockTags(createDefaultBlockRegistry()),
      createDefaultItemTags(createDefaultItemRegistry()),
    );
    const inputState = { breakRequested: true, held: true };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      // Stone item (no toolKind) held while breaking stone (miningLevel 1).
      selector: { getSelectedItemId: () => BlockId.Stone },
      player,
      camera,
      input: makeInput(inputState),
      itemEntities,
      harvestRules,
    });

    mineUntilBroken(interaction, world, inputState);

    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    expect(spawnSpy).not.toHaveBeenCalled();
    interaction.dispose();
  });

  it('spawns one xp orb on a productive break when an xpOrbs manager is supplied', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);
    const world = makeMutableWorld(BlockId.CoalOre);
    const itemEntities = new ItemEntityManager({ itemRegistry: createDefaultItemRegistry() });
    const xpOrbs = new XpOrbManager();
    const inputState = { breakRequested: true, held: true };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => BlockId.Stone },
      player,
      camera,
      input: makeInput(inputState),
      itemEntities,
      xpOrbs,
      xpOrbValue: 3,
    });

    mineUntilBroken(interaction, world, inputState);

    expect(itemEntities.size).toBe(1);
    expect(xpOrbs.getXpOrbs()).toHaveLength(1);
    expect(xpOrbs.getXpOrbs()[0]!.value).toBe(3);
    interaction.dispose();
  });

  it('spawns no xp orb when no xpOrbs manager is supplied', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);
    const world = makeMutableWorld(BlockId.CoalOre);
    const itemEntities = new ItemEntityManager({ itemRegistry: createDefaultItemRegistry() });
    const xpOrbs = new XpOrbManager();
    const inputState = { breakRequested: true, held: true };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => BlockId.Stone },
      player,
      camera,
      input: makeInput(inputState),
      itemEntities,
      xpOrbValue: 3,
    });

    mineUntilBroken(interaction, world, inputState);

    expect(itemEntities.size).toBe(1);
    // The supplied manager was never handed to the interaction, so no orb appears.
    expect(xpOrbs.getXpOrbs()).toHaveLength(0);
    interaction.dispose();
  });

  it('a released click cannot bypass the remaining break duration (hardening 2026-08-23)', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);
    const world = makeMutableWorld(); // stone at (2,1,0), hardness 1.5
    // Quick click: press queues the request, release arrives before any tick
    // advances progress. The old code finished the break unconditionally.
    const inputState = { breakRequested: true, held: false };
    let breakActions = 0;
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => BlockId.Stone },
      player,
      camera,
      input: {
        ...makeInput(inputState),
        consumeBreakClick: () => true,
      },
      onAction: (action) => {
        if (action === 'break') breakActions++;
      },
    });

    interaction.update(0.05);

    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Stone);
    expect(breakActions).toBe(0);
    interaction.dispose();
  });
});

describe('player interaction enchantment application (119)', () => {
  const rid = (k: string) => createResourceId('minecraft', k);
  const enchantReg: EnchantmentRegistry = createDefaultEnchantmentRegistry();

  function enchanted(id: number, key: string, level: number): ItemStack {
    return setStackEnchantments({ id, count: 1 }, [{ id: rid(key), level }], enchantReg);
  }

  function aim(player: Player, camera: THREE.PerspectiveCamera): void {
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);
  }

  it('replaces the drop with the block item under silk touch', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    aim(player, camera);
    const world = makeMutableWorld(BlockId.Dirt);
    const itemEntities = new ItemEntityManager({ itemRegistry: createDefaultItemRegistry() });
    const harvestRules = new HarvestRules(
      createDefaultBlockTags(createDefaultBlockRegistry()),
      createDefaultItemTags(createDefaultItemRegistry()),
    );
    const inputState = { breakRequested: true, held: true };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: {
        getSelectedItemId: () => ItemId.Dirt,
        getSlotCount: () => 1,
        getSelectedStack: () => enchanted(ItemId.Dirt, 'silk_touch', 1),
      },
      player,
      camera,
      input: makeInput(inputState),
      itemEntities,
      harvestRules,
      enchantmentRegistry: enchantReg,
    });

    mineUntilBroken(interaction, world, inputState);

    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    expect(itemEntities.size).toBe(1);
    expect(itemEntities.getItemEntities()[0]!.item).toBe(ItemId.Dirt);
    expect(itemEntities.getItemEntities()[0]!.count).toBe(1);
    interaction.dispose();
  });

  it('adds fortune bonus items to the primary drop', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    aim(player, camera);
    const world = makeMutableWorld(BlockId.Dirt);
    const itemEntities = new ItemEntityManager({ itemRegistry: createDefaultItemRegistry() });
    const harvestRules = new HarvestRules(
      createDefaultBlockTags(createDefaultBlockRegistry()),
      createDefaultItemTags(createDefaultItemRegistry()),
    );
    const inputState = { breakRequested: true, held: true };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: {
        getSelectedItemId: () => ItemId.Dirt,
        getSlotCount: () => 1,
        getSelectedStack: () => enchanted(ItemId.Dirt, 'fortune', 3),
      },
      player,
      camera,
      input: makeInput(inputState),
      itemEntities,
      harvestRules,
      enchantmentRegistry: enchantReg,
      rng: () => 0.99, // floor(0.99 * 4) = 3 extra
    });

    mineUntilBroken(interaction, world, inputState);

    expect(itemEntities.size).toBe(1);
    const drop = itemEntities.getItemEntities()[0]!;
    expect(drop.item).toBe(ItemId.Dirt);
    expect(drop.count).toBe(4); // 1 base + 3 fortune
    interaction.dispose();
  });

  it('passes the unbreaking level into tool durability wear', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    aim(player, camera);
    const world = makeMutableWorld(BlockId.Stone);
    const harvestRules = new HarvestRules(
      createDefaultBlockTags(createDefaultBlockRegistry()),
      createDefaultItemTags(createDefaultItemRegistry()),
    );
    const captured: {
      amount: number;
      maxDur: number;
      unbreaking: number | undefined;
      rng: (() => number) | undefined;
    } = {
      amount: -1,
      maxDur: -1,
      unbreaking: undefined,
      rng: undefined,
    };
    const inputState = { breakRequested: true, held: true };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: {
        getSelectedItemId: () => ItemId.WoodenPickaxe,
        getSlotCount: () => 1,
        getSelectedStack: () => enchanted(ItemId.WoodenPickaxe, 'unbreaking', 3),
        damageSelectedItem: (amount, maxDur, unbreaking, rng) => {
          captured.amount = amount;
          captured.maxDur = maxDur;
          captured.unbreaking = unbreaking;
          captured.rng = rng;
          return false;
        },
      },
      player,
      camera,
      input: makeInput(inputState),
      harvestRules,
      enchantmentRegistry: enchantReg,
      rng: () => 0.5,
    });

    mineUntilBroken(interaction, world, inputState);

    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    expect(captured.amount).toBe(1);
    expect(captured.maxDur).toBe(59);
    expect(captured.unbreaking).toBe(3);
    expect(captured.rng).toBeTypeOf('function');
    interaction.dispose();
  });

  it('ignores enchantment effects when no registry is supplied', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    aim(player, camera);
    const world = makeMutableWorld(BlockId.Dirt);
    const itemEntities = new ItemEntityManager({ itemRegistry: createDefaultItemRegistry() });
    const harvestRules = new HarvestRules(
      createDefaultBlockTags(createDefaultBlockRegistry()),
      createDefaultItemTags(createDefaultItemRegistry()),
    );
    const inputState = { breakRequested: true, held: true };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: {
        getSelectedItemId: () => ItemId.Dirt,
        getSlotCount: () => 1,
        getSelectedStack: () => enchanted(ItemId.Dirt, 'silk_touch', 1),
      },
      player,
      camera,
      input: makeInput(inputState),
      itemEntities,
      harvestRules,
      // No enchantmentRegistry -> silk touch must not apply.
    });

    mineUntilBroken(interaction, world, inputState);

    // Without the registry the normal single drop is produced, not a silk drop.
    expect(itemEntities.getItemEntities()[0]!.count).toBe(1);
    interaction.dispose();
  });

  it('emits a use action when right-clicking an enchanting table', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    aim(player, camera);
    const world = makeMutableWorld(BlockId.EnchantingTable);
    const actions: string[] = [];
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => ItemId.WoodenPickaxe },
      player,
      camera,
      input: { ...makeInput({ breakRequested: false, held: false }), consumePlace: () => true },
      onAction: (action) => actions.push(action),
    });

    interaction.update(0.016);

    expect(actions).toContain('use');
    interaction.dispose();
  });

  it('does not emit use for a non-table block', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    aim(player, camera);
    const world = makeMutableWorld(BlockId.Stone);
    const actions: string[] = [];
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => ItemId.WoodenPickaxe },
      player,
      camera,
      input: { ...makeInput({ breakRequested: false, held: false }), consumePlace: () => true },
      onAction: (action) => actions.push(action),
    });

    interaction.update(0.016);

    expect(actions).not.toContain('use');
    interaction.dispose();
  });
});

describe('player interaction coordinate emission (251)', () => {
  function aim(player: Player, camera: THREE.PerspectiveCamera): void {
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);
  }

  it("right-clicking a furnace emits ('use', Furnace, coords) and never places", () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    aim(player, camera);
    const world = makeMutableWorld(BlockId.Furnace);
    const seen: Array<{ action: string; blockId?: number; coords?: { x: number; y: number; z: number } }> = [];
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => ItemId.Stone }, // a placeable block
      player,
      camera,
      input: { ...makeInput({ breakRequested: false, held: false }), consumePlace: () => true },
      onAction: (action, blockId, coords) => seen.push({ action, blockId, coords }),
    });

    interaction.update(0.016);

    const use = seen.find((s) => s.action === 'use');
    expect(use?.blockId).toBe(BlockId.Furnace);
    expect(use?.coords).toEqual({ x: 2, y: 1, z: 0 });
    // The targeted furnace is untouched: no placement replaced it.
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Furnace);
    expect(seen.some((s) => s.action === 'place')).toBe(false);
    interaction.dispose();
  });

  it('breaking emits the mined block coordinates', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    aim(player, camera);
    const world = makeMutableWorld(BlockId.Stone);
    let brokenCoords: { x: number; y: number; z: number } | undefined;
    const inputState = { breakRequested: false, held: false };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => ItemId.WoodenPickaxe },
      player,
      camera,
      input: makeInput(inputState),
      onAction: (_action, _blockId, coords) => {
        if (coords) brokenCoords = coords;
      },
    });

    inputState.breakRequested = true;
    inputState.held = true;
    for (let i = 0; i < 400 && world.getBlock(2, 1, 0) !== BlockId.Air; i++) {
      interaction.update(0.05);
    }
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    expect(brokenCoords).toEqual({ x: 2, y: 1, z: 0 });
    interaction.dispose();
  });

  it('a committed placement emits the placed-cell coordinates', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    aim(player, camera);
    const world = makeMutableWorld(BlockId.Stone);
    let placedCoords: { x: number; y: number; z: number } | undefined;
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: {
        getSelectedItemId: () => ItemId.Cobblestone,
        getSlotCount: () => 1,
        consumeSelected: () => true,
      },
      player,
      camera,
      input: { ...makeInput({ breakRequested: false, held: false }), consumePlace: () => true },
      onAction: (_action, _blockId, coords) => {
        placedCoords = coords;
      },
    });

    interaction.update(0.016);

    // Horizontal ray hits the block's west face → placement lands at x=1.
    expect(world.getBlock(1, 1, 0)).toBe(BlockId.Cobblestone);
    expect(placedCoords).toEqual({ x: 1, y: 1, z: 0 });
    interaction.dispose();
  });
});

describe('player interaction bone meal (127)', () => {
  function aim(player: Player, camera: THREE.PerspectiveCamera): void {
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);
  }

  it('emits use instead of placing when bone meal is selected and a block is targeted', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    aim(player, camera);
    const world = makeMutableWorld(BlockId.Wheat);
    const actions: string[] = [];
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: {
        getSelectedItemId: () => ItemId.BoneMeal,
        getSlotCount: () => 1,
        consumeSelected: () => true,
      },
      player,
      camera,
      input: { ...makeInput({ breakRequested: false, held: false }), consumePlace: () => true },
      onAction: (action) => actions.push(action),
    });

    interaction.update(0.016);

    expect(actions).toContain('use');
    expect(actions).not.toContain('place');
    // Bone meal is not placeable, so the targeted block is untouched.
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Wheat);
    interaction.dispose();
  });

  it('does not emit use for bone meal when a non-bone-meal item is selected', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    aim(player, camera);
    const world = makeMutableWorld(BlockId.Wheat);
    const actions: string[] = [];
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => ItemId.WoodenPickaxe },
      player,
      camera,
      input: { ...makeInput({ breakRequested: false, held: false }), consumePlace: () => true },
      onAction: (action) => actions.push(action),
    });

    interaction.update(0.016);

    expect(actions).not.toContain('use');
    interaction.dispose();
  });
});