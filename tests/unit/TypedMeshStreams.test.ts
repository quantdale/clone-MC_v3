import { describe, expect, it } from 'vitest';
import {
  collectTypedMeshLayerTransferables,
  DEFAULT_MAX_MESH_RESULT_BYTES,
  validateTypedMeshLayerStreams,
} from '../../src/rendering/TypedMeshStreams';
import {
  packQuadsToTypedLayerStreams,
  validateMeshSectionResult,
} from '../../src/rendering/WorkerMeshing';
import type { OpaqueFaceQuad } from '../../src/rendering/GreedyMesher';
import { MESH_STREAM_NAMES, type MeshStreamName } from '../../src/world/MeshingTypes';

function quad(stream: MeshStreamName): OpaqueFaceQuad {
  return {
    face: 'up',
    x: 1,
    y: 2,
    z: 3,
    width: 1,
    height: 1,
    blockId: 1,
    vertexLights: [
      { sky: 15, block: 0 },
      { sky: 14, block: 1 },
      { sky: 13, block: 2 },
      { sky: 12, block: 3 },
    ],
    vertexAO: [3, 2, 1, 0],
    tintClass: 0x5aa85a,
    renderStream: stream,
  };
}

function textureTiles() {
  return {
    topTileById: [0, 1],
    bottomTileById: [0, 2],
    sideTileById: [0, 3],
  } as const;
}

describe('typed GPU-ready mesh layer streams', () => {
  it('packs all four streams with complete GPU attributes and unique transfer ownership', () => {
    const streams = packQuadsToTypedLayerStreams(
      MESH_STREAM_NAMES.flatMap((name) => [quad(name)]),
      textureTiles(),
    );

    for (const name of MESH_STREAM_NAMES) {
      const stream = streams[name];
      expect(stream.quadCount).toBe(1);
      expect(stream.vertexCount).toBe(4);
      expect(stream.indexCount).toBe(6);
      expect(stream.positions).toBeInstanceOf(Float32Array);
      expect(stream.normals).toBeInstanceOf(Float32Array);
      expect(stream.uvs).toBeInstanceOf(Float32Array);
      expect(stream.skyLight).toBeInstanceOf(Uint8Array);
      expect(stream.blockLight).toBeInstanceOf(Uint8Array);
      expect(stream.ao).toBeInstanceOf(Uint8Array);
      expect(stream.tint).toBeInstanceOf(Float32Array);
      expect(stream.indices).toBeInstanceOf(Uint32Array);
      expect(stream.byteLength).toBe(
        stream.positions.byteLength + stream.normals.byteLength + stream.uvs.byteLength +
        stream.skyLight.byteLength + stream.blockLight.byteLength + stream.ao.byteLength +
        stream.tint.byteLength + stream.indices.byteLength,
      );
    }

    const transfer = collectTypedMeshLayerTransferables(streams);
    expect(transfer).toHaveLength(32);
    expect(new Set(transfer).size).toBe(transfer.length);
  });

  it('rejects duplicate ownership, forged byte lengths, and configured caps before attachment', () => {
    const streams = packQuadsToTypedLayerStreams([quad('opaque')], textureTiles());
    expect(() => validateTypedMeshLayerStreams({
      ...streams,
      cutout: streams.opaque,
    })).toThrow(/duplicate buffer ownership/);
    expect(() => validateTypedMeshLayerStreams({
      ...streams,
      opaque: { ...streams.opaque, byteLength: streams.opaque.byteLength + 1 },
    })).toThrow(/byteLength/);
    expect(() => validateTypedMeshLayerStreams(streams, { maxVertices: 1 })).toThrow(/cap/);
    expect(() => validateTypedMeshLayerStreams(streams, { maxBytes: 1 })).toThrow(/bytes/);
    expect(DEFAULT_MAX_MESH_RESULT_BYTES).toBeGreaterThan(0);
  });

  it('validates layer streams in the worker result envelope and rejects mixed transport forms', () => {
    const streams = packQuadsToTypedLayerStreams([quad('fluid')], textureTiles());
    const result = validateMeshSectionResult({
      sectionX: 0,
      sectionY: 0,
      sectionZ: 0,
      layerStreams: streams,
    });
    expect(result.quads).toEqual([]);
    expect(result.layerStreams?.fluid.quadCount).toBe(1);
    expect(() => validateMeshSectionResult({
      sectionX: 0,
      sectionY: 0,
      sectionZ: 0,
      layerStreams: streams,
      data: new Float32Array(0),
      quadCount: 0,
      stride: 22,
    })).toThrow(/mutually exclusive/);
  });
});
