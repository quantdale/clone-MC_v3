import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { DimensionType } from '../../src/data/DimensionType';
import { createResourceId } from '../../src/data/ResourceId';
import { CONFIG } from '../../src/config';
import { CHUNK_PIPELINE_QUEUE_CAPS } from '../../src/world/ChunkPipeline';

/**
 * Streaming behavior under a saturated work pipeline.
 *
 * The playable Overworld streams six 64-block chunk layers across a render
 * distance of six — 1014 chunks against generate/mesh queues capped at 64/96.
 * Saturation is therefore the normal boot condition, not an edge case, and both
 * regressions covered here only reproduce once the queues are actually full.
 */

/** Six-layer dimension matching the live Overworld's vertical extent. */
const sixLayer = new DimensionType({
  id: createResourceId('minecraft', 'streaming_saturation_test'),
  minY: -64,
  height: 384,
  logicalHeight: 384,
  hasSkylight: true,
});

const elevatedSurface = new DimensionType({
  id: createResourceId('minecraft', 'elevated_surface'),
  minY: 128,
  height: 128,
  logicalHeight: 128,
  hasSkylight: true,
});

function makeWorld(renderDistance: number, dimension: DimensionType = sixLayer, surfaceY = CONFIG.seaLevel + 1): World {
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
      return surfaceY;
    },
  };
  const mesher = {
    mesh(): { opaque: null; transparent: null } {
      return { opaque: null, transparent: null };
    },
  };
  return new World({
    registry,
    seed: 1337,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials,
    renderDistance,
    dimension,
  });
}

/** Chebyshev ring radii of every loaded column, and whether each ring is whole. */
function loadedColumnRings(world: World): { radii: Set<number>; columns: Set<string> } {
  const columns = new Set<string>();
  const radii = new Set<number>();
  world.forEachLoadedChunk((cx, _cy, cz) => {
    columns.add(`${cx},${cz}`);
    radii.add(Math.max(Math.abs(cx), Math.abs(cz)));
  });
  return { radii, columns };
}

describe('World streaming under queue saturation', () => {
  it('terminates a frame whose mesh queue is saturated', () => {
    // Regression: `processMeshing` drained the parked-mesh retry queue with
    // `while (retryMeshQueue.length > 0)`, but a job that still cannot be
    // admitted re-parks itself at the tail — so once the bounded mesh queue
    // filled, the loop spun forever and froze the browser on the loading
    // screen. Draining is now bounded by the parked count on entry.
    const world = makeWorld(6);
    world.preloadChunks(0, 0, CONFIG.preloadRadius);
    let peakPendingMesh = 0;
    for (let frame = 0; frame < 400; frame++) {
      world.update(1 / 60, 0, 0);
      peakPendingMesh = Math.max(peakPendingMesh, world.getStats().pendingMesh);
    }
    // The run must actually have saturated the mesh queue, or it never reached
    // the parked-retry path this test exists to pin down.
    expect(peakPendingMesh).toBeGreaterThanOrEqual(CHUNK_PIPELINE_QUEUE_CAPS.mesh);
    // Reaching here at all is the rest of the assertion (a hang fails by test
    // timeout); progress must be made rather than the pipeline deadlocking.
    expect(world.getStats().loadedChunks).toBeGreaterThan(0);
    expect(world.getReadyProgress(0, 0)).toBeGreaterThan(0);
    world.dispose();
  }, 30_000);

  it('fills the bounded generate queue nearest-first, not from the far edge', () => {
    // Regression: `ensureChunks` scanned `dx = -rd..rd` in raster order and
    // aborted at the generate-queue cap, so the queue filled with the far
    // corner of the render distance while the spawn ring stayed ungenerated —
    // `getReadyProgress` parked below 1 and held the loading screen up.
    const world = makeWorld(6);
    world.update(1 / 60, 0, 0);

    const { radii, columns } = loadedColumnRings(world);
    // The player's own column must be resident after the very first scan.
    expect(columns.has('0,0')).toBe(true);
    // Ring-contiguity: nothing at radius r is loaded unless every column at a
    // smaller radius is too. A far-edge-first scan violates this immediately.
    const maxRadius = Math.max(...radii);
    for (let r = 0; r < maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          expect(columns.has(`${dx},${dz}`)).toBe(true);
        }
      }
    }
    world.dispose();
  });

  it('keeps queues bounded and progresses through rapid teleport/edit/unload churn', () => {
    const world = makeWorld(2);
    const centers: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [24, -24],
      [-24, 24],
      [-24, -24],
      [0, 0],
    ];
    const editY = [-64, -1, 0, 15, 16, 63, 64, 319] as const;
    let peakResidentColumns = 0;
    let peakPendingGeneration = 0;
    let peakPendingMesh = 0;

    for (const [cx, cz] of centers) {
      for (let frame = 0; frame < 36; frame++) {
        world.update(1 / 60, cx, cz);
        if (frame === 12) {
          for (const [index, y] of editY.entries()) {
            world.setBlock(cx * 16 + 8 + (index & 1), y, cz * 16 + 8, BlockId.Glass);
          }
        }
        const stats = world.getStats();
        peakResidentColumns = Math.max(peakResidentColumns, stats.residentColumns);
        peakPendingGeneration = Math.max(peakPendingGeneration, stats.pendingGeneration);
        peakPendingMesh = Math.max(peakPendingMesh, stats.pendingMesh);
        expect(stats.pendingGeneration).toBeLessThanOrEqual(CHUNK_PIPELINE_QUEUE_CAPS.generate);
        expect(stats.pendingMesh).toBeLessThanOrEqual(
          CHUNK_PIPELINE_QUEUE_CAPS.mesh + CHUNK_PIPELINE_QUEUE_CAPS.upload + stats.loadedChunks,
        );
        expect(stats.pendingUnload).toBeLessThanOrEqual(stats.loadedChunks);
      }
    }

    for (let frame = 0; frame < 240; frame++) {
      world.update(1 / 60, 0, 0);
      const stats = world.getStats();
      expect(stats.pendingGeneration).toBeLessThanOrEqual(CHUNK_PIPELINE_QUEUE_CAPS.generate);
      expect(stats.pendingMesh).toBeLessThanOrEqual(
        CHUNK_PIPELINE_QUEUE_CAPS.mesh + CHUNK_PIPELINE_QUEUE_CAPS.upload + stats.loadedChunks,
      );
      if (stats.pendingGeneration === 0 && stats.pendingMesh === 0 && stats.pendingUnload === 0) break;
    }

    expect(peakResidentColumns).toBeLessThanOrEqual(49);
    expect(peakPendingGeneration).toBeLessThanOrEqual(CHUNK_PIPELINE_QUEUE_CAPS.generate);
    expect(peakPendingMesh).toBeLessThanOrEqual(
      CHUNK_PIPELINE_QUEUE_CAPS.mesh + CHUNK_PIPELINE_QUEUE_CAPS.upload + peakResidentColumns * 6,
    );
    const settled = world.getStats();
    expect(settled.pendingGeneration).toBe(0);
    expect(settled.pendingMesh).toBe(0);
    expect(settled.pendingUnload).toBe(0);
    world.dispose();
  }, 30_000);
  it('checks readiness in the dimension-derived surface slab', () => {
    const world = makeWorld(0, elevatedSurface, 129);
    world.preloadChunks(0, 0, 0);

    let ready = 0;
    for (let frame = 0; frame < 200 && ready < 1; frame++) {
      world.update(1 / 60, 0, 0);
      ready = world.getReadyProgress(0, 0);
    }

    expect(ready).toBe(1);
    world.dispose();
  });

  it('reaches full spawn readiness without stalling on far rings', () => {
    const world = makeWorld(6);
    world.preloadChunks(0, 0, CONFIG.preloadRadius);
    let previous = 0;
    let ready = 0;
    for (let frame = 0; frame < 400 && ready < 1; frame++) {
      world.update(1 / 60, 0, 0);
      ready = world.getReadyProgress(0, 0);
      // Readiness is monotonic: a chunk that has generated never un-generates.
      expect(ready).toBeGreaterThanOrEqual(previous);
      previous = ready;
    }
    expect(ready).toBe(1);
    world.dispose();
  }, 30_000);
});
