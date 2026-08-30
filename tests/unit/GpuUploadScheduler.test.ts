import { describe, expect, it } from 'vitest';
import { GpuUploadScheduler } from '../../src/rendering/GpuUploadScheduler';
import { MeshReadyQueue } from '../../src/rendering/MeshReadyQueue';
import { packQuadsToTypedLayerStreams } from '../../src/rendering/WorkerMeshing';
import { MESH_STREAM_NAMES, type MeshStreamName } from '../../src/world/MeshingTypes';
import type { OpaqueFaceQuad } from '../../src/rendering/GreedyMesher';

function layers(stream: MeshStreamName = 'opaque') {
  const quad: OpaqueFaceQuad = {
    face: 'up', x: 0, y: 0, z: 0, width: 1, height: 1, blockId: 1,
    vertexLights: [{ sky: 15, block: 0 }, { sky: 15, block: 0 }, { sky: 15, block: 0 }, { sky: 15, block: 0 }],
    vertexAO: [0, 0, 0, 0], tintClass: 0xffffff, renderStream: stream,
  };
  return packQuadsToTypedLayerStreams([quad], {
    topTileById: [0, 0], bottomTileById: [0, 0], sideTileById: [0, 0],
  });
}

function record(requestId: string) {
  const streams = layers();
  return {
    requestId,
    target: { sectionX: 0, sectionY: 0, sectionZ: 0 },
    generation: 1,
    versionSnapshot: { sections: [] },
    layers: streams,
    byteLength: MESH_STREAM_NAMES.reduce((total, name) => total + streams[name].byteLength, 0),
    lod: 0 as const,
  };
}

function queueWith(...requestIds: string[]) {
  const first = record(requestIds[0] ?? 'first');
  const queue = new MeshReadyQueue({ maxRecords: 8, maxBytes: first.byteLength * 8 });
  for (const requestId of requestIds) expect(queue.enqueue(record(requestId)).accepted).toBe(true);
  return { queue, byteLength: first.byteLength };
}

describe('GpuUploadScheduler', () => {
  it('enforces byte and upload-count budgets while preserving FIFO records', () => {
    const { queue, byteLength } = queueWith('first', 'second', 'third');
    const scheduler = new GpuUploadScheduler(queue, {
      maxBytes: byteLength,
      maxMillis: 10,
      maxUploadsPerFrame: 2,
      estimatedUploadMillis: 1,
    });
    const uploaded: string[] = [];
    const frame = scheduler.runFrame((item) => {
      uploaded.push(item.requestId);
      return { uploadedBytes: item.byteLength };
    });

    expect(uploaded).toEqual(['first']);
    expect(frame).toMatchObject({
      uploadedCount: 1,
      uploadedBytes: byteLength,
      deferredCount: 1,
      budgetExhausted: true,
      queueDepth: 2,
    });
    expect(queue.peek()?.requestId).toBe('second');
  });

  it('uses actual executor time to stop an upload overrun and updates the estimate', () => {
    let now = 0;
    const { queue } = queueWith('first', 'second');
    const scheduler = new GpuUploadScheduler(queue, {
      maxBytes: Number.MAX_SAFE_INTEGER,
      maxMillis: 3,
      estimatedUploadMillis: 1,
    }, () => now);

    const frame = scheduler.runFrame(() => {
      now += 4;
      return undefined;
    });

    expect(frame).toMatchObject({
      uploadedCount: 1,
      actualMillis: 4,
      deferredCount: 1,
      budgetExhausted: true,
      queueDepth: 1,
    });
    expect(scheduler.estimatedUploadMillis).toBe(1.75);
    expect(queue.peek()?.requestId).toBe('second');
  });

  it('requeues a failed executor record intact and stops the frame', () => {
    let attempts = 0;
    const { queue } = queueWith('first', 'second');
    const scheduler = new GpuUploadScheduler(queue, {
      maxBytes: Number.MAX_SAFE_INTEGER,
      maxMillis: 10,
      estimatedUploadMillis: 1,
    });

    const frame = scheduler.runFrame((item) => {
      attempts += 1;
      if (attempts === 1) throw new Error(`failed ${item.requestId}`);
      return undefined;
    });
    expect(frame).toMatchObject({ uploadedCount: 0, failedCount: 1, queueDepth: 2 });
    expect(queue.peek()?.requestId).toBe('first');
    expect(scheduler.metrics().totalFailedCount).toBe(1);

    const retried: string[] = [];
    expect(scheduler.runFrame((item) => {
      retried.push(item.requestId);
      return undefined;
    }).uploadedCount).toBe(2);
    expect(retried).toEqual(['first', 'second']);
  });

  it('keeps p95 upload work within budget during a worker completion storm', () => {
    const first = record('storm-0');
    const queue = new MeshReadyQueue({ maxRecords: 256, maxBytes: first.byteLength * 256 });
    const totalRecords = 128;
    for (let i = 0; i < totalRecords; i++) {
      expect(queue.enqueue(record(`storm-${i}`)).accepted).toBe(true);
    }

    let now = 0;
    const maxBytes = first.byteLength * 4;
    const maxMillis = 1.5;
    const scheduler = new GpuUploadScheduler(queue, {
      maxBytes,
      maxMillis,
      maxUploadsPerFrame: 8,
      estimatedUploadMillis: 0.25,
    }, () => now);
    const uploaded: string[] = [];
    const actualFrameMillis: number[] = [];
    const frameBytes: number[] = [];
    const frameCounts: number[] = [];

    while (queue.size > 0) {
      const frame = scheduler.runFrame((item) => {
        uploaded.push(item.requestId);
        now += 0.25;
        return { uploadedBytes: item.byteLength };
      });
      actualFrameMillis.push(frame.actualMillis);
      frameBytes.push(frame.uploadedBytes);
      frameCounts.push(frame.uploadedCount);
      expect(frame.uploadedBytes).toBeLessThanOrEqual(maxBytes);
      expect(frame.uploadedCount).toBeLessThanOrEqual(4);
      expect(frame.actualMillis).toBeLessThanOrEqual(maxMillis);
    }

    const sortedMillis = [...actualFrameMillis].sort((a, b) => a - b);
    const p95 = sortedMillis[Math.min(sortedMillis.length - 1, Math.floor(sortedMillis.length * 0.95))] ?? 0;
    expect(p95).toBeLessThanOrEqual(maxMillis);
    expect(Math.max(...frameBytes)).toBeLessThanOrEqual(maxBytes);
    expect(Math.max(...frameCounts)).toBeLessThanOrEqual(4);
    expect(uploaded).toEqual(Array.from({ length: totalRecords }, (_, i) => `storm-${i}`));
    expect(scheduler.metrics()).toMatchObject({
      totalUploadedCount: totalRecords,
      totalUploadedBytes: first.byteLength * totalRecords,
    });
  });

  it('rejects invalid budgets and executor byte reports', () => {
    const { queue } = queueWith('one');
    for (const config of [
      { maxBytes: 0, maxMillis: 1, estimatedUploadMillis: 1 },
      { maxBytes: 1, maxMillis: 0, estimatedUploadMillis: 1 },
      { maxBytes: 1, maxMillis: 1, estimatedUploadMillis: 0 },
      { maxBytes: 1, maxMillis: 1, estimatedUploadMillis: 1, maxUploadsPerFrame: 0 },
    ]) {
      expect(() => new GpuUploadScheduler(queue, config)).toThrow(RangeError);
    }

    const scheduler = new GpuUploadScheduler(queue, {
      maxBytes: Number.MAX_SAFE_INTEGER,
      maxMillis: 10,
      estimatedUploadMillis: 1,
    });
    expect(() => scheduler.runFrame(() => ({ uploadedBytes: -1 }))).not.toThrow();
    expect(scheduler.metrics().failedCount).toBe(1);
    expect(queue.peek()?.requestId).toBe('one');
  });
});
