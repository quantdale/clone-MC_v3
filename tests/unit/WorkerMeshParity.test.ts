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
import { ChunkMesher } from '../../src/world/ChunkMesher';
import { ChunkSection } from '../../src/world/ChunkSection';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { tileUV, type TextureAtlas } from '../../src/rendering/TextureAtlas';
import { meshFluidSurface } from '../../src/rendering/FluidSurfaceMesher';
import { createFluidState } from '../../src/world/FluidState';



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

const REFERENCE_REGISTRY = createDefaultBlockRegistry();
const REFERENCE_STATE_REGISTRY = createDefaultBlockStateRegistry();
const REFERENCE_ATLAS = { uv: (tile: number) => tileUV(tile) } as unknown as TextureAtlas;
const FACE_NAMES: readonly OpaqueFaceQuad['face'][] = ['up', 'down', 'north', 'south', 'east', 'west'];

function referenceUvFor(blockId: number, faceIndex: number): { u0: number; v0: number; u1: number; v1: number } {
  const def = REFERENCE_REGISTRY.get(blockId);
  const face = FACE_NAMES[Math.min(FACE_NAMES.length - 1, Math.max(0, Math.round(faceIndex)))]!;
  const tile = face === 'up' ? def.topTile : face === 'down' ? def.bottomTile : def.sideTile;
  return REFERENCE_ATLAS.uv(tile);
}

function referenceLayerOf(blockId: number): MeshStreamName {
  if (blockId === BlockId.Leaves) return 'cutout';
  if (blockId === BlockId.Glass) return 'translucent';
  if (blockId === BlockId.Water) return 'fluid';
  return 'opaque';
}

function referenceLayerTable(): number[] {
  const layers = new Array(64).fill(0);
  layers[BlockId.Leaves] = 1;
  layers[BlockId.Glass] = 2;
  layers[BlockId.Water] = 3;
  return layers;
}

function referenceLightSampler(payload: MeshSectionRequestPayload) {
  return {
    inBounds: (x: number, y: number, z: number) => x >= 0 && x < 16 && y >= 0 && y < 16 && z >= 0 && z < 16,
    isOpaque: (x: number, y: number, z: number) => {
      if (x < 0 || x >= 16 || y < 0 || y >= 16 || z < 0 || z >= 16) return false;
      return payload.opaqueIds.includes(payload.cells[x + y * 16 + z * 256] ?? -1);
    },
    getSkyLight: (x: number, y: number, z: number) =>
      x >= 0 && x < 16 && y >= 0 && y < 16 && z >= 0 && z < 16 ? payload.skyLight[x + y * 16 + z * 256]! : 0,
    getBlockLight: (x: number, y: number, z: number) =>
      x >= 0 && x < 16 && y >= 0 && y < 16 && z >= 0 && z < 16 ? payload.blockLight[x + y * 16 + z * 256]! : 0,
  };
}

function referenceTintRgb(payload: MeshSectionRequestPayload, blockId: number): [number, number, number] {
  const first = payload.cells.findIndex((id) => id === blockId);
  return packedTintRgb(first >= 0 ? payload.tintClasses?.[first] ?? 0 : 0);
}

function streamsFromQuads(
  quads: readonly OpaqueFaceQuad[],
  layerOf: (blockId: number) => MeshStreamName,
  uvOf: (blockId: number, faceIndex: number) => { u0: number; v0: number; u1: number; v1: number },
): Record<MeshStreamName, MeshStreamData> {
  const builder = new MeshBuildResultBuilder();
  for (const quad of quads) {
    const sb = builder.builder(layerOf(quad.blockId));
    const { corners, normal, faceIndex } = packedQuadGeometryInputs(quad);
    const uv = uvOf(quad.blockId, faceIndex);
    const cornerUv: ReadonlyArray<readonly [number, number]> = [
      [uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1],
    ];
    for (let c = 0; c < 4; c++) {
      const [x, y, z] = corners[c]!;
      const light = quad.vertexLights[c]!;
      sb.pushVertex(x, y, z, normal[0], normal[1], normal[2], cornerUv[c]![0], cornerUv[c]![1],
        light.sky, light.block, quad.vertexAO[c]!, ...packedTintRgb(quad.tintClass ?? 0));
    }
    sb.pushQuadIndices(sb.vertexCount - 1);
  }
  return builder.build(quads.length).streams;
}

function workerTextureTiles(): NonNullable<MeshSectionRequestPayload['textureTiles']> {
  const topTileById = new Array<number>(64).fill(0);
  const bottomTileById = new Array<number>(64).fill(0);
  const sideTileById = new Array<number>(64).fill(0);
  for (const definition of REFERENCE_REGISTRY.all()) {
    topTileById[definition.id] = definition.topTile ?? 0;
    bottomTileById[definition.id] = definition.bottomTile ?? 0;
    sideTileById[definition.id] = definition.sideTile ?? 0;
  }
  return { topTileById, bottomTileById, sideTileById };
}

function typedQuadSignatures(stream: MeshStreamData): string[] {
  const signatures: string[] = [];
  for (let vertex = 0; vertex < stream.vertexCount; vertex += 4) {
    signatures.push(JSON.stringify({
      positions: Array.from(stream.positions.slice(vertex * 3, (vertex + 4) * 3)),
      normals: Array.from(stream.normals.slice(vertex * 3, (vertex + 4) * 3)),
      uvs: Array.from(stream.uvs.slice(vertex * 2, (vertex + 4) * 2)),
      skyLight: Array.from(stream.skyLight.slice(vertex, vertex + 4)),
      blockLight: Array.from(stream.blockLight.slice(vertex, vertex + 4)),
      ao: Array.from(stream.ao.slice(vertex, vertex + 4)),
      tint: Array.from(stream.tint.slice(vertex * 3, (vertex + 4) * 3)),
      indices: Array.from(stream.indices.slice((vertex / 4) * 6, (vertex / 4 + 1) * 6),
      ).map((index) => index - vertex),
    }));
  }
  return signatures.sort();
}

function realRegistryPayload(): MeshSectionRequestPayload {
  const fluidLevels = new Array<number>(4096).fill(-1);
  const tintClasses = new Array<number>(4096).fill(0);
  const payload: MeshSectionRequestPayload = {
    sectionX: 0,
    sectionY: 0,
    sectionZ: 0,
    cells: new Array(4096).fill(null),
    opaqueIds: [BlockId.Stone],
    layerById: referenceLayerTable(),
    fluidLevels,
    tintClasses,
    skyLight: new Array(4096).fill(15),
    blockLight: new Array(4096).fill(0),
  };
  payload.cells[0] = BlockId.Stone;
  payload.cells[4] = BlockId.Leaves;
  payload.cells[8] = BlockId.Glass;
  payload.cells[18] = BlockId.Water;
  fluidLevels[18] = 0;
  tintClasses[4] = 0x5aa85a;
  tintClasses[18] = 0x3f76e4;
  payload.translucentSortOrigin = [0, 0, 0];
  payload.textureTiles = workerTextureTiles();
  return payload;
}

function referenceStreams(payload: MeshSectionRequestPayload): Record<MeshStreamName, MeshStreamData> {
  const section = new ChunkSection(0, REFERENCE_STATE_REGISTRY);
  for (let i = 0; i < payload.cells.length; i++) {
    const id = payload.cells[i];
    if (id !== null && id !== undefined && id !== BlockId.Air) {
      section.set(i, REFERENCE_STATE_REGISTRY.getDefaultState(id));
    }
  }
  const mesher = new ChunkMesher({ registry: REFERENCE_REGISTRY, atlas: REFERENCE_ATLAS });
  const result = mesher.meshSection(0, 0, 0, section, () => REFERENCE_STATE_REGISTRY.getDefaultState(BlockId.Air), {
    renderLayerOf: referenceLayerOf,
    lightSampler: referenceLightSampler(payload),
    tintRgbOf: (id) => referenceTintRgb(payload, id),
  });
  const streams = { ...result.streams.streams };
  const fluidWorld = {
    getFluidState: (x: number, y: number, z: number) => {
      if (x < 0 || x >= 16 || y < 0 || y >= 16 || z < 0 || z >= 16) return null;
      const index = x + y * 16 + z * 256;
      const id = payload.cells[index];
      const level = payload.fluidLevels?.[index] ?? -1;
      return id === BlockId.Water && level >= 0 ? createFluidState(BlockId.Water, level) : null;
    },
  };
  const fluidQuads: OpaqueFaceQuad[] = [];
  for (let i = 0; i < payload.cells.length; i++) {
    if (payload.cells[i] !== BlockId.Water) continue;
    const x = i & 15;
    const y = (i >> 4) & 15;
    const z = i >> 8;
    fluidQuads.push(...meshFluidSurface(fluidWorld, BlockId.Water, referenceLightSampler(payload), x, y, z));
  }
  streams.fluid = streamsFromQuads(fluidQuads.map((quad) => ({
    ...quad,
    tintClass: payload.tintClasses?.[18] ?? 0,
  })), () => 'fluid', referenceUvFor).fluid;
  return streams;
}


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
      [uv.u1, uv.v1],
      [uv.u0, uv.v1],
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
    expect(Array.from(a[name]!.tint), `${name} tint`).toEqual(Array.from(b[name]!.tint));
    expect(Array.from(a[name]!.indices), `${name} indices`).toEqual(Array.from(b[name]!.indices));
  }
}

function quadSignatures(stream: MeshStreamData): string[] {
  const signatures: string[] = [];
  for (let vertex = 0; vertex < stream.vertexCount; vertex += 4) {
    signatures.push(JSON.stringify({
      positions: Array.from(stream.positions.slice(vertex * 3, (vertex + 4) * 3)),
      normals: Array.from(stream.normals.slice(vertex * 3, (vertex + 4) * 3)),
      uvs: Array.from(stream.uvs.slice(vertex * 2, (vertex + 4) * 2)),
      skyLight: Array.from(stream.skyLight.slice(vertex, vertex + 4)),
      blockLight: Array.from(stream.blockLight.slice(vertex, vertex + 4)),
      ao: Array.from(stream.ao.slice(vertex, vertex + 4)),
      tint: Array.from(stream.tint.slice(vertex * 3, (vertex + 4) * 3)),
      indices: [0, 1, 2, 0, 2, 3],
    }));
  }
  return signatures.sort();
}

function expectCanonicalStreamsEqual(
  reference: Record<MeshStreamName, MeshStreamData>,
  worker: Record<MeshStreamName, MeshStreamData>,
): void {
  for (const name of MESH_STREAM_NAMES) {
    expect(quadSignatures(worker[name]!), `${name} canonical quads`).toEqual(quadSignatures(reference[name]!));
  }
}

describe('worker packed-mesh path parity (P10)', () => {
  it('matches the synchronous reference mesher for real mixed render layers', () => {
    const payload = realRegistryPayload();
    const workerQuads = processMeshSectionRequest(payload).quads;
    const capture: Capture = { byName: {} };
    expandPackedMeshResult(packQuadsToTypedArrays(workerQuads), {
      uvFor: referenceUvFor,
      renderLayerOf: referenceLayerOf,
      buildGeometry: (stream, name) => {
        capture.byName[name] = stream;
        return null;
      },
    });
    const workerStreams = {} as Record<MeshStreamName, MeshStreamData>;
    for (const name of MESH_STREAM_NAMES) workerStreams[name] = capture.byName[name] ?? emptyMeshStream();
    expectCanonicalStreamsEqual(referenceStreams(payload), workerStreams);
    expect(workerQuads.map((quad) => quad.renderStream)).toEqual([
      ...workerQuads.filter((quad) => quad.renderStream === 'opaque').map(() => 'opaque'),
      ...workerQuads.filter((quad) => quad.renderStream === 'cutout').map(() => 'cutout'),
      ...workerQuads.filter((quad) => quad.renderStream === 'translucent').map(() => 'translucent'),
      ...workerQuads.filter((quad) => quad.renderStream === 'fluid').map(() => 'fluid'),
    ]);
  });

  it('direct typed worker streams match the independent reference attributes', () => {
    const payload = realRegistryPayload();
    const workerResult = processMeshSectionRequest(payload);
    expect(workerResult.layerStreams).toBeDefined();
    const workerStreams = workerResult.layerStreams!;
    const reference = referenceStreams(payload);

    for (const name of MESH_STREAM_NAMES) {
      const worker = workerStreams[name];
      const expected = reference[name]!;
      expect(worker.quadCount, `${name} quadCount`).toBe(expected.vertexCount / 4);
      expect(worker.vertexCount, `${name} vertexCount`).toBe(expected.vertexCount);
      expect(worker.indexCount, `${name} indexCount`).toBe(expected.indexCount);
      expect(typedQuadSignatures(worker), `${name} canonical typed quads`).toEqual(
        quadSignatures(expected),
      );
    }
  });

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

  it('packed stream identity overrides registry fallback and is strictly validated', () => {
    const cornerLight = { sky: 15, block: 0 };
    const quad: OpaqueFaceQuad = {
      x: 0,
      y: 0,
      z: 0,
      width: 1,
      height: 1,
      blockId: 1,
      face: 'up',
      vertexLights: [cornerLight, cornerLight, cornerLight, cornerLight],
      vertexAO: [3, 3, 3, 3],
      renderStream: 'fluid',
    };
    const packed = packQuadsToTypedArrays([quad]);
    expect(packed.streamNames).toEqual(['fluid']);
    const capture: Capture = { byName: {} };
    expandPackedMeshResult(packed, makeInfo(capture));
    expect(capture.byName.fluid?.vertexCount).toBe(4);
    expect(capture.byName.fluid?.indexCount).toBe(6);
    expect(capture.byName.opaque).toBeUndefined();

    const envelope = {
      sectionX: 0,
      sectionY: 0,
      sectionZ: 0,
      data: packed.data,
      quadCount: packed.quadCount,
      stride: packed.stride,
      streamNames: packed.streamNames,
    };
    expect(validateMeshSectionResult(structuredClone(envelope)).packed?.streamNames).toEqual(['fluid']);
    expect(() => validateMeshSectionResult({ ...envelope, streamNames: ['not-a-stream'] })).toThrow(/streamNames/);
    expect(() => validateMeshSectionResult({ ...envelope, streamNames: [] })).toThrow(/streamNames/);
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
