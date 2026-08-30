import { describe, expect, it } from 'vitest';
import { MeshReadyQueue } from '../../src/rendering/MeshReadyQueue';
import { packQuadsToTypedLayerStreams } from '../../src/rendering/WorkerMeshing';
import { MESH_STREAM_NAMES, type MeshStreamName } from '../../src/world/MeshingTypes';
import type { OpaqueFaceQuad } from '../../src/rendering/GreedyMesher';

function streams(stream: MeshStreamName = 'opaque') {
  const quad: OpaqueFaceQuad = {
    face: 'up', x: 0, y: 0, z: 0, width: 1, height: 1, blockId: 1,
    vertexLights: [{ sky: 15, block: 0 }, { sky: 15, block: 0 }, { sky: 15, block: 0 }, { sky: 15, block: 0 }],
    vertexAO: [0, 0, 0, 0], tintClass: 0xffffff, renderStream: stream,
  };
  return packQuadsToTypedLayerStreams([quad], { topTileById: [0, 0], bottomTileById: [0, 0], sideTileById: [0, 0] });
}

function record(requestId: string, layers = streams()) {
  return {
    requestId,
    target: { sectionX: 0, sectionY: 0, sectionZ: 0 },
    generation: 1,
    versionSnapshot: { sections: [] },
    layers,
    byteLength: MESH_STREAM_NAMES.reduce((total, name) => total + layers[name].byteLength, 0),
    lod: 0 as const,
  };
}

describe('MeshReadyQueue', () => {
  it('validates and bounds records by count and bytes without partial admission', () => {
    let now = 100;
    const one = record('one');
    const queue = new MeshReadyQueue({ maxRecords: 1, maxBytes: one.byteLength }, () => now);
    expect(queue.enqueue(one)).toEqual({ accepted: true });
    const before = queue.metrics();
    expect(queue.enqueue(record('two'))).toEqual({ accepted: false, reason: 'record-cap' });
    expect(queue.metrics()).toEqual({ ...before, rejectedCount: 1 });
    expect(queue.dequeue()?.requestId).toBe('one');
    now += 250;
    expect(queue.metrics().oldestAgeMs).toBe(0);
  });

  it('rejects malformed, forged, duplicate, and over-byte records', () => {
    const one = record('one');
    const queue = new MeshReadyQueue({ maxBytes: one.byteLength - 1 });
    expect(queue.enqueue(one)).toEqual({ accepted: false, reason: 'byte-cap' });
    expect(queue.enqueue({ ...one, requestId: '' })).toEqual({ accepted: false, reason: 'invalid' });
    const valid = new MeshReadyQueue({ maxBytes: one.byteLength * 2 });
    expect(valid.enqueue(one)).toEqual({ accepted: true });
    expect(valid.enqueue(one)).toEqual({ accepted: false, reason: 'duplicate' });
    expect(valid.enqueue({ ...one, requestId: 'bad-bytes', byteLength: one.byteLength + 1 })).toEqual({ accepted: false, reason: 'invalid' });
  });

  it('reports oldest age and defers complete records intact at the front', () => {
    let now = 0;
    const first = record('first');
    const second = record('second');
    const queue = new MeshReadyQueue({ maxRecords: 3, maxBytes: first.byteLength * 3 }, () => now);
    expect(queue.enqueue(first).accepted).toBe(true);
    now = 400;
    expect(queue.enqueue(second).accepted).toBe(true);
    expect(queue.metrics()).toMatchObject({ count: 2, oldestAgeMs: 400, bytes: first.byteLength * 2 });
    const removed = queue.dequeue()!;
    expect(removed.requestId).toBe('first');
    queue.defer(removed);
    expect(queue.metrics()).toMatchObject({ count: 2, oldestAgeMs: 400, deferredCount: 1 });
    expect(queue.dequeue()?.requestId).toBe('first');
    expect(queue.dequeue()?.requestId).toBe('second');
  });

  it('drains every complete record and validates configuration', () => {
    expect(() => new MeshReadyQueue({ maxRecords: 0 })).toThrow(/maxRecords/);
    expect(() => new MeshReadyQueue({ maxBytes: 0 })).toThrow(/maxBytes/);
    const queue = new MeshReadyQueue();
    expect(queue.drain()).toEqual([]);
    const one = record('one');
    expect(queue.enqueue(one).accepted).toBe(true);
    expect(queue.drain().map((entry) => entry.requestId)).toEqual(['one']);
    expect(queue.size).toBe(0);
    expect(queue.byteLength).toBe(0);
  });
});
