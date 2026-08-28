import { describe, it } from 'vitest';
import { runStreamingProfile } from '../../tests/bench/support/streamingProfile';

describe('measure', () => {
  it('median of 3', { timeout: 900000 }, () => {
    const runs = [runStreamingProfile(), runStreamingProfile(), runStreamingProfile()];
    const med = (key: 'startupMs' | 'heapDeltaBytes' | 'totalMs' | 'p99' | 'worstMs' | 'p95'): number => {
      const v = runs.map((r) => r[key]).sort((a, b) => a - b);
      return +v[1]!.toFixed(1);
    };
    console.log('RESULT ' + JSON.stringify({
      medianStartupMs: med('startupMs'),
      medianHeapDeltaBytes: med('heapDeltaBytes'),
      medianTotalMs: med('totalMs'),
      totals: runs.map((r) => +r.totalMs.toFixed(0)),
      medianP95: med('p95'), medianP99: med('p99'), medianWorst: med('worstMs'),
      generateColumnCalls: runs[0]!.generateColumnCalls,
      distinctColumns: runs[0]!.distinctColumns,
      loadedChunks: runs[0]!.loadedChunks,
      residentColumns: runs[0]!.residentColumns,
      allocatedSections: runs[0]!.allocatedSections,
      geometries: runs[0]!.geometries,
      pendingGeneration: runs[0]!.pendingGeneration,
      pendingMesh: runs[0]!.pendingMesh,
      pendingLight: runs[0]!.pendingLight,
      pendingSave: runs[0]!.pendingSave,
      dirtyColumns: runs[0]!.dirtyColumns,
      dirtySections: runs[0]!.dirtySections,
    }));
  });
});
