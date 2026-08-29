import * as THREE from 'three';
import { OVERWORLD_DIMENSION_TYPE } from '../data/DimensionTypes';
import type { BlockRegistry } from '../world/BlockRegistry';
import type { BlockStateRegistry } from '../world/BlockStateRegistry';
import { ChunkMesher } from '../world/ChunkMesher';
import type { ChunkColumn } from '../world/ChunkColumn';
import { TerrainGenerator } from '../world/TerrainGenerator';
import { World, type WorldEditDurability, type WorldMaterials, type WorldMonitorHandle } from '../world/World';
import { WorldLife } from '../world/WorldLife';
import { WorldBlockAccess } from '../simulation/WorldBlockAccess';
import type { UvRect } from '../world/MeshingTypes';

/**
 * The live Overworld construction boundary.
 *
 * Game owns lifecycle/resource registration and gameplay wiring; this factory
 * owns only the canonical world composition so the active dimension, generator,
 * world, and behavior-facing access adapter cannot drift apart. Nothing here is
 * a second world store or a lifecycle singleton.
 */
export interface WorldCompositionOptions {
  scene: THREE.Scene;
  registry: BlockRegistry;
  stateRegistry: BlockStateRegistry;
  atlas: { uv(tile: number): UvRect };
  mesher: ChunkMesher;
  materials: WorldMaterials;
  seed: number;
  renderDistance: number;
  simulationDistance: number;
  editDurability?: WorldEditDurability;
  monitor?: WorldMonitorHandle;
}

export interface WorldComposition {
  readonly dimension: typeof OVERWORLD_DIMENSION_TYPE;
  readonly generator: TerrainGenerator;
  readonly worldLife: WorldLife;
  readonly world: World;
  readonly worldBlockAccess: WorldBlockAccess;
}

export function createOverworldComposition(opts: WorldCompositionOptions): WorldComposition {
  const generator = new TerrainGenerator(opts.registry, opts.seed);
  const worldLife = new WorldLife(opts.scene, generator, opts.seed);
  const world = new World({
    registry: opts.registry,
    seed: opts.seed,
    scene: opts.scene,
    mesher: opts.mesher,
    generator,
    materials: opts.materials,
    renderDistance: opts.renderDistance,
    simulationDistance: opts.simulationDistance,
    dimension: OVERWORLD_DIMENSION_TYPE,
    stateRegistry: opts.stateRegistry,
    editDurability: opts.editDurability,
    monitor: opts.monitor,
    // Face index is WorkerMeshing's canonical encoding: 0=up, 1=down,
    // 2-5=sides. The sync mesher ignores this seam.
    uvRectFor: (blockId, faceIndex) => {
      const def = opts.registry.get(blockId);
      const tile =
        faceIndex === 0 ? def.topTile : faceIndex === 1 ? def.bottomTile : def.sideTile;
      return opts.atlas.uv(tile);
    },
  });
  return {
    dimension: OVERWORLD_DIMENSION_TYPE,
    generator,
    worldLife,
    world,
    worldBlockAccess: new WorldBlockAccess(world),
  };
}

/** Compile-time guard for consumers that should depend on the active dimension. */
export function worldCompositionBounds(composition: WorldComposition): {
  minY: number;
  maxY: number;
  minSectionY: number;
  sectionCount: number;
} {
  const { dimension } = composition;
  return {
    minY: dimension.minY,
    maxY: dimension.maxY,
    minSectionY: dimension.minSectionY,
    sectionCount: dimension.sectionCount,
  };
}

/** Keep the imported ChunkColumn type visible to boundary audits without runtime coupling. */
export type CanonicalColumn = ChunkColumn;
