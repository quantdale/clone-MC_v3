import { describe, expect, it } from 'vitest';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { WorldLightStorage } from '../../src/rendering/LightStorage';
import {
  MeshWorkerClient,
  processMeshSectionRequest,
  type MeshSectionRequestPayload,
} from '../../src/rendering/WorkerMeshing';
import {
  captureSectionVersionSnapshot,
  findSectionVersionSnapshot,
  isSectionVersionSnapshotCurrent,
  sectionVersionSnapshotsEqual,
} from '../../src/world/SectionVersionSnapshot';
import { WORKER_PROTOCOL_VERSION } from '../../src/rendering/WorkerJobProtocol';

function emptySectionPayload(sectionX: number, sectionY: number, sectionZ: number): MeshSectionRequestPayload {
  return {
    sectionX,
    sectionY,
    sectionZ,
    cells: new Array(4096).fill(null),
    opaqueIds: [],
    skyLight: new Array(4096).fill(0),
    blockLight: new Array(4096).fill(0),
  };
}

describe('Change 253 render/light/worker ownership characterization', () => {
  it('routes canonical Overworld section identity across negative and upper Y', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const column = new ChunkColumn({
      chunkX: -2,
      chunkZ: 3,
      minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
      sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
      registry: stateRegistry,
    });
    const stone = stateRegistry.getDefaultState(BlockId.Stone);

    column.setBlockState(15, -64, 15, stone);
    column.setBlockState(0, 319, 0, stone);

    expect(column.sectionIndexForY(-64)).toBe(0);
    expect(column.sectionIndexForY(319)).toBe(23);
    expect(column.allocatedSectionCount()).toBe(2);
    expect(column.sectionMeshVersion(0)).toBeGreaterThan(0);
    expect(column.sectionMeshVersion(23)).toBeGreaterThan(0);
  });

  it('uses floor-based section keys and versions for negative light coordinates', () => {
    const light = new WorldLightStorage();
    light.setSkyLight(-17, -65, -1, 12);
    const captured = light.getSectionVersion(-2, -5, -1);

    expect(light.getSkyLight(-17, -65, -1)).toBe(12);
    expect(captured).toBeGreaterThan(0);
    expect(light.isSectionStale(-2, -5, -1, captured)).toBe(false);

    light.setSkyLight(-17, -65, -1, 11);
    expect(light.isSectionStale(-2, -5, -1, captured)).toBe(true);
  });

  it('captures target and face-neighbor mesh/light versions without allocating missing sections', () => {
    const meshVersions = new Map([['-2,-1,3', 7], ['-2,-3,3', 8]]);
    const lightVersions = new Map([['-2,-1,3', 2], ['-2,-3,3', 4]]);
    const snapshot = captureSectionVersionSnapshot(-2, -1, 3, 2, {
      meshVersionAt: (x, y, z) => meshVersions.get(`${x},${y},${z}`) ?? 0,
      lightVersionAt: (x, y, z) => lightVersions.get(`${x},${y},${z}`) ?? 0,
    });

    expect(findSectionVersionSnapshot(snapshot, -2, -2, 3)).toMatchObject({
      meshVersion: 0,
      lightVersion: 0,
      target: true,
    });
    expect(findSectionVersionSnapshot(snapshot, -2, -1, 3)).toMatchObject({
      meshVersion: 7,
      lightVersion: 2,
      target: true,
    });
    expect(findSectionVersionSnapshot(snapshot, -2, -3, 3)).toMatchObject({
      meshVersion: 8,
      lightVersion: 4,
      target: false,
    });
    expect(findSectionVersionSnapshot(snapshot, -3, -1, 3)?.target).toBe(false);
    expect(snapshot.sections).toHaveLength(12);
    expect(sectionVersionSnapshotsEqual(snapshot, { sections: snapshot.sections.map((entry) => ({ ...entry })) })).toBe(true);
    expect(isSectionVersionSnapshotCurrent(snapshot, {
      meshVersionAt: (x, y, z) => meshVersions.get(`${x},${y},${z}`) ?? 0,
      lightVersionAt: (x, y, z) => lightVersions.get(`${x},${y},${z}`) ?? 0,
    })).toBe(true);
    expect(isSectionVersionSnapshotCurrent(snapshot, {
      meshVersionAt: (x, y, z) => (x === -2 && y === -1 && z === 3 ? 99 : meshVersions.get(`${x},${y},${z}`) ?? 0),
      lightVersionAt: (x, y, z) => lightVersions.get(`${x},${y},${z}`) ?? 0,
    })).toBe(false);
  });

  it('settles owned stale-token and snapshot-mismatch results exactly once', () => {
    const client = new MeshWorkerClient({ generationToken: 9 });
    const request = emptySectionPayload(-2, -5, -1);
    const snapshot = { sections: [{ sectionX: -2, sectionY: -5, sectionZ: -1, meshVersion: 1, lightVersion: 2, target: true }] } as const;
    request.versionSnapshot = snapshot;
    const payload = processMeshSectionRequest(request, 9);
    let rejected = 0;
    let resolved = 0;

    const staleJob = client.requestSection(request, () => resolved++, () => rejected++);
    expect(client.handleMessage({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: staleJob,
      kind: 'mesh-section',
      ok: true,
      generationToken: 8,
      payload,
    })).toBeNull();
    expect(client.pendingCount).toBe(0);
    expect(rejected).toBe(1);

    const mismatchJob = client.requestSection(request, () => resolved++, () => rejected++);
    const mismatched = {
      ...payload,
      versionSnapshot: { sections: [{ ...snapshot.sections[0], lightVersion: 3 }] },
    };
    expect(client.handleMessage(MeshWorkerClient.resultMessage(mismatchJob, mismatched))).toBeNull();
    expect(client.pendingCount).toBe(0);
    expect(rejected).toBe(2);
    expect(resolved).toBe(0);

    // A detached compatibility caller retains the generic pending-on-token-mismatch contract.
    const detachedJob = client.requestSection(request, () => resolved++);
    expect(client.handleMessage({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: detachedJob,
      kind: 'mesh-section',
      ok: true,
      generationToken: 8,
      payload,
    })).toBeNull();
    expect(client.pendingCount).toBe(1);
    client.cancel(detachedJob);
  });
  it('rejects worker results with foreign section identity or superseded generation token', () => {
    const client = new MeshWorkerClient({ generationToken: 9 });
    const request = emptySectionPayload(-2, -5, -1);
    let callbacks = 0;
    const jobId = client.requestSection(request, () => callbacks++);
    const payload = processMeshSectionRequest(request, 9);

    expect(client.handleMessage({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId,
      kind: 'mesh-section',
      ok: true,
      generationToken: 9,
      payload: { ...payload, sectionX: -1 },
    })).toBeNull();
    // A foreign section identity cannot ever satisfy this request, so the client abandons it.
    expect(client.pendingCount).toBe(0);

    const supersededJobId = client.requestSection(request, () => callbacks++);
    expect(client.handleMessage({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: supersededJobId,
      kind: 'mesh-section',
      ok: true,
      generationToken: 8,
      payload,
    })).toBeNull();
    // Detached callers without an owner rejection hook preserve the generic pending contract.
    expect(client.pendingCount).toBe(1);

    expect(client.handleMessage({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: supersededJobId,
      kind: 'mesh-section',
      ok: true,
      generationToken: 9,
      payload,
    })).not.toBeNull();
    expect(callbacks).toBe(1);
    expect(client.pendingCount).toBe(0);
  });
});
