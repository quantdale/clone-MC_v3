import { describe, it, expect } from 'vitest';
import {
  packQuadsToTypedArrays,
  packedQuadGeometryInputs,
  packedTintRgb,
  expandPackedMeshResult,
  processMeshSectionRequest,
  type MeshSectionRequestPayload,
  type PackedMeshExpandInfo,
} from '../../src/rendering/WorkerMeshing';
import type { OpaqueFaceQuad } from '../../src/rendering/GreedyMesher';
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
        ...packedTintRgb(quad.tintClass ?? 0),
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

  it('packed validator accepts the worker-entry packed form and rejects corrupt buffers', () => {
    const good = processMeshSectionRequest(multiStreamPayload());
    const packed = packQuadsToTypedArrays(good.quads);
    const envelope = {
      sectionX: good.sectionX,
      sectionY: good.sectionY,
      sectionZ: good.sectionZ,
      data: packed.data,
      quadCount: packed.quadCount,
      stride: packed.stride,
    };
    const validated = validateMeshSectionResult(structuredClone(envelope));
    expect(validated.packed).toBeDefined();
    expect(validated.packed!.quadCount).toBe(packed.quadCount);
    expect(Array.from(validated.packed!.data)).toEqual(Array.from(packed.data));
    expect(() =>
      validateMeshSectionResult({ ...envelope, quadCount: packed.quadCount + 1 }),
    ).toThrow();
    expect(() => validateMeshSectionResult({ ...envelope, stride: 21 })).toThrow();
  });

  it('non-zero tintClass decodes identically on packed and direct paths', () => {
    // Hand-built quads carrying resolved 24-bit biome tint classes (072): grass green, foliage,
    // water blue, plus one untinted (class 0) quad. processMeshSectionRequest cannot stamp these
    // (its merge key is block id with no tint resolver), so fixtures are constructed directly.
    const cornerLight = { sky: 15, block: 3 };
    const makeQuad = (tintClass: number): OpaqueFaceQuad => ({
      x: 0,
      y: 0,
      z: 0,
      width: 2,
      height: 1,
      blockId: 1,
      face: 'up',
      vertexLights: [cornerLight, cornerLight, cornerLight, cornerLight],
      vertexAO: [3, 3, 2, 2],
      tintClass,
    });
    const quads = [
      makeQuad(0x7cbd6b), // grass green
      makeQuad(0x48b518), // foliage
      makeQuad(0x3f76e4), // water blue
      makeQuad(0), // untinted white
    ];

    const capture: Capture = { byName: {} };
    expandPackedMeshResult(packQuadsToTypedArrays(quads), makeInfo(capture));
    const expanded = {} as Record<MeshStreamName, MeshStreamData>;
    for (const name of MESH_STREAM_NAMES) expanded[name] = capture.byName[name] ?? emptyMeshStream();

    expectStreamsEqual(directStreams(quads), expanded);

    // Explicit expectations: class 0 → white; others decode as id>>16 / >>8 / &255 over 255.
    // tintClass rides a Float32Array and the decoded tint attribute is Float32Array as well,
    // so expectations are compared through Math.fround.
    const tints = Array.from(expanded.opaque!.tint);
    const decoded = (id: number, i: number): number =>
      Math.fround((((id) >> (16 - (i % 3) * 8)) & 255) / 255);
    expect(tints.slice(0, 12)).toEqual(new Array(12).fill(0).map((_, i) => decoded(0x7cbd6b, i)));
    expect(tints.slice(12, 24)).toEqual(new Array(12).fill(0).map((_, i) => decoded(0x48b518, i)));
    expect(tints.slice(24, 36)).toEqual(new Array(12).fill(0).map((_, i) => decoded(0x3f76e4, i)));
    expect(tints.slice(36, 48)).toEqual(new Array(12).fill(1));
  });
});
