import * as THREE from 'three';
import { World } from '../../../src/world/World';
import { createDefaultBlockRegistry } from '../../../src/world/BlockRegistry';
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
  /** Wall-clock ms to run `frames` streaming updates. */
  totalMs: number;
  frames: number;
  /** Per-frame `World.update` cost distribution — the smoothness signal. */
  p50: number;
  p95: number;
  p99: number;
  worstMs: number;
  loadedChunks: number;
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

  frameTimes.sort((a, b) => a - b);
  const quantile = (q: number): number =>
    frameTimes[Math.min(frameTimes.length - 1, Math.floor(frameTimes.length * q))] ?? 0;

  let distinctColumns = 0;
  for (const _column of world.storage.columns()) {
    void _column;
    distinctColumns++;
  }

  return {
    totalMs,
    frames,
    p50: quantile(0.5),
    p95: quantile(0.95),
    p99: quantile(0.99),
    worstMs,
    loadedChunks: world.getStats().loadedChunks,
    generateColumnCalls,
    distinctColumns,
  };
}
