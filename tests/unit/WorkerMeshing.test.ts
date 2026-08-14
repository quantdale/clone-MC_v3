import { describe, it, expect } from 'vitest';
import {
  MeshWorkerClient,
  processMeshSectionRequest,
  type MeshSectionRequestPayload,
} from '../../src/rendering/WorkerMeshing';
import {
  greedyMergeOpaqueFaces,
  type FaceCellSampler,
} from '../../src/rendering/GreedyMesher';

const SECTION = 16;

function emptyPayload(): MeshSectionRequestPayload {
  return { sectionX: 0, sectionY: 0, sectionZ: 0, cells: new Array(4096).fill(null), opaqueIds: [1] };
}

function cubePayload(): MeshSectionRequestPayload {
  const payload = emptyPayload();
  payload.cells[0] = 1; // cell (0,0,0)
  return payload;
}

function slabPayload(): MeshSectionRequestPayload {
  const payload = emptyPayload();
  payload.cells[0] = 1; // (0,0,0)
  payload.cells[1] = 1; // (1,0,0)
  return payload;
}

function equivalentGreedy(payload: MeshSectionRequestPayload) {
  const opaque = new Set(payload.opaqueIds);
  const sampler: FaceCellSampler = (x, y, z) => {
    const dx = x - payload.sectionX * SECTION;
    const dy = y - payload.sectionY * SECTION;
    const dz = z - payload.sectionZ * SECTION;
    if (dx < 0 || dx >= SECTION || dy < 0 || dy >= SECTION || dz < 0 || dz >= SECTION) return null;
    return payload.cells[dx + dy * SECTION + dz * SECTION * SECTION] ?? null;
  };
  return greedyMergeOpaqueFaces(sampler, (id) => opaque.has(id), (id) => String(id));
}

describe('processMeshSectionRequest', () => {
  it('is equivalent to greedyMergeOpaqueFaces on fixtures', () => {
    for (const payload of [emptyPayload(), cubePayload(), slabPayload()]) {
      const result = processMeshSectionRequest(payload);
      expect(result.quads).toEqual(equivalentGreedy(payload));
      expect(result.sectionX).toBe(payload.sectionX);
    }
  });

  it('rejects malformed cells arrays', () => {
    expect(() => processMeshSectionRequest({ sectionX: 0, sectionY: 0, sectionZ: 0, cells: [1], opaqueIds: [] })).toThrow();
  });
});

describe('MeshWorkerClient', () => {
  it('dispatches a resolved result to the callback exactly once', () => {
    const client = new MeshWorkerClient();
    const calls: string[] = [];
    const jobId = client.requestSection(cubePayload(), (result) => calls.push(result.sectionX + ':' + result.quads.length));

    const payload = processMeshSectionRequest(cubePayload());
    const returned = client.handleMessage(MeshWorkerClient.resultMessage(jobId, payload));

    expect(calls).toEqual(['0:6']);
    expect(returned).toEqual(payload);
    expect(client.pendingCount).toBe(0);
  });

  it('rejects stale results (unknown, duplicate, cancelled) without callbacks', () => {
    const client = new MeshWorkerClient();
    let calls = 0;
    const jobId = client.requestSection(cubePayload(), () => calls++);
    const payload = processMeshSectionRequest(cubePayload());

    expect(client.handleMessage(MeshWorkerClient.resultMessage('ghost', payload))).toBeNull();
    expect(client.handleMessage(MeshWorkerClient.resultMessage(jobId, payload))).not.toBeNull();
    expect(client.handleMessage(MeshWorkerClient.resultMessage(jobId, payload))).toBeNull(); // duplicate
    expect(calls).toBe(1);

    const job2 = client.requestSection(cubePayload(), () => calls++);
    expect(client.cancel(job2)).toBe(true);
    expect(client.handleMessage(MeshWorkerClient.resultMessage(job2, payload))).toBeNull();
    expect(calls).toBe(1);
  });

  it('rejects invalid messages without mutation', () => {
    const client = new MeshWorkerClient();
    const jobId = client.requestSection(cubePayload(), () => undefined);

    expect(client.handleMessage({ protocolVersion: 99, jobId, ok: true, payload: {} })).toBeNull();
    expect(client.handleMessage({ protocolVersion: 1, jobId, ok: true })).toBeNull(); // missing payload
    expect(client.handleMessage(null)).toBeNull();
    expect(client.pendingCount).toBe(1); // unchanged

    expect(client.handleMessage(MeshWorkerClient.resultMessage(jobId, processMeshSectionRequest(cubePayload())))).not.toBeNull();
  });

  it('tracks pending lifecycle across resolve and cancel', () => {
    const client = new MeshWorkerClient();
    const a = client.requestSection(cubePayload(), () => undefined);
    const b = client.requestSection(cubePayload(), () => undefined);
    expect(client.pendingCount).toBe(2);

    client.handleMessage(MeshWorkerClient.resultMessage(a, processMeshSectionRequest(cubePayload())));
    expect(client.pendingCount).toBe(1);
    expect(client.cancel(b)).toBe(true);
    expect(client.pendingCount).toBe(0);
  });
});
