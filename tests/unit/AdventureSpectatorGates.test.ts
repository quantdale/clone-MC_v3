import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Player } from '../../src/player/Player';
import { PlayerInteraction } from '../../src/player/PlayerInteraction';
import { PlayerPhysics } from '../../src/player/PlayerPhysics';
import type { InputState } from '../../src/engine/InputTypes';
import {
  BlockId,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  ItemId,
  createDefaultItemRegistry,
} from '../../src/inventory/ItemRegistry';

function aim(player: Player, camera: THREE.PerspectiveCamera): void {
  camera.position.copy(player.eyePosition);
  camera.lookAt(10, player.eyePosition.y, player.eyePosition.z);
  camera.updateMatrixWorld(true);
}

function makePlayerCamera(): { player: Player; camera: THREE.PerspectiveCamera } {
  const player = new Player({ position: new THREE.Vector3(0.5, 0, 0.5) });
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
  aim(player, camera);
  return { player, camera };
}

function makeStoneWorld(): import('../../src/world/WorldAccess').WorldAccess {
  const blocks = new Map<string, number>([['2,1,0', BlockId.Stone]]);
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  return {
    getBlock(x, y, z) {
      return blocks.get(key(x, y, z)) ?? BlockId.Air;
    },
    isSolid(x, y, z) {
      return this.getBlock(x, y, z) === BlockId.Stone;
    },
    setBlock(x, y, z, id) {
      blocks.set(key(x, y, z), id);
    },
  };
}

function makeInput(state: {
  breakRequested: boolean;
  held: boolean;
  place: boolean;
}): InputState {
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
    consumePlace: () => {
      const value = state.place;
      state.place = false;
      return value;
    },
    consumeHotbarDelta: () => 0,
    consumeHotbarIndex: () => -1,
    consumeDebugToggle: () => false,
    consumeCraftingToggle: () => false,
    consumeEat: () => false,
  };
}

describe('player interaction adventure/spectator gates (266)', () => {
  it('denied break surfaces blocked once and leaves the world untouched', () => {
    const { player, camera } = makePlayerCamera();
    const world = makeStoneWorld();
    const seen: string[] = [];
    const state = { breakRequested: true, held: true, place: false };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => ItemId.WoodenPickaxe },
      player,
      camera,
      input: makeInput(state),
      onAction: (action) => seen.push(action),
      canBreak: () => false,
    });

    for (let i = 0; i < 60; i++) interaction.update(0.05);

    expect(seen.filter((a) => a === 'blocked').length).toBe(1);
    expect(seen).not.toContain('break');
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Stone);
    interaction.dispose();
  });

  it('allowed break still mines to completion (legacy default)', () => {
    const { player, camera } = makePlayerCamera();
    const world = makeStoneWorld();
    const state = { breakRequested: true, held: true, place: false };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => ItemId.WoodenPickaxe },
      player,
      camera,
      input: makeInput(state),
      // No gates injected: legacy defaults allow everything.
    });

    for (let i = 0; i < 400 && world.getBlock(2, 1, 0) !== BlockId.Air; i++) {
      interaction.update(0.05);
    }
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Air);
    interaction.dispose();
  });

  it('denied place refuses before consuming the stack', () => {
    const { player, camera } = makePlayerCamera();
    const world = makeStoneWorld();
    const seen: string[] = [];
    let consumed = 0;
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: {
        getSelectedItemId: () => ItemId.Cobblestone,
        getSlotCount: () => 3,
        consumeSelected: () => {
          consumed++;
          return true;
        },
      },
      player,
      camera,
      input: makeInput({ breakRequested: false, held: false, place: true }),
      onAction: (action) => seen.push(action),
      canPlace: () => false,
    });

    interaction.update(0.016);

    expect(seen).toEqual(['blocked']);
    expect(consumed).toBe(0);
    expect(world.getBlock(1, 1, 0)).toBe(BlockId.Air);
    interaction.dispose();
  });

  it('canInteract=false drains inputs silently with no action and no toast path', () => {
    const { player, camera } = makePlayerCamera();
    const world = makeStoneWorld();
    const seen: string[] = [];
    let consumed = 0;
    const state = { breakRequested: true, held: true, place: true };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: {
        getSelectedItemId: () => ItemId.Cobblestone,
        getSlotCount: () => 3,
        consumeSelected: () => {
          consumed++;
          return true;
        },
      },
      player,
      camera,
      input: makeInput(state),
      onAction: (action) => seen.push(action),
      canInteract: () => false,
    });

    for (let i = 0; i < 10; i++) interaction.update(0.05);

    expect(seen).toEqual([]);
    expect(consumed).toBe(0);
    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Stone);
    expect(world.getBlock(1, 1, 0)).toBe(BlockId.Air);
    // Inputs were drained (no queued actions fire once interaction returns).
    expect(state.breakRequested).toBe(false);
    expect(state.place).toBe(false);
    const outline = interaction.addTargetOutline();
    expect(outline!.visible).toBe(false);
    interaction.dispose();
  });

  it('mid-mine denial resets progress silently', () => {
    const { player, camera } = makePlayerCamera();
    const world = makeStoneWorld();
    const seen: string[] = [];
    let allowed = true;
    const state = { breakRequested: true, held: true, place: false };
    const interaction = new PlayerInteraction({
      world,
      registry: createDefaultBlockRegistry(),
      itemRegistry: createDefaultItemRegistry(),
      selector: { getSelectedItemId: () => ItemId.WoodenPickaxe },
      player,
      camera,
      input: makeInput(state),
      onAction: (action) => seen.push(action),
      onBreakProgress: () => {
        // Revoke permission partway through the mine.
        allowed = false;
      },
      canBreak: () => allowed,
    });

    for (let i = 0; i < 60; i++) interaction.update(0.05);

    expect(world.getBlock(2, 1, 0)).toBe(BlockId.Stone);
    expect(seen).not.toContain('break');
    interaction.dispose();
  });
});

describe('player physics spectator noclip (266)', () => {
  function makeWallWorld(): import('../../src/world/WorldAccess').WorldAccess {
    return {
      getBlock(): number {
        return 0;
      },
      setBlock(): void {
        /* no-op */
      },
      isSolid(x: number, y: number): boolean {
        if (y < 0) return true;
        if (x >= 5 && y >= 0 && y <= 3) return true;
        return false;
      },
    };
  }

  const registry = createDefaultBlockRegistry();

  it('noclip integrates through a solid wall with no support or fall distance', () => {
    const physics = new PlayerPhysics(makeWallWorld(), registry, { noclip: () => true });
    const player = new Player({ position: new THREE.Vector3(2, 2, 2) });
    player.velocity.x = 5;
    player.fallDistance = 12;
    for (let i = 0; i < 60; i++) physics.update(player, 0.016);
    expect(player.position.x).toBeGreaterThan(5);
    expect(player.velocity.x).toBe(5);
    expect(player.onGround).toBe(false);
    expect(player.fallDistance).toBe(0);
    expect(physics.getSupportContact().kind).toBe('air');
    expect(physics.consumeLandingDistance()).toBe(0);
  });

  it('without noclip the same wall still blocks (legacy default)', () => {
    const physics = new PlayerPhysics(makeWallWorld(), registry);
    const player = new Player({ position: new THREE.Vector3(2, 2, 2) });
    player.velocity.x = 5;
    player.onGround = true;
    for (let i = 0; i < 60; i++) physics.update(player, 0.016);
    expect(player.position.x).toBeLessThan(5);
    expect(player.velocity.x).toBe(0);
  });
});
