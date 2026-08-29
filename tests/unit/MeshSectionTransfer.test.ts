import { describe, expect, it } from 'vitest';
import {
  MESH_SECTION_FACE_AREA,
  MESH_SECTION_VOLUME,
  collectMeshSectionTransferables,
  normalizeMeshSectionTransfer,
  validateMeshSectionTransferOwnership,
} from '../../src/rendering/MeshSectionTransfer';
import { validateMeshSectionRequest, MeshWorkerClient } from '../../src/rendering/WorkerMeshing';
import type { MeshSectionHaloMap } from '../../src/rendering/WorkerMeshing';
import { WorkerPool } from '../../src/engine/WorkerPool';
import { validateWorkerRequest, type WorkerRequest } from '../../src/rendering/WorkerJobProtocol';

function legacyPayload() {
  const cells = new Array<number | null>(MESH_SECTION_VOLUME).fill(null);
  cells[0] = 1;
  const halo = Object.fromEntries(['west', 'east', 'down', 'up', 'north', 'south'].map((face) => [face, {
    availability: new Array(MESH_SECTION_FACE_AREA).fill(2),
    cells: new Array<number | null>(MESH_SECTION_FACE_AREA).fill(null),
    skyLight: new Array(MESH_SECTION_FACE_AREA).fill(0),
    blockLight: new Array(MESH_SECTION_FACE_AREA).fill(0),
    fluidLevels: new Array(MESH_SECTION_FACE_AREA).fill(-1),
  }])) as MeshSectionHaloMap;
  return {
    cells,
    opaqueIds: [1],
    layerById: [0, 0],
    skyLight: new Array(MESH_SECTION_VOLUME).fill(15),
    blockLight: new Array(MESH_SECTION_VOLUME).fill(0),
    fluidLevels: new Array(MESH_SECTION_VOLUME).fill(-1),
    tintClasses: new Array(MESH_SECTION_VOLUME).fill(0),
    halo,
  };
}

class TransferWorker {
  posted: Array<{ request: WorkerRequest; transfer: ArrayBuffer[] }> = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage(message: unknown, transfer: ArrayBuffer[] = []): void {
    this.posted.push({ request: validateWorkerRequest(message), transfer });
  }
  terminate(): void {}
  addEventListener(): void {}
}

describe('mesh section typed transfer ownership', () => {
  it('normalizes legacy arrays into typed buffers and validates a typed-only request', () => {
    const transferData = normalizeMeshSectionTransfer(legacyPayload());
    validateMeshSectionTransferOwnership(transferData);
    const request = validateMeshSectionRequest({
      sectionX: 0,
      sectionY: 0,
      sectionZ: 0,
      transferData,
    });
    expect(request.cells).toBe(transferData.cells);
    expect(request.skyLight).toBe(transferData.skyLight);
    expect(request.halo?.west.cells).toBe(transferData.halo.west.cells);
    expect(request.opaqueIds).toBe(transferData.opaqueIds);
  });

  it('rejects a section transfer that exceeds the configured byte cap', () => {
    const transferData = normalizeMeshSectionTransfer(legacyPayload());
    expect(() => validateMeshSectionTransferOwnership(transferData, 1024)).toThrow(/exceed cap/);
    expect(() => collectMeshSectionTransferables(transferData, 1024)).toThrow(/exceed cap/);
  });

  it('returns each owned buffer once and rejects duplicate ownership', () => {
    const transferData = normalizeMeshSectionTransfer(legacyPayload());
    const buffers = collectMeshSectionTransferables(transferData);
    expect(buffers.length).toBe(new Set(buffers).size);
    expect(buffers).toContain(transferData.cells.buffer);
    expect(buffers).toContain(transferData.halo.south.fluidLevels.buffer);

    const duplicate = {
      ...transferData,
      opaqueIds: new Uint16Array(transferData.cells.buffer),
    };
    expect(() => validateMeshSectionTransferOwnership(duplicate)).toThrow(/duplicate buffer ownership/);
    expect(() => collectMeshSectionTransferables(duplicate)).toThrow(/duplicate buffer ownership/);
  });

  it('rejects detached buffers before a worker request can be submitted', () => {
    const transferData = normalizeMeshSectionTransfer(legacyPayload());
    structuredClone(transferData.cells.buffer, { transfer: [transferData.cells.buffer] });
    expect(() => validateMeshSectionTransferOwnership(transferData)).toThrow(/detached/);
    expect(() => collectMeshSectionTransferables(transferData)).toThrow(/detached/);
  });

  it('propagates the typed section buffers as the pool transfer list', () => {
    const worker = new TransferWorker();
    const pool = new WorkerPool({
      size: 1,
      maxInFlightPerWorker: 1,
      spawn: () => worker as unknown as Worker,
    });
    const client = new MeshWorkerClient({ pool, timeoutMs: 0 });
    const source = legacyPayload();
    client.requestSection({ sectionX: 0, sectionY: 0, sectionZ: 0, ...source }, () => undefined);

    const posted = worker.posted[0]!;
    const typedPayload = posted.request.payload as { transferData: { cells: Uint16Array } };
    expect(typedPayload.transferData.cells).toBeInstanceOf(Uint16Array);
    expect(posted.transfer.length).toBeGreaterThan(10);
    expect(new Set(posted.transfer).size).toBe(posted.transfer.length);
    pool.dispose();
  });

  it('fails transferred in-flight work instead of requeueing detached ownership after worker loss', () => {
    const first = new TransferWorker();
    const second = new TransferWorker();
    let spawns = 0;
    const pool = new WorkerPool({
      size: 1,
      maxInFlightPerWorker: 1,
      spawn: () => (spawns++ === 0 ? first : second) as unknown as Worker,
    });
    const buffer = new ArrayBuffer(16);
    const failures: string[] = [];
    pool.submit({
      kind: 'mesh-section',
      generationToken: 1,
      payload: {},
      transfer: [buffer],
      onResult: () => undefined,
      onFailure: (error) => failures.push(error),
    });
    first.onerror!();
    expect(failures).toEqual([expect.stringContaining('transferred job cannot be requeued')]);
    expect(second.posted).toHaveLength(0);
    pool.dispose();
  });
});
