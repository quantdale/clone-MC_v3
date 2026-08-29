import { describe, expect, it } from 'vitest';
import {
  MESH_REGISTRY_TABLE_PROTOCOL_VERSION,
  createMeshWorkerRegistryTable,
  validateMeshWorkerRegistryTable,
} from '../../src/rendering/MeshWorkerRegistry';
import {
  WORKER_PROTOCOL_VERSION,
  validateWorkerInitializationMessage,
  serveWorkerRequests,
} from '../../src/rendering/WorkerJobProtocol';
import {
  processMeshSectionRequest,
  validateMeshSectionRequest,
} from '../../src/rendering/WorkerMeshing';
import { WorkerPool } from '../../src/engine/WorkerPool';

const definitions = [
  { id: 3, opaque: false, renderCategory: 1, topTile: 7, bottomTile: 8, sideTile: 9 },
  { id: 1, opaque: true, renderCategory: 0, topTile: 4, bottomTile: 5, sideTile: 6 },
  { id: 2, opaque: true, renderCategory: 0, topTile: 10, bottomTile: 11, sideTile: 12 },
] as const;

function sectionPayload(tableId: string): Record<string, unknown> {
  return {
    sectionX: 0,
    sectionY: 0,
    sectionZ: 0,
    registryTableId: tableId,
    cells: new Array(4096).fill(null),
    skyLight: new Array(4096).fill(15),
    blockLight: new Array(4096).fill(0),
  };
}

class InitWorker {
  readonly messages: unknown[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage(message: unknown): void {
    this.messages.push(message);
  }
  terminate(): void {}
  addEventListener(): void {}
}

describe('mesh worker registry initialization', () => {
  it('builds a deterministic frozen table and validates its content-derived identity', () => {
    const first = createMeshWorkerRegistryTable(definitions, [3]);
    const reordered = createMeshWorkerRegistryTable([...definitions].reverse(), [3]);
    const changed = createMeshWorkerRegistryTable(definitions, []);

    expect(first.tableId).toBe(reordered.tableId);
    expect(first.tableId).not.toBe(changed.tableId);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.opaqueIds)).toBe(true);
    expect(Object.isFrozen(first.layerById)).toBe(true);
    expect(validateMeshWorkerRegistryTable(first)).toEqual(first);
    expect(() => validateMeshWorkerRegistryTable({ ...first, tableId: 'forged' })).toThrow(/tableId/);
    expect(() => validateMeshWorkerRegistryTable({ ...first, protocolVersion: MESH_REGISTRY_TABLE_PROTOCOL_VERSION + 1 })).toThrow(/version/);
  });

  it('requires an initialized matching table and rejects repeated registry arrays', () => {
    const table = createMeshWorkerRegistryTable(definitions, [3]);
    expect(() => validateMeshSectionRequest(sectionPayload(table.tableId))).toThrow(/not initialized/);
    expect(validateMeshSectionRequest(sectionPayload(table.tableId), table).opaqueIds).toEqual([1, 2]);
    expect(() => validateMeshSectionRequest(sectionPayload('other'), table)).toThrow(/not initialized/);
    expect(() => validateMeshSectionRequest({ ...sectionPayload(table.tableId), opaqueIds: [1] }, table)).toThrow(/must not repeat/);
  });

  it('produces validated GPU-ready streams from the registry-backed request path', () => {
    const table = createMeshWorkerRegistryTable(definitions, [3]);
    const request = sectionPayload(table.tableId);
    (request.cells as number[])[0] = 1;
    const validated = validateMeshSectionRequest(request, table);
    const result = processMeshSectionRequest(validated);

    expect(validated.textureTiles?.topTileById[1]).toBe(4);
    expect(result.layerStreams).toBeDefined();
    expect(result.layerStreams?.opaque.quadCount).toBeGreaterThan(0);
    expect(result.layerStreams?.opaque.vertexCount).toBe(result.layerStreams!.opaque.quadCount * 4);
    const opaqueUvs = Array.from(result.layerStreams!.opaque.uvs);
    const hasTopTileUv = opaqueUvs.some((value, index) =>
      index % 2 === 0 && value === 4 / 16 && opaqueUvs[index + 1] === 1 - (Math.floor(4 / 16) + 1) / 4,
    );
    expect(hasTopTileUv).toBe(true);
    expect(result.layerStreams?.cutout.quadCount).toBe(0);
    expect(result.layerStreams?.translucent.quadCount).toBe(0);
    expect(result.layerStreams?.fluid.quadCount).toBe(0);
  });

  it('validates initialization envelopes and dispatches them without treating them as jobs', () => {
    const table = createMeshWorkerRegistryTable(definitions, [3]);
    const initialized: unknown[] = [];
    const scope = {
      postMessage: () => undefined,
      onmessage: null as ((event: { data: unknown }) => void) | null,
    };
    serveWorkerRequests({}, scope, { onInitialize: (_kind, payload) => initialized.push(payload) });
    scope.onmessage!({
      data: {
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: 'initialize',
        kind: 'mesh-section',
        payload: table,
      },
    });
    expect(initialized).toEqual([table]);
    expect(validateWorkerInitializationMessage({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: 'initialize',
      kind: 'mesh-section',
      payload: table,
    }).payload).toBe(table);
    expect(() => validateWorkerInitializationMessage({
      protocolVersion: WORKER_PROTOCOL_VERSION + 1,
      type: 'initialize',
      kind: 'mesh-section',
      payload: table,
    })).toThrow(/version/);
  });

  it('sends one initializer per worker spawn and repeats it on respawn before requeued work', () => {
    const table = createMeshWorkerRegistryTable(definitions, [3]);
    const workers: InitWorker[] = [];
    const pool = new WorkerPool({
      size: 1,
      maxInFlightPerWorker: 1,
      spawn: () => {
        const worker = new InitWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
      initialize: {
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: 'initialize',
        kind: 'mesh-section',
        payload: table,
      },
    });
    expect(workers[0]!.messages).toEqual([expect.objectContaining({ type: 'initialize', payload: table })]);

    const failures: string[] = [];
    pool.submit({
      kind: 'mesh-section',
      generationToken: 1,
      payload: sectionPayload(table.tableId),
      onResult: () => undefined,
      onFailure: (error) => failures.push(error),
    });
    workers[0]!.onerror!();
    expect(workers).toHaveLength(2);
    expect(workers[1]!.messages[0]).toEqual(expect.objectContaining({ type: 'initialize', payload: table }));
    expect(workers[1]!.messages).toHaveLength(2);
    expect(failures).toEqual([]);
    pool.dispose();
  });
});
