import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { Chunk } from '../../src/world/Chunk';
import { CONFIG } from '../../src/config';

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

describe('wheat block-state enumeration (125)', () => {
  it('enumerates exactly 8 wheat states for age 0..7', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.Wheat);
    expect(states.length).toBe(8);
    expect(states.map((s) => s.getProperty('age'))).toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
    expect(stateRegistry.getDefaultState(BlockId.Wheat).getProperty('age')).toBe('0');
    // Lookup by complete assignment round-trips.
    expect(stateRegistry.lookup(BlockId.Wheat, { age: 7 }).getProperty('age')).toBe('7');
  });
});

describe('World block-state access (125)', () => {
  it('setBlockState/getBlockState round-trips a wheat age through the World', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);

    world.setBlockState(8, 8, 8, BlockId.Wheat, { age: 5 });
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Wheat);
    expect(world.getBlockState(8, 8, 8).getProperty('age')).toBe('5');
  });

  it('an unset wheat cell resolves to the default age 0', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);

    world.setBlock(8, 8, 8, BlockId.Wheat);
    expect(world.getBlockState(8, 8, 8).getProperty('age')).toBe('0');
  });

  it('a plain setBlock clears a previously recorded state override', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);

    world.setBlockState(8, 8, 8, BlockId.Wheat, { age: 5 });
    expect(world.getBlockState(8, 8, 8).getProperty('age')).toBe('5');

    world.setBlock(8, 8, 8, BlockId.Stone);
    // No stale wheat state leaks onto the stone block.
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Stone);
    expect(world.getBlockState(8, 8, 8).getProperty('age')).toBeUndefined();
  });

  it('setBlockState is a no-op for out-of-bounds or unregistered blocks', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);

    world.setBlockState(8, -1, 8, BlockId.Wheat, { age: 2 });
    world.setBlockState(8, 8, 8, 999, { age: 2 });
    expect(world.getBlock(8, -1, 8)).toBe(BlockId.Air);
    expect(world.getBlockState(8, 8, 8).getProperty('age')).toBeUndefined();
  });
});
