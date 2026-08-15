import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { Chunk } from '../../src/world/Chunk';
import { CONFIG } from '../../src/config';
import { createResourceId } from '../../src/data/ResourceId';

/** Build a World with a stub mesher/generator for state round-trip tests. */
function makeWorld(): World {
  const registry = createDefaultBlockRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = {
    generateChunk(chunk: Chunk): void {
      chunk.fill(BlockId.Stone);
    },
    getHeightAt(): number {
      return CONFIG.seaLevel + 1;
    },
  };
  const mesher = {
    mesh(): { opaque: null; transparent: null } {
      return { opaque: null, transparent: null };
    },
  };
  return new World({
    registry,
    seed: 1,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials,
    renderDistance: 2,
    stateRegistry: createDefaultBlockStateRegistry(),
  });
}

/** Stream around the player chunk until the target cell is generated. */
function streamUntilGenerated(world: World, cx: number, cz: number): void {
  for (let i = 0; i < 200; i++) {
    world.update(0.016, cx, cz);
    if (world.getBlock(cx * 16 + 8, 8, cz * 16 + 8) !== BlockId.Air) {
      return;
    }
  }
}

describe('farmland block-state enumeration (126)', () => {
  it('enumerates exactly 8 farmland states for moisture 0..7', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.Farmland);
    expect(states.length).toBe(8);
    expect(states.map((s) => s.getProperty('moisture'))).toEqual([
      '0', '1', '2', '3', '4', '5', '6', '7',
    ]);
    expect(stateRegistry.getDefaultState(BlockId.Farmland).getProperty('moisture')).toBe('0');
    // Lookup by complete assignment round-trips.
    expect(stateRegistry.lookup(BlockId.Farmland, { moisture: 7 }).getProperty('moisture')).toBe('7');
  });

  it('is registered as a solid, breakable block that drops dirt', () => {
    const registry = createDefaultBlockRegistry();
    const def = registry.get(BlockId.Farmland);
    expect(def.key).toBe('farmland');
    expect(def.solid).toBe(true);
    expect(def.opaque).toBe(true);
    expect(def.breakable).toBe(true);
    expect(def.dropItem).toBeDefined();
    // Farmland drops dirt (ItemId.Dirt resource id), not itself.
    expect(def.dropItem).toEqual(createResourceId('minecraft', 'dirt'));
  });
});

describe('World block-state access for farmland (126)', () => {
  it('setBlockState/getBlockState round-trips farmland moisture through the World', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);

    world.setBlockState(8, 8, 8, BlockId.Farmland, { moisture: 5 });
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Farmland);
    expect(world.getBlockState(8, 8, 8).getProperty('moisture')).toBe('5');
  });

  it('an unset farmland cell resolves to the default moisture 0', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);

    world.setBlock(8, 8, 8, BlockId.Farmland);
    expect(world.getBlockState(8, 8, 8).getProperty('moisture')).toBe('0');
  });

  it('a plain setBlock clears a previously recorded moisture override', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);

    world.setBlockState(8, 8, 8, BlockId.Farmland, { moisture: 6 });
    expect(world.getBlockState(8, 8, 8).getProperty('moisture')).toBe('6');

    world.setBlock(8, 8, 8, BlockId.Stone);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Stone);
    expect(world.getBlockState(8, 8, 8).getProperty('moisture')).toBeUndefined();
  });

  it('setBlockState is a no-op for out-of-bounds or unregistered blocks', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);

    world.setBlockState(8, -1, 8, BlockId.Farmland, { moisture: 2 });
    world.setBlockState(8, 8, 8, 999, { moisture: 2 });
    expect(world.getBlock(8, -1, 8)).toBe(BlockId.Air);
    expect(world.getBlockState(8, 8, 8).getProperty('moisture')).toBeUndefined();
  });
});
