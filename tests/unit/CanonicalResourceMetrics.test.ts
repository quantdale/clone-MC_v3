import { describe, expect, it } from 'vitest';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import {
  snapshotCanonicalResourceMetrics,
  type CanonicalEntityResourceCounts,
} from '../../src/engine/CanonicalResourceMetrics';
import type { WorldStats } from '../../src/world/MeshingTypes';

const worldStats: WorldStats = {
  loadedChunks: 12,
  residentColumns: 4,
  allocatedSections: 9,
  dirtyColumns: 2,
  dirtySections: 3,
  geometries: 7,
  pendingLight: 5,
  pendingSave: 0,
  pendingGeneration: 6,
  pendingMesh: 8,
  pendingUnload: 1,
  triangles: 144,
  voxels: 288,
};

const entities: CanonicalEntityResourceCounts = {
  blockEntities: 2,
  activeEntities: 3,
  itemEntities: 4,
};

describe('CanonicalResourceMetrics', () => {
  it('maps owner snapshots to canonical units and labels compatibility slabs', () => {
    const metrics = snapshotCanonicalResourceMetrics(
      OVERWORLD_DIMENSION_TYPE,
      worldStats,
      { health: 'degraded', pendingCount: 11 },
      entities,
    );

    expect(metrics).toEqual({
      activeDimension: {
        id: 'minecraft:overworld',
        minY: -64,
        maxY: 319,
        minSectionY: -4,
        maxSectionY: 19,
        sectionCount: 24,
      },
      residentColumns: 4,
      allocatedSections: 9,
      sectionGeometries: 7,
      legacySlabProjections: 12,
      dirtyColumns: 2,
      dirtySections: 3,
      pendingGenerationJobs: 6,
      pendingMeshJobs: 8,
      pendingLightJobs: 5,
      pendingSaveJobs: 11,
      pendingUnloadJobs: 1,
      blockEntities: 2,
      activeEntities: 3,
      itemEntities: 4,
      storageHealth: 'degraded',
    });
  });

  it('reports unavailable storage without changing world ownership metrics', () => {
    const metrics = snapshotCanonicalResourceMetrics(OVERWORLD_DIMENSION_TYPE, worldStats, null, entities);
    expect(metrics.storageHealth).toBe('unavailable');
    expect(metrics.residentColumns).toBe(4);
    expect(metrics.pendingSaveJobs).toBe(0);
  });
});
