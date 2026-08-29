import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { emptyMeshBuildResult, type ChunkMeshResult } from '../../src/world/MeshingTypes';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry, type BlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { World } from '../../src/world/World';

function emptyResult(inputVersion = 0): ChunkMeshResult {
  return {
    opaque: null,
    transparent: null,
    cutout: null,
    translucent: null,
    fluid: null,
    streams: emptyMeshBuildResult(inputVersion),
  };
}

function makeWorld(meshedSections: number[]): World {
  const registry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  const generator = {
    generateColumn(column: ChunkColumn, states: BlockStateRegistry): void {
      const stone = states.getDefaultState(BlockId.Stone);
      // Materialize one canonical cell in every Overworld section so the test
      // can distinguish a localized edit remesh from a full-column rebuild.
      for (let sy = 0; sy < column.sectionCount; sy++) {
        column.setBlockState(8, column.minY + sy * 16 + 8, 8, stone);
      }
    },
    getHeightAt(): number {
      return 0;
    },
  };
  const mesher = {
    mesh: (_chunk: unknown, _neighbors: unknown, options?: { inputVersion?: number }) =>
      emptyResult(options?.inputVersion),
    meshSection: (
      _sectionX: number,
      sectionY: number,
      _sectionZ: number,
      _section: unknown,
      _getBlockState: unknown,
      options?: { inputVersion?: number },
    ) => {
      meshedSections.push(sectionY);
      return emptyResult(options?.inputVersion);
    },
  };
  return new World({
    registry,
    stateRegistry,
    seed: 1337,
    scene: new THREE.Scene(),
    mesher: mesher as never,
    generator: generator as never,
    materials: {
      opaque: new THREE.MeshLambertMaterial(),
      transparent: new THREE.MeshLambertMaterial(),
    },
    renderDistance: 0,
    dimension: OVERWORLD_DIMENSION_TYPE,
  });
}

function settle(world: World, maxFrames = 900): void {
  for (let frame = 0; frame < maxFrames; frame++) {
    world.update(1 / 60, 0, 0);
    const stats = world.getStats();
    if (stats.pendingGeneration === 0 && stats.pendingMesh === 0 && stats.pendingLight === 0) return;
  }
  throw new Error(`world did not settle: ${JSON.stringify(world.getStats())}`);
}

describe('dense canonical edit locality', () => {
  it('remeshes only touched sections and vertical face dependencies while light drains', () => {
    const meshedSections: number[] = [];
    const world = makeWorld(meshedSections);
    try {
      settle(world);
      meshedSections.length = 0;
      world.storage.clearDirty();

      const edits = [-56, -40, -24, -1, 0, 15, 16, 31, 32, 56].map((y) => ({ x: 8, y, z: 8 }));
      const expectedSections = new Set<number>();
      for (const edit of edits) {
        const sectionY = Math.floor(edit.y / 16);
        expectedSections.add(sectionY);
        if (edit.y % 16 === 0) expectedSections.add(sectionY - 1);
        if (edit.y % 16 === 15) expectedSections.add(sectionY + 1);
        world.setBlock(edit.x, edit.y, edit.z, BlockId.Lava);
      }

      const afterEdits = world.getStats();
      expect(afterEdits.pendingLight).toBeGreaterThan(0);
      expect(afterEdits.dirtyColumns).toBe(1);
      expect(afterEdits.dirtySections).toBeGreaterThan(0);

      settle(world);
      const remeshed = new Set(meshedSections);
      expect(remeshed).toEqual(expectedSections);
      expect(remeshed.size).toBeLessThan(OVERWORLD_DIMENSION_TYPE.sectionCount);
      expect(world.getStats().pendingLight).toBe(0);
      expect(world.getStats().pendingMesh).toBe(0);
    } finally {
      world.dispose();
    }
  }, 120_000);
});
