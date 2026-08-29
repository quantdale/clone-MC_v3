import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { OVERWORLD_DIMENSION_TYPE } from '../../../src/data/DimensionTypes';
import { BlockId, createDefaultBlockRegistry } from '../../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../../src/world/BlockStateRegistry';
import { TerrainGenerator } from '../../../src/world/TerrainGenerator';
import { World } from '../../../src/world/World';
import type { WorldStats } from '../../../src/world/MeshingTypes';

export const PERFORMANCE_BASELINE_SEED = 1337;
export const PERFORMANCE_BASELINE_RENDER_DISTANCE = 2;
export const PERFORMANCE_BASELINE_FRAMES = 240;

export type PerformanceScenarioName =
  | 'cold-spawn'
  | 'straight-flight'
  | 'spin-stress'
  | 'edit-storm'
  | 'lighting-storm'
  | 'forest'
  | 'water-coast'
  | 'long-traversal'
  | 'lod-horizon';

export interface PerformanceBaselineEnvironment {
  commit: string;
  browser: 'node-headless';
  node: string;
  platform: string;
  cpu: string;
  qualityTier: 'headless-cpu';
  renderDistance: number;
  dpr: null;
  renderBuffer: null;
  gpu: null;
}

export interface PerformanceBaselineResult {
  scenario: PerformanceScenarioName;
  status: 'measured' | 'unavailable';
  note: string;
  environment: PerformanceBaselineEnvironment;
  seed: number;
  frames: number;
  startupMs: number;
  totalMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  worstMs: number;
  heapBeforeBytes: number;
  heapAfterBytes: number;
  heapDeltaBytes: number;
  finalStats: WorldStats | null;
}

export interface PerformanceBaselineReport {
  capturedAt: string;
  measurementModel: 'headless-cpu-streaming-only';
  limitations: string[];
  environment: PerformanceBaselineEnvironment;
  results: PerformanceBaselineResult[];
}

type ScenarioAction = (world: World, frame: number) => void;

function currentCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function heapUsed(): number {
  return typeof process.memoryUsage === 'function' ? process.memoryUsage().heapUsed : 0;
}

function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}

function environment(renderDistance: number): PerformanceBaselineEnvironment {
  return {
    commit: currentCommit(),
    browser: 'node-headless',
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    qualityTier: 'headless-cpu',
    renderDistance,
    dpr: null,
    renderBuffer: null,
    gpu: null,
  };
}

function createWorld(seed: number, renderDistance: number): World {
  const registry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = new TerrainGenerator(registry, seed);
  const mesher = { mesh: () => ({ opaque: null, transparent: null }) };
  return new World({
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
}

function runMeasuredScenario(
  scenario: Exclude<PerformanceScenarioName, 'lod-horizon'>,
  seed: number,
  renderDistance: number,
  frames: number,
  note: string,
  center: (frame: number) => readonly [number, number],
  action: ScenarioAction = () => undefined,
): PerformanceBaselineResult {
  const env = environment(renderDistance);
  const before = heapUsed();
  const constructionStart = performance.now();
  const world = createWorld(seed, renderDistance);
  const frameTimes: number[] = [];
  const start = performance.now();
  for (let frame = 0; frame < frames; frame++) {
    action(world, frame);
    const [cx, cz] = center(frame);
    const frameStart = performance.now();
    world.update(0.016, cx, cz);
    frameTimes.push(performance.now() - frameStart);
  }
  const totalMs = performance.now() - start;
  const startupMs = performance.now() - constructionStart;
  const after = heapUsed();
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const finalStats = world.getStats();
  world.dispose();
  return {
    scenario,
    status: 'measured',
    note,
    environment: env,
    seed,
    frames,
    startupMs,
    totalMs,
    p50Ms: quantile(sorted, 0.5),
    p95Ms: quantile(sorted, 0.95),
    p99Ms: quantile(sorted, 0.99),
    worstMs: sorted[sorted.length - 1] ?? 0,
    heapBeforeBytes: before,
    heapAfterBytes: after,
    heapDeltaBytes: after - before,
    finalStats,
  };
}

function unavailableLodResult(seed: number, renderDistance: number): PerformanceBaselineResult {
  return {
    scenario: 'lod-horizon',
    status: 'unavailable',
    note: 'No Change-255 LOD implementation exists yet; GPU horizon and LOD transition metrics are intentionally not fabricated.',
    environment: environment(renderDistance),
    seed,
    frames: 0,
    startupMs: 0,
    totalMs: 0,
    p50Ms: 0,
    p95Ms: 0,
    p99Ms: 0,
    worstMs: 0,
    heapBeforeBytes: 0,
    heapAfterBytes: 0,
    heapDeltaBytes: 0,
    finalStats: null,
  };
}

function editStorm(world: World, frame: number): void {
  if (frame < 60) return;
  for (let i = 0; i < 20; i++) {
    const x = 4 + ((frame * 20 + i) & 15);
    const z = 4 + (((frame * 7) + i * 3) & 15);
    const y = -64 + ((frame + i) % 384);
    world.setBlock(x, y, z, i & 1 ? BlockId.Glass : BlockId.Stone);
  }
}

function lightingStorm(world: World, frame: number): void {
  if (frame < 60) return;
  for (let i = 0; i < 8; i++) {
    const x = 6 + ((frame + i) & 7);
    const z = 6 + ((frame * 3 + i) & 7);
    const y = 48 + ((frame + i) & 15);
    world.setBlock(x, y, z, (frame + i) & 1 ? BlockId.Lava : BlockId.Air);
  }
}

export function runPerformanceBaseline(options: {
  seed?: number;
  renderDistance?: number;
  frames?: number;
} = {}): PerformanceBaselineReport {
  const seed = options.seed ?? PERFORMANCE_BASELINE_SEED;
  const renderDistance = options.renderDistance ?? PERFORMANCE_BASELINE_RENDER_DISTANCE;
  const frames = options.frames ?? PERFORMANCE_BASELINE_FRAMES;
  const results: PerformanceBaselineResult[] = [
    runMeasuredScenario('cold-spawn', seed, renderDistance, frames, 'Headless generation and streaming from a fresh World.', () => [0, 0]),
    runMeasuredScenario('straight-flight', seed, renderDistance, frames, 'Deterministic forward chunk-center movement; CPU streaming only.', (frame) => [Math.floor(frame / 12), 0]),
    runMeasuredScenario('spin-stress', seed, renderDistance, frames, 'Stationary streaming control for camera-spin workload; renderer/GPU rotation is unavailable in this harness.', () => [0, 0]),
    runMeasuredScenario('edit-storm', seed, renderDistance, frames, 'Twenty deterministic block edits per frame after a warm-up, including the full Overworld height range.', () => [0, 0], editStorm),
    runMeasuredScenario('lighting-storm', seed, renderDistance, frames, 'Eight deterministic emissive/air edits per frame after a warm-up; measures CPU light invalidation.', () => [0, 0], lightingStorm),
    runMeasuredScenario('forest', 42, renderDistance, frames, 'Seeded terrain streaming control; cutout/GPU overdraw is unavailable with the reference mesher stub.', () => [0, 0]),
    runMeasuredScenario('water-coast', 1234, renderDistance, frames, 'Seeded terrain streaming control; translucent/fluid GPU cost is unavailable with the reference mesher stub.', () => [0, 0]),
    runMeasuredScenario('long-traversal', seed, 1, frames * 4, 'Repeated outward/return traversal across deterministic chunk centers; resource convergence is sampled in finalStats.', (frame) => {
      const phase = Math.floor(frame / 120) % 4;
      const distance = phase === 0 ? 0 : phase === 1 ? 8 : phase === 2 ? -8 : 0;
      return [distance, phase === 2 ? 8 : phase === 3 ? -8 : 0];
    }),
    unavailableLodResult(seed, renderDistance),
  ];
  return {
    capturedAt: new Date().toISOString(),
    measurementModel: 'headless-cpu-streaming-only',
    limitations: [
      'No browser, WebGL renderer, GPU, camera, DPR, drawing-buffer, shader, or actual frame-pacing measurements are available.',
      'The reference mesher is stubbed so forest/water results measure streaming CPU only, not cutout/translucent/fluid geometry or upload cost.',
      'LOD horizon is unavailable until the Change-255 LOD implementation exists.',
    ],
    environment: environment(renderDistance),
    results,
  };
}

export function assertPerformanceBaseline(report: PerformanceBaselineReport): void {
  if (report.results.length !== 9) throw new Error(`expected 9 scenarios, got ${report.results.length}`);
  for (const result of report.results) {
    if (result.status === 'unavailable') continue;
    for (const metric of [result.startupMs, result.totalMs, result.p50Ms, result.p95Ms, result.p99Ms, result.worstMs]) {
      if (!Number.isFinite(metric) || metric < 0) throw new Error(`${result.scenario} has invalid timing metric ${metric}`);
    }
    if (!result.finalStats) throw new Error(`${result.scenario} is missing final World stats`);
    if (result.finalStats.pendingGeneration < 0 || result.finalStats.pendingMesh < 0) {
      throw new Error(`${result.scenario} has invalid pending queue depth`);
    }
  }
}

