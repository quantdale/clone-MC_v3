import { describe, expect, it } from 'vitest';
import {
  assertPerformanceBaseline,
  runPerformanceBaseline,
} from '../bench/support/performanceBaseline';

describe('255 performance baseline characterization', () => {
  it('records the nine required scenes without fabricating unavailable GPU/LOD evidence', () => {
    const report = runPerformanceBaseline();
    assertPerformanceBaseline(report);
    console.log(`[255 performance baseline] ${JSON.stringify({
      commit: report.environment.commit,
      node: report.environment.node,
      platform: report.environment.platform,
      cpu: report.environment.cpu,
      frames: report.results.map((result) => ({
        scenario: result.scenario,
        status: result.status,
        startupMs: Number(result.startupMs.toFixed(3)),
        p50Ms: Number(result.p50Ms.toFixed(3)),
        p95Ms: Number(result.p95Ms.toFixed(3)),
        p99Ms: Number(result.p99Ms.toFixed(3)),
        worstMs: Number(result.worstMs.toFixed(3)),
        heapDeltaBytes: result.heapDeltaBytes,
        finalStats: result.finalStats && {
          residentColumns: result.finalStats.residentColumns,
          loadedChunks: result.finalStats.loadedChunks,
          allocatedSections: result.finalStats.allocatedSections,
          pendingGeneration: result.finalStats.pendingGeneration,
          pendingMesh: result.finalStats.pendingMesh,
          pendingLight: result.finalStats.pendingLight,
        },
      })),
    })}`);

    expect(report.measurementModel).toBe('headless-cpu-streaming-only');
    expect(report.results.map((result) => result.scenario)).toEqual([
      'cold-spawn',
      'straight-flight',
      'spin-stress',
      'edit-storm',
      'lighting-storm',
      'forest',
      'water-coast',
      'long-traversal',
      'lod-horizon',
    ]);
    expect(report.results.filter((result) => result.status === 'measured')).toHaveLength(8);
    expect(report.results.find((result) => result.scenario === 'lod-horizon')?.status).toBe('unavailable');
    expect(report.limitations).toHaveLength(3);
  }, 120_000);
});
