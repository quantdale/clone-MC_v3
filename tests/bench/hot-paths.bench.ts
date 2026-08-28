import { bench, describe } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { CONFIG } from '../../src/config';
import { RandomTickSelector } from '../../src/simulation/RandomTickSelector';
import { WorldLightStorage } from '../../src/rendering/LightStorage';

/**
 * Hot-path micro-benchmarks (Change 254). Run with:
 *   npx vitest bench --run tests/bench/hot-paths.bench.ts
 *
 * These measure the engine's hottest read paths so optimization work is measured,
 * not guessed. Numbers are machine-relative; compare only same-machine runs.
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

/** Stream until chunk (0,0,0) is generated so block reads hit real data. */
function primeWorld(world: World): void {
  for (let i = 0; i < 200; i++) {
    world.update(0.016, 0, 0);
    if (world.getBlock(8, 8, 8) !== BlockId.Air) return;
  }
}

describe('engine hot paths', () => {
  const world = makeWorld();
  primeWorld(world);

  bench('world.getBlock 8192-call sweep', () => {
    let acc = 0;
    for (let i = 0; i < 8192; i++) {
      acc += world.getBlock((i & 31) - 8, i & 63, ((i >> 5) & 31) - 8);
    }
    if (acc === -1) throw new Error('unreachable');
  });

  bench('world.isSolid 8192-call sweep', () => {
    let acc = 0;
    for (let i = 0; i < 8192; i++) {
      acc += world.isSolid((i & 31) - 8, i & 63, ((i >> 5) & 31) - 8) ? 1 : 0;
    }
    if (acc < 0) throw new Error('unreachable');
  });

  bench('random-tick selection worst case (all-ineligible, 3x256 cap)', () => {
    const selector = new RandomTickSelector();
    let hits = 0;
    for (let sectionZ = -6; sectionZ <= 6; sectionZ++) {
      const positions = selector.selectEligible(0, 2, sectionZ, 100, 1337, () => false);
      hits += positions.length;
    }
    if (hits !== 0) throw new Error('unreachable');
  });

  bench('random-tick selection sparse eligibility', () => {
    const selector = new RandomTickSelector();
    let hits = 0;
    for (let sectionZ = -6; sectionZ <= 6; sectionZ++) {
      const positions = selector.selectEligible(0, 2, sectionZ, 100, 1337, (x, y, z) => ((x * 31 + y * 17 + z * 13) & 63) === 0);
      hits += positions.length;
    }
    if (hits < 0) throw new Error('unreachable');
  });

  bench('light storage 4096 get/set pairs', () => {
    const storage = new WorldLightStorage();
    storage.setSkyLight(0, 40, 0, 15);
    let acc = 0;
    for (let i = 0; i < 4096; i++) {
      const x = i & 15;
      const y = 32 + ((i >> 4) & 15);
      const z = (i >> 8) & 15;
      storage.setSkyLight(x, y, z, i & 15);
      acc += storage.getSkyLight(x, y, z);
      storage.setBlockLight(x, y, z, (i + 3) & 15);
      acc += storage.getBlockLight(x, y, z);
    }
    if (acc < 0) throw new Error('unreachable');
  });
});
