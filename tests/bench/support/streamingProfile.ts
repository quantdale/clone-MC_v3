import * as THREE from 'three';
import { World } from '../../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../../src/world/BlockStateRegistry';
import { TerrainGenerator } from '../../../src/world/TerrainGenerator';
import { OVERWORLD_DIMENSION_TYPE } from '../../../src/data/DimensionTypes';

/**
 * Shared spawn-streaming profiling scenario (Change 253 Phase 8).
 *
 * Measures **generation + streaming CPU only**: the mesher is stubbed and there is
 * no renderer or GPU, so these numbers are deliberately NOT comparable to browser
 * boot time (which additionally pays meshing, light upload and GPU work). Treat
 * them as a same-machine regression signal for the world-streaming main thread.
 */
export interface StreamingProfileResult {
  /** Wall-clock ms to construct the world and run the first streaming update. */
  startupMs: number;
  /** Process heap at profile entry, when Node exposes it. */
  heapUsedBeforeBytes: number;
  /** Process heap after the settled streaming pass, when Node exposes it. */
  heapUsedAfterBytes: number;
  /** Difference between the two process-heap samples. */
  heapDeltaBytes: number;
  /** Wall-clock ms to run `frames` streaming updates. */
  totalMs: number;
  frames: number;
  /** Per-frame `World.update` cost distribution — the smoothness signal. */
  p50: number;
  p95: number;
  p99: number;
  worstMs: number;
  loadedChunks: number;
  residentColumns: number;
  allocatedSections: number;
  dirtyColumns: number;
  dirtySections: number;
  geometries: number;
  pendingGeneration: number;
  pendingMesh: number;
  pendingLight: number;
  pendingSave: number;
  /** Times `TerrainGenerator.generateColumn` ran vs. distinct columns that exist. */
  generateColumnCalls: number;
  distinctColumns: number;
}

export interface StreamingProfileOptions {
  renderDistance?: number;
  frames?: number;
  seed?: number;
}

/** Run one spawn-streaming pass and return its timing/work profile. */
export function runStreamingProfile(options: StreamingProfileOptions = {}): StreamingProfileResult {
  const renderDistance = options.renderDistance ?? 6;
  const frames = options.frames ?? 4000;
  const seed = options.seed ?? 1337;
  const heapUsedBeforeBytes =
    typeof process !== 'undefined' && typeof process.memoryUsage === 'function'
      ? process.memoryUsage().heapUsed
      : 0;
  const startupStart = performance.now();

  const registry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = new TerrainGenerator(registry, seed);

  let generateColumnCalls = 0;
  const originalGenerateColumn = generator.generateColumn.bind(generator);
  generator.generateColumn = ((column, reg) => {
    generateColumnCalls++;
    originalGenerateColumn(column, reg);
  }) as typeof generator.generateColumn;

  const mesher = { mesh: () => ({ opaque: null, transparent: null }) };
  const world = new World({
    registry,
    seed,
    scene,
    mesher: mesher as never,
    generator,
    materials,
    renderDistance,
    dimension: OVERWORLD_DIMENSION_TYPE,
    stateRegistry,
  });

  const frameTimes: number[] = [];
  let worstMs = 0;
  const start = performance.now();
  for (let i = 0; i < frames; i++) {
    const frameStart = performance.now();
    world.update(0.016, 0, 0);
    const elapsed = performance.now() - frameStart;
    frameTimes.push(elapsed);
    if (elapsed > worstMs) worstMs = elapsed;
  }
  const totalMs = performance.now() - start;
  const heapUsedAfterBytes =
    typeof process !== 'undefined' && typeof process.memoryUsage === 'function'
      ? process.memoryUsage().heapUsed
      : 0;

  frameTimes.sort((a, b) => a - b);
  const quantile = (q: number): number =>
    frameTimes[Math.min(frameTimes.length - 1, Math.floor(frameTimes.length * q))] ?? 0;

  let distinctColumns = 0;
  for (const _column of world.storage.columns()) {
    void _column;
    distinctColumns++;
  }
  const stats = world.getStats();
  return {
    startupMs: performance.now() - startupStart,
    heapUsedBeforeBytes,
    heapUsedAfterBytes,
    heapDeltaBytes: heapUsedAfterBytes - heapUsedBeforeBytes,
    totalMs,
    frames,
    p50: quantile(0.5),
    p95: quantile(0.95),
    p99: quantile(0.99),
    worstMs,
    loadedChunks: stats.loadedChunks,
    residentColumns: stats.residentColumns,
    allocatedSections: stats.allocatedSections,
    dirtyColumns: stats.dirtyColumns,
    dirtySections: stats.dirtySections,
    geometries: stats.geometries,
    pendingGeneration: stats.pendingGeneration,
    pendingMesh: stats.pendingMesh,
    pendingLight: stats.pendingLight,
    pendingSave: stats.pendingSave,
    generateColumnCalls,
    distinctColumns,
  };
}

export interface ResourceChurnResult {
  /** Maximum horizontal columns resident during distant-center cycling. */
  peakResidentColumns: number;
  /** Maximum legacy slab projections resident during distant-center cycling. */
  peakLoadedChunks: number;
  /** Final canonical section allocation after returning to the origin. */
  finalAllocatedSections: number;
  /** Dirty ownership after sparse edits across the active vertical range. */
  editedDirtyColumns: number;
  editedDirtySections: number;
  /** Pending light work after the edit drain. */
  pendingLight: number;
}

/**
 * Deterministic resource-ownership probe for exploration/teleport churn and
 * dense vertical edits. It intentionally uses a stub mesher so geometry counts
 * are isolated from GPU availability; residency, canonical allocation, dirty
 * sections and light queues are still production World paths.
 */
export function runResourceChurnProfile(): ResourceChurnResult {
  const registry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const world = new World({
    registry,
    seed: 1337,
    scene,
    mesher: { mesh: () => ({ opaque: null, transparent: null }) } as never,
    generator: new TerrainGenerator(registry, 1337),
    materials,
    renderDistance: 1,
    dimension: OVERWORLD_DIMENSION_TYPE,
    stateRegistry,
  });

  let peakResidentColumns = 0;
  let peakLoadedChunks = 0;
  const centers: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [20, 20],
    [-20, 20],
    [20, -20],
    [0, 0],
  ];
  for (const [cx, cz] of centers) {
    for (let frame = 0; frame < 300; frame++) {
      world.update(0.016, cx, cz);
      const stats = world.getStats();
      peakResidentColumns = Math.max(peakResidentColumns, stats.residentColumns);
      peakLoadedChunks = Math.max(peakLoadedChunks, stats.loadedChunks);
    }
  }

  world.storage.clearDirty();
  const editY = [-64, -1, 0, 15, 16, 63, 64, 319] as const;
  for (const [index, y] of editY.entries()) {
    world.setBlock(8 + (index & 1), y, 8, index & 1 ? BlockId.Glass : BlockId.Sand);
  }
  for (let frame = 0; frame < 120; frame++) world.update(0.016, 0, 0);
  const stats = world.getStats();
  return {
    peakResidentColumns,
    peakLoadedChunks,
    finalAllocatedSections: stats.allocatedSections,
    editedDirtyColumns: stats.dirtyColumns,
    editedDirtySections: stats.dirtySections,
    pendingLight: stats.pendingLight,
  };
}
