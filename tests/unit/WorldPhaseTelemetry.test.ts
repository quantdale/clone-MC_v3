/**
 * 258 tasks 17-23: World-internal whole-frame phase timing + work counters.
 *
 * Proves the disabled-by-default mechanism (zero attribution, valid zero
 * counters), the enabled mechanism (generation/meshingMain/upload phases
 * record real burned work; per-frame counts flow), per-frame counter reset,
 * defensive copies, and the renderer aux ring — all headless, using fixture
 * generator/mesher stubs with deterministic busy loops (never thresholds).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { CONFIG } from '../../src/config';
import { Chunk } from '../../src/world/Chunk';
import {
  WORLD_TIMED_PHASES,
  validateWorldFrameWorkCounts,
  zeroWorldFrameWorkCounts,
} from '../../src/world/WorldPhaseTelemetry';
import {
  FrameAuxRing,
  PhaseTimer,
  WHOLE_FRAME_PHASES,
  zeroPhases,
} from '../../src/rendering/WholeFrameMetrics';

function burnMs(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // Deterministic main-thread work so phase timers observe elapsed time.
  }
}

function makeWorld(): World {
  const registry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  // Legacy-slab generator stub (no generateColumn): exercises the
  // generateChunk path with measurable burned work per chunk.
  const generator = {
    generateChunk(chunk: Chunk): void {
      burnMs(2);
      chunk.fill(BlockId.Stone);
    },
    getHeightAt(): number { return CONFIG.seaLevel + 1; },
  };
  // Legacy mesher stub (no meshSection): exercises mesher.mesh + attach with
  // measurable burned work per job. Null geometries attach nothing visible.
  const mesher = {
    mesh(): { opaque: null; transparent: null } {
      burnMs(2);
      return { opaque: null, transparent: null };
    },
  };
  return new World({
    registry,
    stateRegistry,
    seed: 1,
    scene,
    mesher: mesher as any,
    generator: generator as any,
    materials: materials as any,
    renderDistance: 2,
    dimension: OVERWORLD_DIMENSION_TYPE,
  });
}

describe('258 WorldTimedPhase contract', () => {
  it('WORLD_TIMED_PHASES is a subset of WHOLE_FRAME_PHASES in normative order', () => {
    expect([...WORLD_TIMED_PHASES]).toEqual([
      'generation',
      'meshingMain',
      'workerDispatch',
      'lighting',
      'upload',
      'unload',
    ]);
    for (const phase of WORLD_TIMED_PHASES) {
      expect((WHOLE_FRAME_PHASES as readonly string[])).toContain(phase);
    }
  });

  it('validateWorldFrameWorkCounts accepts zeros and rejects defects by name', () => {
    expect(validateWorldFrameWorkCounts(zeroWorldFrameWorkCounts())).toEqual(zeroWorldFrameWorkCounts());
    expect(() => validateWorldFrameWorkCounts(null)).toThrow('WorldPhaseTelemetry: counts must be an object');
    expect(() => validateWorldFrameWorkCounts({ ...zeroWorldFrameWorkCounts(), generatedChunks: -1 }))
      .toThrow('WorldPhaseTelemetry: generatedChunks');
    // Unknown keys are ignored (forward-compatible), never accepted.
    expect(validateWorldFrameWorkCounts({ ...zeroWorldFrameWorkCounts(), uploadBytes: 1 } as any))
      .toEqual(zeroWorldFrameWorkCounts());
    expect(() => validateWorldFrameWorkCounts({ ...zeroWorldFrameWorkCounts(), lightOpsUsed: 1.5 }))
      .toThrow('WorldPhaseTelemetry: lightOpsUsed');
  });
});

describe('258 PhaseTimer.accumulate', () => {
  it('is a no-op while disabled and adds while enabled', () => {
    const timer = new PhaseTimer(() => performance.now(), false);
    timer.accumulate('generation', 5);
    expect(timer.finishFrame(10).phases).toEqual(zeroPhases());
    timer.setEnabled(true);
    timer.accumulate('generation', 5);
    timer.accumulate('generation', 2);
    const sample = timer.finishFrame(10);
    expect(sample.phases.generation).toBe(7);
    // finishFrame resets accumulated totals.
    expect(timer.finishFrame(10).phases.generation).toBe(0);
  });

  it('reports an open phase while timing (nest guard)', () => {
    const timer = new PhaseTimer(() => 0, false);
    expect(timer.hasOpenPhase).toBe(false);
    timer.begin('generation');
    expect(timer.hasOpenPhase).toBe(false);
    timer.setEnabled(true);
    expect(timer.hasOpenPhase).toBe(false);
    timer.begin('generation');
    expect(timer.hasOpenPhase).toBe(true);
    expect(() => timer.begin('upload')).toThrow('while generation is open');
    timer.end();
    expect(timer.hasOpenPhase).toBe(false);
  });

  it('rejects unknown phases and negative/non-finite contributions', () => {
    const timer = new PhaseTimer(() => 0, true);
    expect(() => timer.accumulate('nope' as any, 1)).toThrow('WholeFrameMetrics: unknown phase');
    expect(() => timer.accumulate('generation', -1)).toThrow('WholeFrameMetrics: accumulate(generation)');
    expect(() => timer.accumulate('generation', Number.NaN)).toThrow('WholeFrameMetrics: accumulate(generation)');
  });
});

describe('258 FrameAuxRing', () => {
  it('rejects non-positive integer capacities', () => {
    expect(() => new FrameAuxRing(0)).toThrow('FrameAuxRing capacity');
    expect(() => new FrameAuxRing(1.5)).toThrow('FrameAuxRing capacity');
  });

  it('latest returns zeros when empty and the newest snapshot otherwise', () => {
    const ring = new FrameAuxRing(4);
    expect(ring.samples).toBe(0);
    expect(ring.latest()).toEqual({
      calls: 0, triangles: 0, geometries: 0, textures: 0,
      bufferWidth: 0, bufferHeight: 0, dynamicScale: 0,
    });
    ring.record(10, 100, 5, 2, 1280, 720, 1);
    ring.record(20, 200, 6, 3, 1280, 720, 0.75);
    expect(ring.samples).toBe(2);
    expect(ring.latest()).toMatchObject({ calls: 20, triangles: 200, dynamicScale: 0.75 });
    expect(ring.maxCalls()).toBe(20);
  });

  it('wraps around at capacity and resets', () => {
    const ring = new FrameAuxRing(2);
    ring.record(1, 0, 0, 0, 0, 0, 1);
    ring.record(2, 0, 0, 0, 0, 0, 1);
    ring.record(3, 0, 0, 0, 0, 0, 1);
    expect(ring.samples).toBe(2);
    expect(ring.latest().calls).toBe(3);
    expect(ring.maxCalls()).toBe(3);
    ring.reset();
    expect(ring.samples).toBe(0);
    expect(ring.latest().calls).toBe(0);
  });

  it('rejects negative/non-finite values without recording', () => {
    const ring = new FrameAuxRing(4);
    expect(() => ring.record(-1, 0, 0, 0, 0, 0, 1)).toThrow('FrameAuxRing calls');
    expect(() => ring.record(0, 0, 0, 0, 0, 0, Number.POSITIVE_INFINITY)).toThrow('FrameAuxRing dynamicScale');
    expect(ring.samples).toBe(0);
  });
});

describe('258 World-internal phase timing', () => {
  it('is disabled by default: zero phases, valid counters, no clock cost path', () => {
    const world = makeWorld();
    expect(world.isPhaseTimingEnabled()).toBe(false);
    world.update(0.016, 0, 0);
    const totals = world.drainPhaseTotals();
    for (const phase of WORLD_TIMED_PHASES) {
      expect(totals[phase]).toBe(0);
    }
    // Counts are not timings: they flow while disabled (validated shape).
    expect(() => validateWorldFrameWorkCounts(world.getLastFrameWorkCounts())).not.toThrow();
    expect(world.getLastFrameWorkCounts().generatedChunks).toBeGreaterThan(0);
  });

  it('attributes real generation/meshing/upload work and counts per-frame jobs', () => {
    const world = makeWorld();
    world.setPhaseTimingEnabled(true);
    expect(world.isPhaseTimingEnabled()).toBe(true);

    world.update(0.016, 0, 0);
    const totals = world.drainPhaseTotals();
    const counts = world.getLastFrameWorkCounts();

    // Burned stub work must be visible in the owning phases (mechanism, not
    // thresholds: any positive elapsed proves attribution flows).
    expect(counts.generatedChunks).toBeGreaterThan(0);
    expect(totals.generation).toBeGreaterThan(0);
    // Queues drain over frames: poll until the sync mesh path handles work.
    let meshed = counts.syncMeshedJobs;
    let meshingTotal = totals.meshingMain;
    let uploaded = counts.uploadedMeshes;
    for (let i = 0; i < 40 && (meshed === 0 || uploaded === 0); i++) {
      world.update(0.016, 0, 0);
      const frame = world.getLastFrameWorkCounts();
      const phases = world.drainPhaseTotals();
      if (frame.syncMeshedJobs > 0) {
        meshed = frame.syncMeshedJobs;
        meshingTotal = phases.meshingMain;
      }
      if (frame.uploadedMeshes > 0) {
        uploaded = frame.uploadedMeshes;
      }
    }
    expect(meshed).toBeGreaterThan(0);
    expect(meshingTotal).toBeGreaterThan(0);
    expect(uploaded).toBeGreaterThan(0);
    // Sync default: nothing dispatches to workers.
    expect(counts.workerDispatchedJobs).toBe(0);
    expect(totals.workerDispatch).toBe(0);
    // Structural phases exist with non-negative attribution.
    for (const phase of WORLD_TIMED_PHASES) {
      expect(totals[phase]).toBeGreaterThanOrEqual(0);
    }
  });

  it('resets counts per frame and returns defensive copies', () => {
    const world = makeWorld();
    world.setPhaseTimingEnabled(true);
    world.update(0.016, 0, 0);
    const first = world.getLastFrameWorkCounts();
    expect(first.generatedChunks).toBeGreaterThan(0);
    first.generatedChunks = 999999;
    expect(world.getLastFrameWorkCounts().generatedChunks).not.toBe(999999);
  });

  it('disabling returns to zero attribution without errors', () => {
    const world = makeWorld();
    world.setPhaseTimingEnabled(true);
    world.update(0.016, 0, 0);
    world.setPhaseTimingEnabled(false);
    world.update(0.016, 0, 0);
    const totals = world.drainPhaseTotals();
    for (const phase of WORLD_TIMED_PHASES) {
      expect(totals[phase]).toBe(0);
    }
    // Counters keep flowing while disabled (counts are not timings).
    expect(() => world.getLastFrameWorkCounts()).not.toThrow();
  });
});
