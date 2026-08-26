import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { CONFIG } from '../../src/config';
import { worldToChunk, worldToLocal } from '../../src/world/WorldCoordinates';

/**
 * Change 254 R1: allocation-free World block reads with exact semantics.
 * The inline floor-div/mod math must agree with the exported tuple helpers
 * across the full integer domain, and every historical edge case must be
 * preserved (non-integers → air, unloaded → air, sub-bedrock solidity).
 */

function makeWorld(seed = 1337): World {
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
    seed,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials,
    renderDistance: 2,
  });
}

describe('World.getBlock hot-path semantics (254 R1)', () => {
  it('reads back writes identically across chunk boundaries including negatives', () => {
    const world = makeWorld();
    for (let i = 0; i < 200; i++) world.update(0.016, 0, 0);
    // Cross every axis boundary in both directions, staying inside the
    // streamed radius (renderDistance 2 → chunks cx,cz ∈ [-2..2]).
    const cells: Array<[number, number, number]> = [
      [0, 0, 0],
      [-1, 0, 0], [1, 0, 0],
      [15, 63, 15], [16, 63, 16], [-1, 63, -1],
      [-16, 1, -16], [-17, 1, -17],
      [31, 32, 32], [-31, 5, -31],
    ];
    for (const [x, y, z] of cells) {
      if (y < 0 || y >= CONFIG.chunk.height) continue;
      world.setBlock(x, y, z, BlockId.Dirt);
    }
    for (const [x, y, z] of cells) {
      if (y < 0 || y >= CONFIG.chunk.height) continue;
      expect(world.getBlock(x, y, z)).toBe(BlockId.Dirt);
    }
  });

  it('inline coordinate math agrees with the exported helpers over a negative sweep', () => {
    for (let x = -40; x <= 40; x += 3) {
      for (let y = -70; y <= 130; y += 7) {
        for (let z = -40; z <= 40; z += 5) {
          const [cx, cy, cz] = worldToChunk(x, y, z);
          const [lx, ly, lz] = worldToLocal(x, y, z);
          expect(cx).toBe(Math.floor(x / CONFIG.chunk.width));
          expect(cy).toBe(Math.floor(y / CONFIG.chunk.height));
          expect(cz).toBe(Math.floor(z / CONFIG.chunk.depth));
          expect(lx).toBe(x - cx * CONFIG.chunk.width);
          expect(ly).toBe(y - cy * CONFIG.chunk.height);
          expect(lz).toBe(z - cz * CONFIG.chunk.depth);
        }
      }
    }
  });

  it('returns air for non-integer and non-finite coordinates', () => {
    const world = makeWorld();
    for (let i = 0; i < 200; i++) world.update(0.016, 0, 0);
    expect(world.getBlock(8.5, 8, 8)).toBe(BlockId.Air);
    expect(world.getBlock(8, NaN, 8)).toBe(BlockId.Air);
    expect(world.getBlock(8, 8, Infinity)).toBe(BlockId.Air);
    expect(world.getBlock(-Infinity, 8, 8)).toBe(BlockId.Air);
  });

  it('unloaded chunks read as air', () => {
    const world = makeWorld();
    // No streaming ever ran: nothing is loaded anywhere.
    expect(world.getBlock(12345, 40, -999)).toBe(BlockId.Air);
    expect(world.isSolid(12345, 40, -999)).toBe(false);
  });

  it('isSolid preserves the invisible sub-bedrock floor contract', () => {
    const world = makeWorld();
    for (let i = 0; i < 200; i++) world.update(0.016, 0, 0);
    for (const y of [-500, -64, -2, -1]) {
      expect(world.isSolid(77, y, -77)).toBe(true);
    }
    expect(world.isSolid(8, 0, 8)).toBe(true); // generated stone
    expect(world.isSolid(9999, CONFIG.seaLevel, 9999)).toBe(false); // unloaded column
  });
});
