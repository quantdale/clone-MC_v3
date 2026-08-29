import type { DimensionType } from '../data/DimensionType';
import { resourceIdToString } from '../data/ResourceId';
import type { GamePersistence } from '../storage/GamePersistence';
import type { WorldStats } from '../world/MeshingTypes';

export interface CanonicalEntityResourceCounts {
  blockEntities: number;
  activeEntities: number;
  itemEntities: number;
}

/**
 * Read-only observability snapshot for the live canonical world.
 *
 * Counts are sampled from their owning subsystem; this module owns no live
 * state and cannot become a second authority. `legacySlabProjections` is kept
 * only to make compatibility cost visible and is never used as residency truth.
 */
export interface CanonicalResourceMetrics {
  activeDimension: {
    id: string;
    minY: number;
    maxY: number;
    minSectionY: number;
    maxSectionY: number;
    sectionCount: number;
  };
  residentColumns: number;
  allocatedSections: number;
  sectionGeometries: number;
  legacySlabProjections: number;
  dirtyColumns: number;
  dirtySections: number;
  pendingGenerationJobs: number;
  pendingMeshJobs: number;
  pendingLightJobs: number;
  pendingSaveJobs: number;
  pendingUnloadJobs: number;
  blockEntities: number;
  activeEntities: number;
  itemEntities: number;
  storageHealth: GamePersistence['health'] | 'unavailable';
}

export function snapshotCanonicalResourceMetrics(
  dimension: DimensionType,
  world: WorldStats,
  persistence: Pick<GamePersistence, 'health' | 'pendingCount'> | null,
  entities: CanonicalEntityResourceCounts,
): CanonicalResourceMetrics {
  return {
    activeDimension: {
      id: resourceIdToString(dimension.id),
      minY: dimension.minY,
      maxY: dimension.maxY,
      minSectionY: dimension.minSectionY,
      maxSectionY: dimension.maxSectionY,
      sectionCount: dimension.sectionCount,
    },
    residentColumns: world.residentColumns,
    allocatedSections: world.allocatedSections,
    sectionGeometries: world.geometries,
    legacySlabProjections: world.loadedChunks,
    dirtyColumns: world.dirtyColumns,
    dirtySections: world.dirtySections,
    pendingGenerationJobs: world.pendingGeneration,
    pendingMeshJobs: world.pendingMesh,
    pendingLightJobs: world.pendingLight,
    pendingSaveJobs: persistence?.pendingCount ?? 0,
    pendingUnloadJobs: world.pendingUnload,
    ...entities,
    storageHealth: persistence?.health ?? 'unavailable',
  };
}
