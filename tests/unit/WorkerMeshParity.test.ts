import { describe, it, expect } from 'vitest';
import {
  packQuadsToTypedArrays,
  packedQuadGeometryInputs,
  expandPackedMeshResult,
  processMeshSectionRequest,
  type MeshSectionRequestPayload,
  type PackedMeshExpandInfo,
} from '../../src/rendering/WorkerMeshing';
import {
  MeshBuildResultBuilder,
  MESH_STREAM_NAMES,
  emptyMeshStream,
  type MeshStreamData,
  type MeshStreamName,
} from '../../src/world/MeshingTypes';
import { validateMeshSectionResult } from '../../src/rendering/WorkerMeshing';



function emptyPayload(): MeshSectionRequestPayload {
  return {
    sectionX: 0,
    sectionY: 0,
    sectionZ: 0,
    cells: new Array(4096).fill(null),
    opaqueIds: [1, 2, 3, 4],
    skyLight: new Array(4096).fill(15),
    blockLight: new Array(4096).fill(0),
  };
}

/** Deterministic fake UVs keyed by canonical face index (both parity paths share it). */
function uvFor(blockId: number, faceIndex: number): { u0: number; v0: number; u1: number; v1: number } {
  const tile = ((blockId * 8 + faceIndex) % 64) * 4;
  const u0 = tile / 256;
  return { u0, v0: u0 + 0.01, u1: u0 + 0.03, v1: u0 + 0.04 };
}

/** Stream routing exercising all four streams across fixture block ids. */
function renderLayerOf(blockId: number): MeshStreamName {
  switch (blockId) {
    case 2:
      return 'cutout';
    case 3:
      return 'translucent';
    case 4:
      return 'fluid';
    default:
      return 'opaque';
  }
}

/** Fixture with content routed into every stream. */
function multiStreamPayload(): MeshSectionRequestPayload {
  const payload = emptyPayload();
  payload.cells[0] = 1; // (0,0,0) opaque cube corner
  payload.cells[5] = 2; // (1,0,0) cutout
  payload.cells[10] = 3; // (2,0,0) translucent
  payload.cells[274] = 4; // (2,1,0) fluid column surface
  return payload;
}

interface Capture {
  byName: Partial<Record<MeshStreamName, MeshStreamData>>;
}
function makeInfo(capture?: Capture): PackedMeshExpandInfo {
  return {
    uvFor: (blockId, faceIndex) => uvFor(blockId, faceIndex),
    renderLayerOf,
    buildGeometry: (stream, name) => {
      if (capture) capture.byName[name] = stream;
      return null; // parity compares stream data, not THREE objects
    },
  };
}

/** Path A: direct emission of the same quads through the shared emitter conventions. */
function directStreams(quads: ReturnType<typeof processMeshSectionRequest>['quads']): Record<MeshStreamName, MeshStreamData> {
  const builder = new MeshBuildResultBuilder();
  for (const quad of quads) {
    const name = renderLayerOf(quad.blockId);
    const sb = builder.builder(name);
    const { corners, normal, faceIndex } = packedQuadGeometryInputs(quad);
    const uv = uvFor(quad.blockId, faceIndex);
    const cornerUv: ReadonlyArray<readonly [number, number]> = [
      [uv.u0, uv.v0],
      [uv.u1, uv.v0],
      [uv.u0, uv.v1],
      [uv.u1, uv.v1],
    ];
    for (let c = 0; c < 4; c++) {
      const [x, y, z] = corners[c]!;
      const light = quad.vertexLights[c]!;
      sb.pushVertex(
        x, y, z,
        normal[0], normal[1], normal[2],
        cornerUv[c]![0], cornerUv[c]![1],
        light.sky, light.block, quad.vertexAO[c]!,
        1, 1, 1,
      );
    }
    sb.pushQuadIndices(sb.vertexCount - 1);
  }
  return builder.build(quads.length).streams;
}

function expectStreamsEqual(a: Record<MeshStreamName, MeshStreamData>, b: Record<MeshStreamName, MeshStreamData>): void {
  for (const name of MESH_STREAM_NAMES) {
    expect(a[name]!.vertexCount, `${name} vertexCount`).toBe(b[name]!.vertexCount);
    expect(Array.from(a[name]!.positions), `${name} positions`).toEqual(Array.from(b[name]!.positions));
    expect(Array.from(a[name]!.normals), `${name} normals`).toEqual(Array.from(b[name]!.normals));
    expect(Array.from(a[name]!.uvs), `${name} uvs`).toEqual(Array.from(b[name]!.uvs));
    expect(Array.from(a[name]!.skyLight), `${name} skyLight`).toEqual(Array.from(b[name]!.skyLight));
    expect(Array.from(a[name]!.blockLight), `${name} blockLight`).toEqual(Array.from(b[name]!.blockLight));
    expect(Array.from(a[name]!.ao), `${name} ao`).toEqual(Array.from(b[name]!.ao));
    expect(Array.from(a[name]!.indices), `${name} indices`).toEqual(Array.from(b[name]!.indices));
  }
}

describe('worker packed-mesh path parity (P10)', () => {
  it('packed expansion equals direct shared-emitter output per stream', () => {
    for (const payload of [emptyPayload(), multiStreamPayload()]) {
      const quads = processMeshSectionRequest(payload).quads;
      const packed = packQuadsToTypedArrays(quads);

      const capture: Capture = { byName: {} };
      expandPackedMeshResult(packed, makeInfo(capture));

      const expanded = {} as Record<MeshStreamName, MeshStreamData>;
      for (const name of MESH_STREAM_NAMES) expanded[name] = capture.byName[name] ?? emptyMeshStream();
      expectStreamsEqual(directStreams(quads), expanded);
    }
  });

  it('packing and expansion are deterministic across repeated runs', () => {
    const quads = processMeshSectionRequest(multiStreamPayload()).quads;
    const run = (): Record<MeshStreamName, MeshStreamData> => {
      const capture: Capture = { byName: {} };
      expandPackedMeshResult(packQuadsToTypedArrays(quads), makeInfo(capture));
      const out = {} as Record<MeshStreamName, MeshStreamData>;
      for (const name of MESH_STREAM_NAMES) out[name] = capture.byName[name] ?? emptyMeshStream();
      return out;
    };
    expectStreamsEqual(run(), run());
  });

  it('result validator rejects malformed payloads (pooled-path guard)', () => {
    const quads = processMeshSectionRequest(multiStreamPayload()).quads;
    expect(quads.length).toBeGreaterThan(0);
    expect(() => validateMeshSectionResult({ sectionX: 'x' })).toThrow();
    const good = processMeshSectionRequest(multiStreamPayload());
    expect(validateMeshSectionResult(good).quads.length).toBe(good.quads.length);
  });
});
