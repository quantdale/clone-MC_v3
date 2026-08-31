/**
 * Baseline-aware world truth tests (257): canonical vs predicted surface lookups
 * and readiness for current vs legacy-unknown/unsupported baselines. The
 * legacy-baseline assertions are the characterization oracle for the reported
 * void/free-fall defect — under the pre-fix code, absent canonical columns were
 * answered from the current generator even when generation was forbidden.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { World } from "../../src/world/World";
import { Chunk } from "../../src/world/Chunk";
import { createDefaultBlockRegistry, BlockId } from "../../src/world/BlockRegistry";
import { createDefaultBlockStateRegistry } from "../../src/world/BlockStateRegistry";
import { ChunkColumn } from "../../src/world/ChunkColumn";
import { OVERWORLD_DIMENSION_TYPE } from "../../src/data/DimensionTypes";
import { CONFIG } from "../../src/config";

const REGISTRY = createDefaultBlockRegistry();
const STATE_REGISTRY = createDefaultBlockStateRegistry();

function makeWorld(): World {
  const generator = {
    generateChunk(chunk: Chunk): void {
      chunk.fill(BlockId.Stone);
    },
    getHeightAt(): number {
      return CONFIG.seaLevel + 1; // 32 — deterministic "predicted" surface
    },
  };
  const mesher = {
    mesh(): { opaque: null; transparent: null } {
      return { opaque: null, transparent: null };
    },
  };
  return new World({
    registry: REGISTRY,
    seed: 257,
    scene: new THREE.Scene(),
    mesher,
    generator,
    materials: {
      opaque: new THREE.MeshLambertMaterial(),
      transparent: new THREE.MeshLambertMaterial(),
    },
    renderDistance: 2,
  } as never);
}

/** A serialized canonical column with stone at `surfaceY` in the middle of chunk (cx,cz). */
function stoneColumn(cx: number, cz: number, surfaceY: number) {
  const column = new ChunkColumn({
    chunkX: cx,
    chunkZ: cz,
    sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
    minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
    registry: STATE_REGISTRY,
  });
  column.setBlockState(8, surfaceY, 8, STATE_REGISTRY.getDefaultState(BlockId.Stone));
  return column.serialize();
}

function importOne(world: World, cx: number, cz: number, surfaceY: number): void {
  world.importColumns({
    version: 1,
    minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
    sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
    columns: [stoneColumn(cx, cz, surfaceY)],
  });
}

describe("baseline-aware motion-blocking surface (257)", () => {
  it("current baseline: absent column uses the deterministic generator prediction", () => {
    const world = makeWorld();
    expect(world.getGenerationBaseline()).toBe("current");
    expect(world.getMotionBlockingHeight(40, -40)).toBe(CONFIG.seaLevel + 1);
    world.dispose();
  });

  it("current baseline: persisted column uses its canonical heightmap", () => {
    const world = makeWorld();
    importOne(world, 2, -3, 100);
    expect(world.getMotionBlockingHeight(2 * 16 + 8, -3 * 16 + 8)).toBe(100);
    world.dispose();
  });

  it("legacy-unknown baseline: absent column NEVER answers from the current generator", () => {
    const world = makeWorld();
    world.setGenerationBaseline("legacy-unknown");
    // Pre-fix oracle: this returned the generator's predicted surface (32) and
    // spawn/readiness treated it as real terrain — the reported free-fall defect.
    expect(world.getMotionBlockingHeight(40, -40)).toBe(
      OVERWORLD_DIMENSION_TYPE.minY - 1,
    );
    world.dispose();
  });

  it("unsupported baseline: absent column NEVER answers from the current generator", () => {
    const world = makeWorld();
    world.setGenerationBaseline("unsupported");
    expect(world.getMotionBlockingHeight(-33, 70)).toBe(OVERWORLD_DIMENSION_TYPE.minY - 1);
    world.dispose();
  });

  it("legacy-unknown baseline: persisted columns use their canonical heights", () => {
    const world = makeWorld();
    world.setGenerationBaseline("legacy-unknown");
    importOne(world, 0, 0, 45);
    expect(world.getMotionBlockingHeight(8, 8)).toBe(45);
    // Persisted positive and negative coordinates resolve to their own columns.
    importOne(world, -5, -5, 12);
    expect(world.getMotionBlockingHeight(-5 * 16 + 8, -5 * 16 + 8)).toBe(12);
    world.dispose();
  });

  it("canonical lookup returns null for absent columns and reads persisted tops", () => {
    const world = makeWorld();
    expect(world.getCanonicalMotionBlockingHeight(0, 0)).toBeNull();
    importOne(world, 0, 0, OVERWORLD_DIMENSION_TYPE.maxY - 1);
    expect(world.getCanonicalMotionBlockingHeight(8, 8)).toBe(OVERWORLD_DIMENSION_TYPE.maxY - 1);
    world.dispose();
  });

  it("an imported empty column has no provable surface (minY - 1)", () => {
    const world = makeWorld();
    world.setGenerationBaseline("legacy-unknown");
    const airColumn = new ChunkColumn({
      chunkX: 2,
      chunkZ: 2,
      sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
      minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
      registry: STATE_REGISTRY,
    });
    world.importColumns({
      version: 1,
      minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
      sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
      columns: [airColumn.serialize()],
    });
    expect(world.getCanonicalMotionBlockingHeight(2 * 16 + 8, 2 * 16 + 8)).toBe(
      OVERWORLD_DIMENSION_TYPE.minY - 1,
    );
    world.dispose();
  });
});

describe("baseline-aware readiness (257)", () => {
  it("legacy-unknown world without canonical coverage never becomes ready", () => {
    const world = makeWorld();
    world.setGenerationBaseline("legacy-unknown");
    // Drive streaming long enough that a predicted-surface world would be ready.
    for (let frame = 0; frame < 240; frame++) {
      world.update(1 / 60, 0, 0);
    }
    // Missing required canonical coverage must never read as a playable void.
    expect(world.getReadyProgress(0, 0)).toBe(0);
    expect(world.isReady(0, 0)).toBe(false);
    world.dispose();
  });

  it("current baseline readiness remains deterministic on the prediction path", () => {
    const world = makeWorld();
    let progress = 0;
    for (let frame = 0; frame < 240 && progress < 1; frame++) {
      world.update(1 / 60, 0, 0);
      progress = world.getReadyProgress(0, 0);
    }
    expect(progress).toBe(1);
    world.dispose();
  });
});

