import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Player } from '../../src/player/Player';
import { PlayerInteraction } from '../../src/player/PlayerInteraction';
import type { InputState } from '../../src/engine/InputTypes';
import { BlockId, createDefaultBlockRegistry, createDefaultBlockTags } from '../../src/world/BlockRegistry';
import { ItemId, createDefaultItemRegistry, createDefaultItemTags } from '../../src/inventory/ItemRegistry';
import { HarvestRules } from '../../src/world/HarvestRules';
import { ItemEntityManager } from '../../src/simulation/ItemEntityManager';
import { XpOrbManager } from '../../src/simulation/XpOrbManager';

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

  it('breaks a block on click and collects it into the selected stack', () => {
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
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector,
      player,
      camera,
      input: makeInput({ breakRequested: true, held: false }),
      onAction: (action, id) => {
        if (action === 'break' && id === ItemId.Stone) collected++;
      },
    });

    interaction.update(0.016);

    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    expect(collected).toBe(1);
    interaction.dispose();
  });

  it('turns ore blocks into their distinct world item entities', () => {
    const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    camera.position.copy(player.eyePosition);
    camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
    camera.updateMatrixWorld(true);
    const world = makeMutableWorld(BlockId.CoalOre);
    const itemEntities = new ItemEntityManager({ itemRegistry: createDefaultItemRegistry() });
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
      input: makeInput({ breakRequested: true, held: false }),
      itemEntities,
    });

    interaction.update(0.016);
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
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      // Stone item (no toolKind) held while breaking stone (miningLevel 1).
      selector: { getSelectedItemId: () => BlockId.Stone },
      player,
      camera,
      input: makeInput({ breakRequested: true, held: false }),
      itemEntities,
      harvestRules,
    });

    interaction.update(0.016);

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
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => BlockId.Stone },
      player,
      camera,
      input: makeInput({ breakRequested: true, held: false }),
      itemEntities,
      xpOrbs,
      xpOrbValue: 3,
    });

    interaction.update(0.016);

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
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => BlockId.Stone },
      player,
      camera,
      input: makeInput({ breakRequested: true, held: false }),
      itemEntities,
      xpOrbValue: 3,
    });

    interaction.update(0.016);

    expect(itemEntities.size).toBe(1);
    // The supplied manager was never handed to the interaction, so no orb appears.
    expect(xpOrbs.getXpOrbs()).toHaveLength(0);
    interaction.dispose();
  });
});
