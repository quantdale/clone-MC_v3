import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RenderSimulationDistance, chebyshevDistance } from '../../src/world/RenderSimulationDistance';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { CONFIG } from '../../src/config';

describe('RenderSimulationDistance classifier', () => {
  it('computes Chebyshev distance as the max axis delta', () => {
    expect(chebyshevDistance(0, 0, 0, 0)).toBe(0);
    expect(chebyshevDistance(2, 1, 0, 0)).toBe(2);
    expect(chebyshevDistance(1, 4, 0, 0)).toBe(4);
    expect(chebyshevDistance(-3, -2, 0, 0)).toBe(3);
  });

  it('reports rendering boundary membership independently of simulation', () => {
    const rsd = new RenderSimulationDistance(4, 2);
    // On the rendering boundary: rendered, not simulated.
    expect(rsd.isWithinRenderDistance(4, 0, 0, 0)).toBe(true);
    expect(rsd.isWithinSimulationDistance(4, 0, 0, 0)).toBe(false);
    // Just outside the rendering radius: neither.
    expect(rsd.isWithinRenderDistance(5, 0, 0, 0)).toBe(false);
    expect(rsd.isWithinSimulationDistance(5, 0, 0, 0)).toBe(false);
  });

  it('reports an inside-simulation chunk as within both radii', () => {
    const rsd = new RenderSimulationDistance(4, 2);
    expect(rsd.isWithinSimulationDistance(0, 0, -1, -1)).toBe(true);
    expect(rsd.isWithinRenderDistance(0, 0, -1, -1)).toBe(true);
  });

  it('uses the max axis so a diagonal chunk is classified correctly', () => {
    const rsd = new RenderSimulationDistance(2, 2);
    expect(rsd.isWithinRenderDistance(2, 1, 0, 0)).toBe(true);
    expect(rsd.isWithinRenderDistance(3, 0, 0, 0)).toBe(false);
  });

  it('rejects a negative radius', () => {
    expect(() => new RenderSimulationDistance(-1, 2)).toThrow();
    expect(() => new RenderSimulationDistance(2, -1)).toThrow();
  });

  it('fromConfig defaults both radii to CONFIG', () => {
    const rsd = RenderSimulationDistance.fromConfig();
    expect(rsd.renderDistance).toBe(CONFIG.renderDistance);
    expect(rsd.simulationDistance).toBe(CONFIG.simulationDistance);
  });

  it('fromConfig overrides only the supplied radius', () => {
    const rsd = RenderSimulationDistance.fromConfig({ simulationDistance: 1 });
    expect(rsd.renderDistance).toBe(CONFIG.renderDistance);
    expect(rsd.simulationDistance).toBe(1);
  });
});

describe('World render vs simulation distance integration', () => {
  function makeWorld(seed = 1, renderDistance = 4, simulationDistance = 2): World {
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
      renderDistance,
      simulationDistance,
    });
  }

  it('exposes the two radii independently', () => {
    const world = makeWorld(1, 4, 2);
    expect(world.getRenderDistance()).toBe(4);
    expect(world.getSimulationDistance()).toBe(2);
  });

  it('is not simulating before the first stream centers the player', () => {
    const world = makeWorld(1, 4, 2);
    expect(world.isChunkSimulating(0, 0)).toBe(false);
  });

  it('streams on the rendering radius but gates simulation on the sim radius', () => {
    const world = makeWorld(1, 4, 2);
    // Stream enough frames to center on (0,0) and generate the near area.
    for (let i = 0; i < 60; i++) {
      world.update(0.016, 0, 0);
    }
    // A chunk at render-distance 3 is rendered (streamed) but outside the sim radius of 2.
    expect(world.isChunkSimulating(3, 0)).toBe(false);
    // A chunk at distance 2 is within both radii.
    expect(world.isChunkSimulating(2, 0)).toBe(true);
  });

  it('keeps simulation scope independent of the constructor fallback', () => {
    const world = new World({
      registry: createDefaultBlockRegistry(),
      seed: 1,
      scene: new THREE.Scene(),
      mesher: { mesh: () => ({ opaque: null, transparent: null }) } as never,
      generator: { generateChunk: (c: Chunk) => c.fill(BlockId.Stone), getHeightAt: () => 33 } as never,
      materials: { opaque: new THREE.MeshLambertMaterial(), transparent: new THREE.MeshLambertMaterial() },
      renderDistance: 3,
      // simulationDistance omitted → falls back to CONFIG.simulationDistance (== 6 by default),
      // which is wider than the render radius here.
    });
    expect(world.getSimulationDistance()).toBe(CONFIG.simulationDistance);
  });
});
