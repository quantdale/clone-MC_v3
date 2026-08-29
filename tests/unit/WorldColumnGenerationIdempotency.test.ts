import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { TerrainGenerator } from '../../src/world/TerrainGenerator';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';

/**
 * Change 253 Phase 3/8 regression gate.
 *
 * The live streaming path used "does this chunk layer own an allocated section?"
 * as its proxy for "has this column been generated?". That proxy is unsound for
 * layers that are legitimately all air (everything above terrain): an air layer
 * never allocates a section, so every above-terrain layer re-ran the full
 * 384-block `generateColumn` for a column that was already generated.
 *
 * Two defects follow, and this file pins both:
 *   - PERF: O(vertical layers) redundant full-column generation per column.
 *   - DATA LOSS: that redundant generation re-stamps terrain over a column
 *     restored from persistence, refilling blocks the player had mined out.
 */
function makeWorld(seed = 1337): {
  world: World;
  generateColumnCalls: () => number;
  generateChunkCalls: () => number;
} {
  const registry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = new TerrainGenerator(registry, seed);
  let columnCalls = 0;
  const originalColumn = generator.generateColumn.bind(generator);
  generator.generateColumn = ((column, reg) => {
    columnCalls++;
    originalColumn(column, reg);
  }) as typeof generator.generateColumn;
  let slabCalls = 0;
  const originalSlab = generator.generateChunk.bind(generator);
  generator.generateChunk = ((chunk) => {
    slabCalls++;
    originalSlab(chunk);
  }) as typeof generator.generateChunk;
  const mesher = { mesh: () => ({ opaque: null, transparent: null }) };
  const world = new World({
    registry,
    seed,
    scene,
    mesher: mesher as never,
    generator,
    materials,
    renderDistance: 1,
    dimension: OVERWORLD_DIMENSION_TYPE,
    stateRegistry,
  });
  return {
    world,
    generateColumnCalls: () => columnCalls,
    generateChunkCalls: () => slabCalls,
  };
}

function streamToQuiescence(world: World, frames = 2000): void {
  for (let i = 0; i < frames; i++) world.update(0.016, 0, 0);
}

describe('live column generation is performed exactly once per column', () => {
  it('generates each resident column once, not once per vertical chunk layer', () => {
    const { world, generateColumnCalls, generateChunkCalls } = makeWorld();
    streamToQuiescence(world);

    let distinctColumns = 0;
    for (const _column of world.storage.columns()) {
      void _column;
      distinctColumns++;
    }

    expect(distinctColumns).toBeGreaterThan(0);
    // One generation pass per column. The Overworld streams 6 vertical layers,
    // so the pre-fix path ran this 5x per column.
    expect(generateColumnCalls()).toBe(distinctColumns);
    // The six 64-high resident projections are compatibility views only; the
    // production TerrainGenerator-backed path must never generate through them.
    expect(generateChunkCalls()).toBe(0);
  });

  it('does not re-generate terrain over a column restored from persistence', () => {
    // Produce a saved world: stream it, mine a block out below y=0, export.
    const source = makeWorld();
    streamToQuiescence(source.world, 2000);

    let target = -1;
    for (let y = -1; y >= -60; y--) {
      if (source.world.getBlockState(0, y, 0).blockId === BlockId.Stone) {
        target = y;
        break;
      }
    }
    expect(target).toBeGreaterThan(-61);
    source.world.setBlock(0, target, 0, BlockId.Air);
    const saved = source.world.storage.serialize();

    // Restore it into a fresh world *before* streaming, exactly as boot does.
    const restored = makeWorld();
    expect(restored.world.importColumns(saved)).toBe(true);
    expect(restored.world.getBlockState(0, target, 0).blockId).toBe(BlockId.Air);

    streamToQuiescence(restored.world, 2000);

    // A column supplied by persistence is already generated. Re-running
    // generateColumn over it re-stamps terrain and refills the mined block.
    expect(restored.world.getBlockState(0, target, 0).blockId).toBe(BlockId.Air);
  });
});
