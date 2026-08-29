/**
 * Worker section meshing (065). `processMeshSectionRequest` is a pure, structured-clone-safe job the
 * worker executes: it turns a section's plain cells/opacity/light data into merged, lit
 * `OpaqueFaceQuad`s via 062 + 070. `MeshWorkerClient` is the main-thread side over the unified
 * versioned protocol (`WorkerJobProtocol`, v2): it resolves results exactly once, rejects stale
 * results (unknown/cancelled ids or superseded `generationToken`) before any callback fires, and can
 * run either detached (synchronous harness mode) or backed by a shared `WorkerPool` of real workers.
 *
 * Main-thread responsibilities that remain here (audit 04): creating Three.js geometry from the
 * transferred typed arrays, GPU upload, and disposing replaced geometry after a safe swap. The
 * worker never touches THREE.
 */
import {
  UNVERSIONED_TOKEN,
  WORKER_PROTOCOL_VERSION,
  WorkerJobClient,
  validateWorkerResult,
  type ResolvedOutcome,
  type WorkerResult,
} from './WorkerJobProtocol';
import type { MeshWorkerRegistryTable } from './MeshWorkerRegistry';
import {
  type MeshSectionTransferPayload,
  normalizeMeshSectionTransfer,
  validateMeshSectionTransferOwnership,
  collectMeshSectionTransferables,
} from './MeshSectionTransfer';
import {
  DEFAULT_MAX_MESH_RESULT_BYTES,
  DEFAULT_MAX_MESH_RESULT_QUADS,
  DEFAULT_MAX_MESH_RESULT_VERTICES,
  typedMeshStreamByteLength,
  validateTypedMeshLayerStreams,
  type TypedMeshLayerStreams,
} from './TypedMeshStreams';
import {
  MESH_STREAM_NAMES,
  MeshBuildResultBuilder,
  emitQuad,
} from '../world/MeshingTypes';
import type { WorkerPool } from '../engine/WorkerPool';
import {
  greedyMergeOpaqueFaces,
  type FaceCellSampler,
  type LightSampler,
  type OpaqueFaceQuad,
} from './GreedyMesher';
import type { ModelFace } from '../data/BlockModel';
import type * as THREE from 'three';
import type { MeshStreamData, MeshStreamName, UvRect } from '../world/MeshingTypes';
import { meshFluidSurfaceInto } from './FluidSurfaceMesher';
import { createFluidState } from '../world/FluidState';
import { sortTranslucentBackToFront } from './TranslucentGeometry';
import { quadVertexAO } from './AmbientOcclusion';
import { quadVertexLights, inPlaneAxes, type FaceLightContext } from './VertexLighting';
import {
  validateSectionVersionSnapshot,
  sectionVersionSnapshotsEqual,
  type SectionVersionSnapshot,
} from '../world/SectionVersionSnapshot';
import {
  SAMPLE_ABSENT,
  SAMPLE_OUT_OF_BOUNDS,
  SAMPLE_PRESENT,
  type SectionHaloFace,
} from '../world/SectionSnapshot';

const SECTION = 16;
const HALO_FACE_AREA = SECTION * SECTION;
const HALO_FACES: readonly SectionHaloFace[] = ['west', 'east', 'down', 'up', 'north', 'south'];
type NumericArray = number[] | Uint8Array | Uint16Array | Uint32Array | Int8Array;
type CellArray = Array<number | null> | Uint16Array;

function isArrayLike(value: unknown): value is { length: number; [index: number]: number | null } {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

/** One explicit 16×16 face-neighbor halo in worker-safe structured-clone or typed form. */
export interface MeshSectionHaloPayload {
  availability: NumericArray;
  cells: Array<number | null> | Uint16Array;
  skyLight: NumericArray;
  blockLight: NumericArray;
  /** Fluid level per halo cell; -1 means no fluid state. */
  fluidLevels?: NumericArray;
}

/** Numeric layer table values used in structured-clone payloads. */
export const MESH_LAYER_OPAQUE = 0;
export const MESH_LAYER_CUTOUT = 1;
export const MESH_LAYER_TRANSLUCENT = 2;
export const MESH_LAYER_FLUID = 3;


/** The six face-neighbor halos required by a section mesh request. */
export type MeshSectionHaloMap = Record<SectionHaloFace, MeshSectionHaloPayload>;

/** Create a compatibility halo whose every face is explicitly exposed. */
export function createEmptySectionHalo(): MeshSectionHaloMap {
  return Object.fromEntries(HALO_FACES.map((face) => [face, {
    availability: new Array(HALO_FACE_AREA).fill(SAMPLE_OUT_OF_BOUNDS),
    cells: new Array<number | null>(HALO_FACE_AREA).fill(null),
    skyLight: new Array(HALO_FACE_AREA).fill(0),
    blockLight: new Array(HALO_FACE_AREA).fill(0),
    fluidLevels: new Array(HALO_FACE_AREA).fill(-1),
  }])) as MeshSectionHaloMap;
}

/** A section-meshing job request after boundary validation. */
export interface MeshSectionRequestPayload {
  sectionX: number;
  sectionY: number;
  sectionZ: number;
  /** Canonical mesh/light versions captured at submission, including face neighbors. */
  versionSnapshot?: SectionVersionSnapshot;
  /** 4096 world-cell block ids; 0 = air. Index = x + 16*(y + 16*z). */
  cells: CellArray;
  /** Immutable registry classification table identity installed once in each worker. */
  registryTableId?: string;
  /** Block ids treated as opaque by the normalized meshing path. */
  opaqueIds: NumericArray;
  /** Optional numeric layer table indexed by block id. */
  layerById?: NumericArray;
  /** Worker-safe texture tile metadata installed with the immutable registry table. */
  textureTiles?: {
    topTileById: readonly number[];
    bottomTileById: readonly number[];
    sideTileById: readonly number[];
  };
  /** 4096 per-cell fluid levels; -1 means no fluid state. */
  fluidLevels?: NumericArray;
  /** Optional resolved tint class per target cell. */
  tintClasses?: NumericArray;
  /** Optional camera/world origin used for deterministic translucent ordering. */
  translucentSortOrigin?: [number, number, number];
  /** 4096 per-cell sky light values in [0, 15] (070). */
  skyLight: NumericArray;
  /** 4096 per-cell block light values in [0, 15] (070). */
  blockLight: NumericArray;
  /** Six explicit one-voxel face halos; optional only for legacy pre-255 callers. */
  halo?: MeshSectionHaloMap;
  /** Typed section/halo buffers used by production worker transport. */
  transferData?: MeshSectionTransferPayload;
}

/** Transport shape: legacy arrays remain accepted for synchronous compatibility; production uses transferData. */
export type MeshSectionRequestTransport = Omit<MeshSectionRequestPayload,
  'cells' | 'opaqueIds' | 'layerById' | 'fluidLevels' | 'tintClasses' | 'skyLight' | 'blockLight' | 'halo' | 'transferData'> & {
  cells?: CellArray;
  opaqueIds?: NumericArray;
  layerById?: NumericArray;
  fluidLevels?: NumericArray;
  tintClasses?: NumericArray;
  skyLight?: NumericArray;
  blockLight?: NumericArray;
  halo?: MeshSectionHaloMap;
  transferData?: MeshSectionTransferPayload;
};

/** A section-meshing job result (quad form, as produced by `processMeshSectionRequest`). */
export interface MeshSectionResultPayload {
  sectionX: number;
  sectionY: number;
  sectionZ: number;
  /** The exact canonical versions captured by the submitting mesh job. */
  versionSnapshot?: SectionVersionSnapshot;
  quads: OpaqueFaceQuad[];
  /** Version/generation token echoed from the request (present on pooled results). */
  generationToken?: number;
  /**
   * Packed typed-array form of `quads` (worker-entry transport). When present the
   * main thread expands it directly and `quads` is empty.
   */
  /**
   * Packed typed-array form of `quads` (legacy worker transport). When present the
   * main thread expands it directly and `quads` is empty.
   */
  packed?: PackedMeshResult;
  /** Worker-produced GPU-ready typed streams; present for the task-7 transport path. */
  layerStreams?: TypedMeshLayerStreams;
}

const MODEL_FACE_KEYS: ReadonlySet<string> = new Set(['up', 'down', 'north', 'south', 'east', 'west']);

function isLightChannel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 15;
}

/**
 * Validate an untyped worker result as a {@link MeshSectionResultPayload}; throws on any invalid
 * field. Structural discipline for both pooled results and detached `handleMessage` input, so a
 * malformed or foreign payload can never reach a mesh callback.
 */
export function validateMeshSectionResult(input: unknown): MeshSectionResultPayload {
  if (typeof input !== 'object' || input === null) {
    throw new Error('MeshSectionResult: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (!Number.isInteger(r.sectionX) || !Number.isInteger(r.sectionY) || !Number.isInteger(r.sectionZ)) {
    throw new Error('MeshSectionResult: section coordinates must be integers');
  }
  return {
    sectionX: r.sectionX as number,
    sectionY: r.sectionY as number,
    sectionZ: r.sectionZ as number,
    versionSnapshot: r.versionSnapshot === undefined
      ? undefined
      : validateSectionVersionSnapshot(r.versionSnapshot),
    ...validateResultBody(r),
  };
}

function isMeshStreamName(value: unknown): value is MeshStreamName {
  return value === 'opaque' || value === 'cutout' || value === 'translucent' || value === 'fluid';
}

function validatePackedStreamNames(value: unknown, quadCount: number): MeshStreamName[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== quadCount || !value.every(isMeshStreamName)) {
    throw new Error('MeshSectionResult: streamNames must contain one valid stream per packed quad');
  }
  return value as MeshStreamName[];
}

/**
 * Validate the body of a mesh result after envelope identity checks: either the quad form
 * (`quads`) or the packed typed-array form (`data`/`quadCount`/`stride`, produced by the
 * worker entry). Throws on any invalid field.
 */
function validateResultBody(
  r: Record<string, unknown>,
): { quads: OpaqueFaceQuad[] } | { quads: OpaqueFaceQuad[]; packed: PackedMeshResult } | { quads: OpaqueFaceQuad[]; layerStreams: TypedMeshLayerStreams } {
  if (r.layerStreams !== undefined) {
    if (r.data !== undefined || r.quadCount !== undefined || r.stride !== undefined) {
      throw new Error('MeshSectionResult: packed and layerStreams payloads are mutually exclusive');
    }
    return {
      quads: [],
      layerStreams: validateTypedMeshLayerStreams(r.layerStreams, {
        maxBytes: DEFAULT_MAX_MESH_RESULT_BYTES,
        maxQuads: DEFAULT_MAX_MESH_RESULT_QUADS,
        maxVertices: DEFAULT_MAX_MESH_RESULT_VERTICES,
      }),
    };
  }
  if (r.data !== undefined || r.quadCount !== undefined || r.stride !== undefined) {
    if (!(r.data instanceof Float32Array)) {
      throw new Error('MeshSectionResult: packed data must be a Float32Array');
    }
    if (!Number.isInteger(r.quadCount) || (r.quadCount as number) < 0) {
      throw new Error('MeshSectionResult: quadCount must be a non-negative integer');
    }
    if ((r.quadCount as number) > DEFAULT_MAX_MESH_RESULT_QUADS) {
      throw new Error('MeshSectionResult: quadCount exceeds the configured cap');
    }
    if (r.stride !== PACKED_QUAD_STRIDE) {
      throw new Error(`MeshSectionResult: stride must be ${PACKED_QUAD_STRIDE}`);
    }
    if ((r.data as Float32Array).length !== (r.quadCount as number) * PACKED_QUAD_STRIDE) {
      throw new Error('MeshSectionResult: packed data length must equal quadCount * stride');
    }
    if (r.data.byteLength > DEFAULT_MAX_MESH_RESULT_BYTES) {
      throw new Error('MeshSectionResult: packed data exceeds the configured byte cap');
    }
    const streamNames = validatePackedStreamNames(r.streamNames, r.quadCount as number);
    return {
      quads: [],
      packed: {
        data: r.data as Float32Array,
        quadCount: r.quadCount as number,
        stride: PACKED_QUAD_STRIDE,
        streamNames,
      },
    };
  }
  return { quads: validateQuads(r.quads) };
}

function validateQuads(rawQuads: unknown): OpaqueFaceQuad[] {
  if (!Array.isArray(rawQuads)) {
    throw new Error('MeshSectionResult: quads must be an array');
  }
  const quads: OpaqueFaceQuad[] = [];
  for (const raw of rawQuads) {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('MeshSectionResult: each quad must be an object');
    }
    const quad = raw as Record<string, unknown>;
    for (const key of ['x', 'y', 'z'] as const) {
      if (typeof quad[key] !== 'number' || !Number.isFinite(quad[key])) {
        throw new Error(`MeshSectionResult: quad.${key} must be a finite number`);
      }
    }
    for (const key of ['width', 'height'] as const) {
      if (typeof quad[key] !== 'number' || !Number.isFinite(quad[key]) || (quad[key] as number) < 0) {
        throw new Error(`MeshSectionResult: quad.${key} must be a non-negative finite number`);
      }
    }
    if (typeof quad.face !== 'string' || !MODEL_FACE_KEYS.has(quad.face)) {
      throw new Error('MeshSectionResult: quad.face must be a known model face');
    }
    if (!Array.isArray(quad.vertexLights) || (quad.vertexLights as unknown[]).length !== 4) {
      throw new Error('MeshSectionResult: quad.vertexLights must hold 4 corners');
    }
    for (const light of quad.vertexLights as unknown[]) {
      if (typeof light !== 'object' || light === null) {
        throw new Error('MeshSectionResult: each corner light must be an object');
      }
      const channel = light as Record<string, unknown>;
      if (!isLightChannel(channel.sky) || !isLightChannel(channel.block)) {
        throw new Error('MeshSectionResult: corner sky/block light must be integers in [0, 15]');
      }
    }
    if (!Array.isArray(quad.vertexAO) || (quad.vertexAO as unknown[]).length !== 4 ||
      !(quad.vertexAO as unknown[]).every((a) => typeof a === 'number' && Number.isInteger(a) && a >= 0 && a <= 3)) {
      throw new Error('MeshSectionResult: quad.vertexAO must hold 4 integers in [0, 3]');
    }
    if (quad.renderStream !== undefined && !isMeshStreamName(quad.renderStream)) {
      throw new Error('MeshSectionResult: quad.renderStream must be a known mesh stream');
    }
    quads.push(raw as OpaqueFaceQuad);
  }
  return quads;
}

/** Validate an untyped worker request payload as a {@link MeshSectionRequestPayload}. */
function validateHaloFace(name: string, value: unknown): MeshSectionHaloPayload {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`MeshSectionRequest: halo.${name} must be an object`);
  }
  const face = value as Record<string, unknown>;
  if (!Array.isArray(face.availability) || face.availability.length !== HALO_FACE_AREA ||
    !face.availability.every((entry) => entry === SAMPLE_PRESENT || entry === SAMPLE_ABSENT || entry === SAMPLE_OUT_OF_BOUNDS)) {
    throw new Error(`MeshSectionRequest: halo.${name}.availability must be 256 entries of the documented states`);
  }
  if (!Array.isArray(face.cells) || face.cells.length !== HALO_FACE_AREA ||
    !face.cells.every((entry) => entry === null || (typeof entry === 'number' && Number.isInteger(entry) && entry >= 0))) {
    throw new Error(`MeshSectionRequest: halo.${name}.cells must be 256 entries of null or non-negative integers`);
  }
  assertLightArrayLength(`halo.${name}.skyLight`, face.skyLight, HALO_FACE_AREA);
  assertLightArrayLength(`halo.${name}.blockLight`, face.blockLight, HALO_FACE_AREA);
  if (face.fluidLevels !== undefined) {
    assertFluidLevelArray(`halo.${name}.fluidLevels`, face.fluidLevels, HALO_FACE_AREA);
  }
  return {
    availability: face.availability as number[],
    cells: face.cells as Array<number | null>,
    skyLight: face.skyLight as number[],
    blockLight: face.blockLight as number[],
    fluidLevels: face.fluidLevels as number[] | undefined,
  };
}

function assertFluidLevelArray(name: string, values: unknown, length: number): asserts values is NumericArray {
  if (!isArrayLike(values) || values.length !== length) {
    throw new Error(`MeshSectionRequest: ${name} must be an array of ${length} entries`);
  }
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    if (!Number.isInteger(value) || value < -1 || value > 15) {
      throw new RangeError(`MeshSectionRequest: ${name} values must be integers in [-1, 15], got ${value} at index ${i}`);
    }
  }
}

function assertLayerTable(values: unknown): asserts values is NumericArray {
  if (!isArrayLike(values)) {
    throw new Error('MeshSectionRequest: layerById must be an array of layer integers in [0, 3]');
  }
  for (let i = 0; i < values.length; i++) {
    if (!Number.isInteger(values[i]) || values[i]! < 0 || values[i]! > MESH_LAYER_FLUID) {
      throw new Error('MeshSectionRequest: layerById must be an array of layer integers in [0, 3]');
    }
  }
}

function assertTintClasses(name: string, values: unknown, length: number): asserts values is NumericArray {
  if (!isArrayLike(values) || values.length !== length) {
    throw new Error(`MeshSectionRequest: ${name} must be an array of ${length} non-negative integers`);
  }
  for (let i = 0; i < values.length; i++) {
    if (!Number.isInteger(values[i]) || values[i]! < 0) {
      throw new Error(`MeshSectionRequest: ${name} must be an array of ${length} non-negative integers`);
    }
  }
}

function validateHalo(input: unknown): MeshSectionHaloMap {
  if (input === undefined) return createEmptySectionHalo();
  if (typeof input !== 'object' || input === null) {
    throw new Error('MeshSectionRequest: halo must be an object');
  }
  const raw = input as Record<string, unknown>;
  return Object.fromEntries(HALO_FACES.map((face) => [face, validateHaloFace(face, raw[face])])) as MeshSectionHaloMap;
}

export function validateMeshSectionRequest(
  input: unknown,
  initializedTable?: MeshWorkerRegistryTable,
): MeshSectionRequestPayload {
  if (typeof input !== 'object' || input === null) {
    throw new Error('MeshSectionRequest: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (!Number.isInteger(r.sectionX) || !Number.isInteger(r.sectionY) || !Number.isInteger(r.sectionZ)) {
    throw new Error('MeshSectionRequest: section coordinates must be integers');
  }

  const transferData = r.transferData === undefined
    ? undefined
    : normalizeMeshSectionTransfer(r.transferData as {
      cells: unknown; skyLight: unknown; blockLight: unknown; fluidLevels?: unknown;
      tintClasses?: unknown; opaqueIds?: unknown; layerById?: unknown; halo?: unknown;
    });
  if (transferData !== undefined) validateMeshSectionTransferOwnership(transferData);

  let opaqueIds: NumericArray;
  let layerById: NumericArray | undefined;
  let textureTiles: MeshSectionRequestPayload['textureTiles'];
  if (r.registryTableId !== undefined) {
    if (typeof r.registryTableId !== 'string' || r.registryTableId.length === 0) {
      throw new Error('MeshSectionRequest: registryTableId must be a non-empty string');
    }
    if (initializedTable === undefined || initializedTable.tableId !== r.registryTableId) {
      throw new Error('MeshSectionRequest: registry table is not initialized or does not match registryTableId');
    }
    if (r.opaqueIds !== undefined || r.layerById !== undefined || r.textureTiles !== undefined) {
      throw new Error('MeshSectionRequest: registry-backed requests must not repeat registry tables');
    }
    opaqueIds = initializedTable.opaqueIds as number[];
    layerById = initializedTable.layerById as number[];
    textureTiles = {
      topTileById: initializedTable.topTileById,
      bottomTileById: initializedTable.bottomTileById,
      sideTileById: initializedTable.sideTileById,
    };
  } else if (transferData !== undefined) {
    if (transferData.opaqueIds === undefined) {
      throw new Error('MeshSectionRequest: transferData.opaqueIds is required without registryTableId');
    }
    opaqueIds = transferData.opaqueIds;
    layerById = transferData.layerById;
  } else {
    if (!Array.isArray(r.opaqueIds) ||
      !r.opaqueIds.every((id) => typeof id === 'number' && Number.isInteger(id))) {
      throw new Error('MeshSectionRequest: opaqueIds must be an array of integers');
    }
    opaqueIds = r.opaqueIds as number[];
    if (r.layerById !== undefined) {
      assertLayerTable(r.layerById);
      layerById = r.layerById as number[];
    }
  }

  const cells = transferData?.cells ?? r.cells;
  const skyLight = transferData?.skyLight ?? r.skyLight;
  const blockLight = transferData?.blockLight ?? r.blockLight;
  const fluidLevels = transferData?.fluidLevels ?? r.fluidLevels;
  const tintClasses = transferData?.tintClasses ?? r.tintClasses;
  const halo = transferData?.halo ?? validateHalo(r.halo);
  if (transferData === undefined) {
    if (!Array.isArray(r.cells) || r.cells.length !== SECTION * SECTION * SECTION ||
      !r.cells.every((c) => c === null || (typeof c === 'number' && Number.isInteger(c) && c >= 0))) {
      throw new Error('MeshSectionRequest: cells must be 4096 entries of null or non-negative integers');
    }
    assertLightArray('skyLight', r.skyLight);
    assertLightArray('blockLight', r.blockLight);
    if (r.fluidLevels !== undefined) assertFluidLevelArray('fluidLevels', r.fluidLevels, SECTION * SECTION * SECTION);
    if (r.tintClasses !== undefined) assertTintClasses('tintClasses', r.tintClasses, SECTION * SECTION * SECTION);
  } else {
    if (!isArrayLike(cells) || cells.length !== SECTION * SECTION * SECTION) {
      throw new Error('MeshSectionRequest: typed cells must be 4096 entries');
    }
    assertLightArray('skyLight', skyLight);
    assertLightArray('blockLight', blockLight);
  }
  if (r.translucentSortOrigin !== undefined &&
    (!Array.isArray(r.translucentSortOrigin) || r.translucentSortOrigin.length !== 3 ||
      !r.translucentSortOrigin.every((value) => typeof value === 'number' && Number.isFinite(value)))) {
    throw new Error('MeshSectionRequest: translucentSortOrigin must hold 3 finite numbers');
  }
  return {
    sectionX: r.sectionX as number,
    sectionY: r.sectionY as number,
    sectionZ: r.sectionZ as number,
    registryTableId: r.registryTableId as string | undefined,
    versionSnapshot: r.versionSnapshot === undefined
      ? undefined
      : validateSectionVersionSnapshot(r.versionSnapshot),
    cells: cells as CellArray,
    opaqueIds,
    layerById,
    textureTiles,
    fluidLevels: fluidLevels as NumericArray | undefined,
    tintClasses: tintClasses as NumericArray | undefined,
    translucentSortOrigin: r.translucentSortOrigin as [number, number, number] | undefined,
    skyLight: skyLight as NumericArray,
    blockLight: blockLight as NumericArray,
    halo: halo as MeshSectionHaloMap,
    transferData,
  };
}

/** Canonical face index encoding used by `packQuadsToTypedArrays`. */
const FACE_INDEX: Readonly<Record<ModelFace, number>> = {
  up: 0,
  down: 1,
  north: 2,
  south: 3,
  east: 4,
  west: 5,
};

/**
 * Packed typed-array form of a mesh result, transferable as one ArrayBuffer. Layout per quad
 * (stride 22 floats): x, y, z, width, height, blockId, faceIndex (see `FACE_INDEX`), tintClass,
 * animationClass, transparencyClass, then 4 corners × (skyLight, blockLight, ao).
 */
export interface PackedMeshResult {
  data: Float32Array;
  quadCount: number;
  readonly stride: number;
  /** Parallel stream identity table; absent for legacy packed payloads. */
  streamNames?: MeshStreamName[];
}

/** Float32 stride of one packed quad. */
export const PACKED_QUAD_STRIDE = 22;

/** Pack quads into a single transferable Float32Array ready for main-thread BufferGeometry expansion. */
export function packQuadsToTypedArrays(quads: readonly OpaqueFaceQuad[]): PackedMeshResult {
  const data = new Float32Array(quads.length * PACKED_QUAD_STRIDE);
  for (let q = 0; q < quads.length; q++) {
    const quad = quads[q]!;
    const o = q * PACKED_QUAD_STRIDE;
    data[o] = quad.x;
    data[o + 1] = quad.y;
    data[o + 2] = quad.z;
    data[o + 3] = quad.width;
    data[o + 4] = quad.height;
    data[o + 5] = quad.blockId;
    data[o + 6] = FACE_INDEX[quad.face];
    data[o + 7] = quad.tintClass ?? 0;
    data[o + 8] = quad.animationClass ?? 0;
    data[o + 9] = quad.transparencyClass ?? 0;
    for (let c = 0; c < 4; c++) {
      const base = o + 10 + c * 3;
      const light = quad.vertexLights[c]!;
      data[base] = light.sky;
      data[base + 1] = light.block;
      data[base + 2] = quad.vertexAO[c]!;
    }
  }
  const streamNames = quads.some((quad) => quad.renderStream !== undefined)
    ? quads.map((quad) => quad.renderStream ?? 'opaque')
    : undefined;
  return { data, quadCount: quads.length, stride: PACKED_QUAD_STRIDE, streamNames };
}

function workerTileUv(tile: number): UvRect {
  const col = tile % 16;
  const row = Math.floor(tile / 16);
  return {
    u0: col / 16,
    v0: 1 - (row + 1) / 4,
    u1: (col + 1) / 16,
    v1: 1 - row / 4,
  };
}

function workerTileForFace(
  tiles: NonNullable<MeshSectionRequestPayload['textureTiles']>,
  blockId: number,
  faceIndex: number,
): number {
  if (faceIndex === 0) return tiles.topTileById[blockId] ?? 0;
  if (faceIndex === 1) return tiles.bottomTileById[blockId] ?? 0;
  return tiles.sideTileById[blockId] ?? 0;
}

/**
 * Convert worker quads into four independent GPU-ready typed streams. The same quad corner,
 * lighting, AO, tint, and UV conventions as the synchronous mesher are used; no THREE objects
 * or registry definitions cross the worker boundary.
 */
export function packQuadsToTypedLayerStreams(
  quads: readonly OpaqueFaceQuad[],
  textureTiles: NonNullable<MeshSectionRequestPayload['textureTiles']>,
): TypedMeshLayerStreams {
  const builder = new MeshBuildResultBuilder();
  for (const quad of quads) {
    const streamName = quad.renderStream ?? 'opaque';
    const { corners, normal, faceIndex } = packedQuadGeometryInputs(quad);
    const uv = workerTileUv(workerTileForFace(textureTiles, quad.blockId, faceIndex));
    const tint = packedTintRgb(quad.tintClass ?? 0);
    emitQuad(builder.builder(streamName), corners, normal[0], normal[1], normal[2], uv,
      quad.vertexLights, quad.vertexAO, tint[0], tint[1], tint[2]);
  }
  const built = builder.build(0);
  const streams = {} as Record<MeshStreamName, TypedMeshLayerStreams[MeshStreamName]>;
  for (const name of MESH_STREAM_NAMES) {
    const stream = built.streams[name];
    streams[name] = {
      ...stream,
      quadCount: built.metadata[name].quadCount,
      byteLength: typedMeshStreamByteLength(stream),
    };
  }
  return validateTypedMeshLayerStreams(streams, {
    maxBytes: DEFAULT_MAX_MESH_RESULT_BYTES,
    maxQuads: DEFAULT_MAX_MESH_RESULT_QUADS,
    maxVertices: DEFAULT_MAX_MESH_RESULT_VERTICES,
  });
}

function assertLightArrayLength(name: string, values: unknown, length: number): asserts values is NumericArray {
  if (!isArrayLike(values) || values.length !== length) {
    throw new Error(`MeshSectionRequest: ${name} must be an array of ${length} entries`);
  }
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    if (!Number.isInteger(value) || value < 0 || value > 15) {
      throw new RangeError(`MeshSectionRequest: ${name} values must be integers in [0, 15], got ${value} at index ${i}`);
    }
  }
}

function assertLightArray(name: string, values: unknown): asserts values is NumericArray {
  assertLightArrayLength(name, values, SECTION * SECTION * SECTION);
}


function haloCoordinate(
  halo: MeshSectionHaloMap,
  x: number,
  y: number,
  z: number,
): { face: MeshSectionHaloPayload; index: number } | null {
  if (x === -1 && y >= 0 && y < SECTION && z >= 0 && z < SECTION) {
    return { face: halo.west, index: y * SECTION + z };
  }
  if (x === SECTION && y >= 0 && y < SECTION && z >= 0 && z < SECTION) {
    return { face: halo.east, index: y * SECTION + z };
  }
  if (y === -1 && x >= 0 && x < SECTION && z >= 0 && z < SECTION) {
    return { face: halo.down, index: z * SECTION + x };
  }
  if (y === SECTION && x >= 0 && x < SECTION && z >= 0 && z < SECTION) {
    return { face: halo.up, index: z * SECTION + x };
  }
  if (z === -1 && x >= 0 && x < SECTION && y >= 0 && y < SECTION) {
    return { face: halo.north, index: y * SECTION + x };
  }
  if (z === SECTION && x >= 0 && x < SECTION && y >= 0 && y < SECTION) {
    return { face: halo.south, index: y * SECTION + x };
  }
  return null;
}

function sectionCoordinate(
  payload: MeshSectionRequestPayload,
  x: number,
  y: number,
  z: number,
): { cell: number | null; sky: number; block: number; fluidLevel: number; inBounds: boolean } | null {
  if (x >= 0 && x < SECTION && y >= 0 && y < SECTION && z >= 0 && z < SECTION) {
    const index = x + y * SECTION + z * SECTION * SECTION;
    return {
      cell: payload.cells[index] ?? null,
      sky: payload.skyLight[index] ?? 0,
      block: payload.blockLight[index] ?? 0,
      fluidLevel: payload.fluidLevels?.[index] ?? -1,
      inBounds: true,
    };
  }
  const mapped = haloCoordinate(payload.halo ?? createEmptySectionHalo(), x, y, z);
  if (mapped === null) return null;
  const { face, index } = mapped;
  return {
    cell: face.cells[index] ?? null,
    sky: face.skyLight[index] ?? 0,
    block: face.blockLight[index] ?? 0,
    fluidLevel: face.fluidLevels?.[index] ?? -1,
    inBounds: face.availability[index] !== SAMPLE_OUT_OF_BOUNDS,
  };
}

/** Build a section-local light sampler over a validated payload (070/255). */
export function sectionLightSampler(payload: MeshSectionRequestPayload): LightSampler {
  const opaque = new Set(payload.opaqueIds);
  const layerOf = (id: number): number => payload.layerById?.[id] ?? (opaque.has(id) ? MESH_LAYER_OPAQUE : MESH_LAYER_TRANSLUCENT);
  return {
    inBounds: (x, y, z) => sectionCoordinate(payload, x, y, z)?.inBounds ?? false,
    isOpaque: (x, y, z) => {
      const value = sectionCoordinate(payload, x, y, z);
      return value?.cell !== null && value?.cell !== undefined && layerOf(value.cell) === MESH_LAYER_OPAQUE;
    },
    getSkyLight: (x, y, z) => sectionCoordinate(payload, x, y, z)?.sky ?? 0,
    getBlockLight: (x, y, z) => sectionCoordinate(payload, x, y, z)?.block ?? 0,
  };
}

const CUBE_FACES: ReadonlyArray<{
  face: ModelFace;
  dx: number;
  dy: number;
  dz: number;
  axis: 0 | 1 | 2;
  isMax: boolean;
  xOffset: number;
  yOffset: number;
  zOffset: number;
  widthAxis: 0 | 1 | 2;
  heightAxis: 0 | 1 | 2;
}> = [
  { face: 'east', dx: 1, dy: 0, dz: 0, axis: 0, isMax: true, xOffset: 1, yOffset: 0, zOffset: 0, widthAxis: 2, heightAxis: 1 },
  { face: 'west', dx: -1, dy: 0, dz: 0, axis: 0, isMax: false, xOffset: 0, yOffset: 0, zOffset: 0, widthAxis: 2, heightAxis: 1 },
  { face: 'up', dx: 0, dy: 1, dz: 0, axis: 1, isMax: true, xOffset: 0, yOffset: 1, zOffset: 0, widthAxis: 0, heightAxis: 2 },
  { face: 'down', dx: 0, dy: -1, dz: 0, axis: 1, isMax: false, xOffset: 0, yOffset: 0, zOffset: 0, widthAxis: 0, heightAxis: 2 },
  { face: 'south', dx: 0, dy: 0, dz: 1, axis: 2, isMax: true, xOffset: 0, yOffset: 0, zOffset: 1, widthAxis: 0, heightAxis: 1 },
  { face: 'north', dx: 0, dy: 0, dz: -1, axis: 2, isMax: false, xOffset: 0, yOffset: 0, zOffset: 0, widthAxis: 0, heightAxis: 1 },
];

function layerForId(payload: MeshSectionRequestPayload, id: number | null): number {
  if (id === null || id === 0) return -1;
  if (payload.layerById !== undefined) return payload.layerById[id] ?? MESH_LAYER_OPAQUE;
  return payload.opaqueIds.includes(id) ? MESH_LAYER_OPAQUE : MESH_LAYER_TRANSLUCENT;
}

function cubeQuad(
  light: LightSampler,
  face: (typeof CUBE_FACES)[number],
  x: number,
  y: number,
  z: number,
  blockId: number,
  tintClass: number,
): OpaqueFaceQuad {
  const [uAxis, vAxis] = inPlaneAxes(face.axis);
  const cellAxis = face.axis === 0 ? x : face.axis === 1 ? y : z;
  const planeCoord = cellAxis + (face.isMax ? 1 : 0);
  const minU = uAxis === 0 ? x : uAxis === 1 ? y : z;
  const minV = vAxis === 0 ? x : vAxis === 1 ? y : z;
  const ctx: FaceLightContext = {
    axis: face.axis,
    isMax: face.isMax,
    planeCoord,
    cellX: x,
    cellY: y,
    cellZ: z,
  };
  const width = 1;
  const height = 1;
  return {
    face: face.face,
    x: x + face.xOffset,
    y: y + face.yOffset,
    z: z + face.zOffset,
    width,
    height,
    blockId,
    vertexLights: quadVertexLights(light, ctx, minU, minV, width, height),
    vertexAO: quadVertexAO(light, ctx, minU, minV, width, height),
    tintClass,
  };
}

function fluidWorld(payload: MeshSectionRequestPayload): { getFluidState(x: number, y: number, z: number): ReturnType<typeof createFluidState> | null } {
  return {
    getFluidState: (x, y, z) => {
      const value = sectionCoordinate(payload, x, y, z);
      if (value?.cell === null || value?.cell === undefined || value.fluidLevel < 0) return null;
      return createFluidState(value.cell, value.fluidLevel);
    },
  };
}

function layerAwareQuads(payload: MeshSectionRequestPayload, light: LightSampler): OpaqueFaceQuad[] {
  const out: OpaqueFaceQuad[] = [];
  const cutout: OpaqueFaceQuad[] = [];
  const translucent: OpaqueFaceQuad[] = [];
  const fluid: OpaqueFaceQuad[] = [];
  const getCell: FaceCellSampler = (x, y, z) => sectionCoordinate(payload, x, y, z)?.cell ?? null;
  const tintAt = (x: number, y: number, z: number): number => payload.tintClasses?.[x + y * SECTION + z * SECTION * SECTION] ?? 0;

  // Opaque remains greedy and is emitted first.
  out.push(...greedyMergeOpaqueFaces(
    getCell,
    (id) => layerForId(payload, id) === MESH_LAYER_OPAQUE,
    (id) => String(id),
    light,
  ));
  for (const quad of out) quad.renderStream = 'opaque';

  for (let y = 0; y < SECTION; y++) {
    for (let z = 0; z < SECTION; z++) {
      for (let x = 0; x < SECTION; x++) {
        const current = sectionCoordinate(payload, x, y, z)?.cell ?? null;
        const layer = layerForId(payload, current);
        if (current === null || current === undefined || layer < MESH_LAYER_CUTOUT) continue;
        if (layer === MESH_LAYER_FLUID) {
          if (payload.fluidLevels === undefined) continue;
          const start = fluid.length;
          meshFluidSurfaceInto(fluidWorld(payload), current, light, x, y, z, fluid);
          for (let i = start; i < fluid.length; i++) {
            fluid[i]!.tintClass = tintAt(x, y, z);
            fluid[i]!.renderStream = 'fluid';
          }
          continue;
        }
        for (const face of CUBE_FACES) {
          const neighbor = sectionCoordinate(payload, x + face.dx, y + face.dy, z + face.dz)?.cell ?? null;
          const neighborLayer = layerForId(payload, neighbor);
          const visible = layer === MESH_LAYER_TRANSLUCENT
            ? neighborLayer !== MESH_LAYER_OPAQUE && neighborLayer !== MESH_LAYER_TRANSLUCENT && neighborLayer !== MESH_LAYER_FLUID
            : neighborLayer !== MESH_LAYER_OPAQUE;
          if (!visible) continue;
          const quad = cubeQuad(light, face, x, y, z, current, tintAt(x, y, z));
          quad.renderStream = layer === MESH_LAYER_CUTOUT ? 'cutout' : 'translucent';
          (layer === MESH_LAYER_CUTOUT ? cutout : translucent).push(quad);
        }
      }
    }
  }
  if (payload.translucentSortOrigin !== undefined) {
    const [cx, cy, cz] = payload.translucentSortOrigin;
    translucent.splice(0, translucent.length, ...sortTranslucentBackToFront(translucent, cx, cy, cz));
  }
  return [...out, ...cutout, ...translucent, ...fluid];
}

/**
 * Execute a section meshing job (what the worker runs). Pure and deterministic; delegates to 062
 * with a sampler built from the plain payload, the merge key = block id, and 070 light sampling.
 * The optional `generationToken` is stamped onto the result envelope.
 */
export function processMeshSectionRequest(
  payload: MeshSectionRequestPayload,
  generationToken?: number,
): MeshSectionResultPayload {
  if (!isArrayLike(payload.cells) || payload.cells.length !== SECTION * SECTION * SECTION) {
    throw new Error('MeshSectionRequest: cells must be an array of 4096 entries');
  }
  assertLightArray('skyLight', payload.skyLight);
  assertLightArray('blockLight', payload.blockLight);
  const light = sectionLightSampler(payload);
  const quads = payload.layerById === undefined
    ? greedyMergeOpaqueFaces(
      (x, y, z) => sectionCoordinate(payload, x, y, z)?.cell ?? null,
      (id) => payload.opaqueIds.includes(id),
      (id) => String(id),
      light,
    )
    : layerAwareQuads(payload, light);
  const result: MeshSectionResultPayload = {
    sectionX: payload.sectionX,
    sectionY: payload.sectionY,
    sectionZ: payload.sectionZ,
    versionSnapshot: payload.versionSnapshot,
    quads,
  };
  if (payload.textureTiles !== undefined) {
    result.layerStreams = packQuadsToTypedLayerStreams(quads, payload.textureTiles);
  }
  if (generationToken !== undefined) result.generationToken = generationToken;
  return result;
}

/**
 * Main-thread dispatcher for section meshing jobs over the unified protocol. Detached mode (no
 * pool) keeps the synchronous harness contract: callers feed validated result messages into
 * `handleMessage` themselves. Pool mode posts real worker requests and routes results back through
 * the same exactly-once resolution path.
 */
export const DEFAULT_MESH_WORKER_TIMEOUT_MS = 10_000;

export class MeshWorkerClient {
  private readonly jobs = new WorkerJobClient();
  private readonly callbacks = new Map<string, (result: MeshSectionResultPayload) => void>();
  private readonly rejectionCallbacks = new Map<string, () => void>();
  /** Submission-time token per pending job (mirrors `WorkerJobClient` state for cancellation sweeps). */
  private readonly tokens = new Map<string, number>();
  /** Submission payload per pending job (identity matching against result coordinates). */
  private readonly requests = new Map<string, MeshSectionRequestTransport>();
  /** Underlying pool correlation ids, used to cancel real worker work with the local job. */
  private readonly poolJobs = new Map<string, string>();
  /** One wall-clock timeout per pending job; cleared by every terminal path. */
  private readonly timeoutHandles = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly timeoutMs: number;
  private pool: WorkerPool | null = null;
  private generationToken = 0;

  constructor(opts: {
    pool?: WorkerPool;
    generationToken?: number;
    /** Maximum time a mesh job may remain unresolved; set to 0 only for a fully synchronous harness. */
    timeoutMs?: number;
  } = {}) {
    if (opts.pool) this.pool = opts.pool;
    if (opts.generationToken !== undefined) this.generationToken = opts.generationToken;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_MESH_WORKER_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 0) {
      throw new RangeError('MeshWorkerClient: timeoutMs must be a finite non-negative number');
    }
  }

  /** Attach a shared worker pool; subsequent requests are dispatched to real workers. */
  attachPool(pool: WorkerPool): void {
    this.pool = pool;
  }

  /**
   * Advance the version token. Pending jobs keep their old token, so their late results are
   * rejected as stale; call `cancelByToken` to also free their queue slots eagerly.
   */
  setGenerationToken(token: number): void {
    this.generationToken = token;
  }

  /** Submit a section meshing job; callbacks fire at most once. */
  requestSection(
    payload: MeshSectionRequestTransport,
    onResult: (result: MeshSectionResultPayload) => void,
    onRejected?: () => void,
  ): string {
    const token = this.generationToken;
    const normalizedTransfer = payload.transferData === undefined
      ? normalizeMeshSectionTransfer(payload)
      : payload.transferData;
    validateMeshSectionTransferOwnership(normalizedTransfer);
    const transportPayload: MeshSectionRequestTransport = {
      ...payload,
      transferData: normalizedTransfer,
      cells: undefined,
      skyLight: undefined,
      blockLight: undefined,
      fluidLevels: undefined,
      tintClasses: undefined,
      halo: undefined,
      opaqueIds: undefined,
      layerById: undefined,
    };
    const transfer = collectMeshSectionTransferables(normalizedTransfer);
    const jobId = this.jobs.submit('mesh-section', token);
    this.callbacks.set(jobId, onResult);
    if (onRejected) this.rejectionCallbacks.set(jobId, onRejected);
    this.tokens.set(jobId, token);
    this.requests.set(jobId, transportPayload);
    if (this.pool) {
      try {
        const poolJobId = this.pool.submit({
          kind: 'mesh-section',
          generationToken: token,
          payload: transportPayload,
          transfer,
          onResult: (result) => {
            // Pool payloads are untyped transport: validate structure and require section-coordinate
            // identity before anything can resolve the job.
            let validated: MeshSectionResultPayload;
            try {
              validated = validateMeshSectionResult(result);
            } catch {
              this.reject(jobId); // malformed payload can never satisfy the job
              return;
            }
            if (!this.matchesRequest(jobId, validated) || !this.matchesSnapshot(jobId, validated)) {
              this.reject(jobId); // foreign/stale identity or version snapshot must not resolve the job
              return;
            }
            this.complete(jobId, validated, token);
          },
          onFailure: () => {
            // Worker loss/dispose rejects the owning batch; late results become stale.
            this.reject(jobId);
          },
        });
        this.poolJobs.set(jobId, poolJobId);
      } catch (err) {
        // Synchronous pool rejection (bounded queue full): keep bookkeeping truthful.
        this.abandon(jobId);
        throw err;
      }
    }
    if (this.timeoutMs > 0 && this.callbacks.has(jobId)) {
      this.timeoutHandles.set(jobId, setTimeout(() => this.timeoutJob(jobId), this.timeoutMs));
    }
    return jobId;
  }

  /**
   * Handle a worker message: validate + resolve via the unified protocol, then validate payload
   * structure and require section-coordinate identity; on success invoke the job's callback once
   * and return the result. Stale/invalid/mismatched messages return `null` and invoke nothing.
   */
  handleMessage(input: unknown): MeshSectionResultPayload | null {
    const outcome: ResolvedOutcome | null = this.jobs.resolveResult(input);
    if (outcome === null) {
      // WorkerJobClient intentionally keeps generic token-mismatch jobs pending. A live mesh
      // batch, however, must settle its owner exactly once rather than leaking an in-flight job.
      try {
        const stale = validateWorkerResult(input);
        if (stale.kind === 'mesh-section' && this.rejectionCallbacks.has(stale.jobId)) {
          this.reject(stale.jobId);
        }
      } catch {
        // Invalid/unknown messages remain harmless and do not mutate pending ownership.
      }
      return null;
    }
    if (!outcome.ok || outcome.payload === undefined) {
      this.reject(outcome.jobId);
      return null;
    }

    let payload: MeshSectionResultPayload;
    try {
      payload = validateMeshSectionResult(outcome.payload);
    } catch {
      this.reject(outcome.jobId);
      return null;
    }
    if (!this.matchesRequest(outcome.jobId, payload) || !this.matchesSnapshot(outcome.jobId, payload)) {
      this.reject(outcome.jobId);
      return null;
    }
    return this.complete(outcome.jobId, payload, outcome.generationToken);
  }

  /** Reject an unresolved job after its bounded wall-clock deadline. */
  private timeoutJob(jobId: string): void {
    if (!this.callbacks.has(jobId)) return;
    const poolJobId = this.poolJobs.get(jobId);
    if (poolJobId !== undefined) this.pool?.cancel(poolJobId);
    this.reject(jobId);
  }

  /** Cancel a pending job (its late result becomes stale). */
  cancel(jobId: string): boolean {
    const poolJobId = this.poolJobs.get(jobId);
    if (poolJobId !== undefined) this.pool?.cancel(poolJobId);
    const removed = this.jobs.cancel(jobId);
    this.abandon(jobId);
    return removed;
  }

  /**
   * Cancel every pending job still carrying `generationToken`; returns how many. Use when the
   * section's block/light state changes so superseded mesh results are dropped wholesale.
   */
  cancelByToken(generationToken: number): number {
    let cancelled = 0;
    for (const [jobId, token] of this.tokens) {
      if (token === generationToken && this.cancel(jobId)) {
        cancelled++;
      }
    }
    return cancelled;
  }

  /** Number of pending (unresolved) jobs. */
  get pendingCount(): number {
    return this.jobs.pendingCount;
  }

  /**
   * Build a unified-protocol result message for `jobId` (helper for worker-side wiring and the
   * synchronous harness path). The wildcard `UNVERSIONED_TOKEN` means "resolve regardless of the
   * submission token"; real async workers must echo their request's token instead.
   */
  static resultMessage(jobId: string, payload: MeshSectionResultPayload): WorkerResult {
    return {
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId,
      kind: 'mesh-section',
      ok: true,
      generationToken: UNVERSIONED_TOKEN,
      payload,
    };
  }

  /** Whether a validated result carries the exact section identity of the stored request. */
  private matchesRequest(jobId: string, result: MeshSectionResultPayload): boolean {
    const request = this.requests.get(jobId);
    return (
      request !== undefined &&
      request.sectionX === result.sectionX &&
      request.sectionY === result.sectionY &&
      request.sectionZ === result.sectionZ
    );
  }

  /** Whether a validated result carries the exact submission snapshot, when one was supplied. */
  private matchesSnapshot(jobId: string, result: MeshSectionResultPayload): boolean {
    const request = this.requests.get(jobId);
    return request !== undefined && sectionVersionSnapshotsEqual(
      request.versionSnapshot,
      result.versionSnapshot,
    );
  }

  /**
   * Shared exactly-once completion. Authority is the callbacks map (the unified client already
   * consumed the protocol-level pending record during resolution), so both the pooled path and
   * `handleMessage` resolve each job exactly once regardless of which consumed it first.
   */
  private complete(jobId: string, payload: MeshSectionResultPayload, token: number): MeshSectionResultPayload | null {
    const callback = this.callbacks.get(jobId);
    if (!callback) return null; // unknown / cancelled / already resolved
    this.abandon(jobId); // drop every bookkeeping entry before firing (exactly once)
    const result: MeshSectionResultPayload =
      token === UNVERSIONED_TOKEN ? payload : { ...payload, generationToken: token };
    callback(result);
    return result;
  }

  /** Reject a consumed worker result/failure exactly once and notify its owner. */
  private reject(jobId: string): boolean {
    const callback = this.rejectionCallbacks.get(jobId);
    if (!this.callbacks.has(jobId) && callback === undefined) return false;
    this.abandon(jobId);
    callback?.();
    return true;
  }

  /** Drop all per-job bookkeeping without invoking callbacks. */
  private abandon(jobId: string): void {
    const timeoutHandle = this.timeoutHandles.get(jobId);
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
      this.timeoutHandles.delete(jobId);
    }
    this.jobs.cancel(jobId);
    this.callbacks.delete(jobId);
    this.rejectionCallbacks.delete(jobId);
    this.tokens.delete(jobId);
    this.requests.delete(jobId);
    this.poolJobs.delete(jobId);
  }
}

// ---------------------------------------------------------------------------
// Main-thread packed-result expansion (World.ts worker-meshing integration).
// ---------------------------------------------------------------------------

/** Per-face expansion conventions for the stride-22 packed quad layout. */
interface PackedFaceLayout {
  /** Outward normal. */
  normal: [number, number, number];
  /** Min-corner vertex offset plus canonical face-winding U/V directions. */
  origin: [number, number, number];
  uDir: [number, number, number];
  vDir: [number, number, number];
}

/** Expansion layouts indexed by `FACE_INDEX` (up, down, north, south, east, west). */
const PACKED_FACE_LAYOUTS: readonly PackedFaceLayout[] = [
  { normal: [0, 1, 0], origin: [0, 0, 0], uDir: [0, 0, 1], vDir: [1, 0, 0] }, // up    (+Y)
  { normal: [0, -1, 0], origin: [0, 0, 0], uDir: [1, 0, 0], vDir: [0, 0, 1] }, // down  (-Y)
  { normal: [0, 0, -1], origin: [0, 0, 0], uDir: [0, 1, 0], vDir: [1, 0, 0] }, // north (-Z)
  { normal: [0, 0, 1], origin: [0, 0, 0], uDir: [1, 0, 0], vDir: [0, 1, 0] }, // south (+Z)
  { normal: [1, 0, 0], origin: [0, 0, 0], uDir: [0, 1, 0], vDir: [0, 0, 1] }, // east  (+X)
  { normal: [-1, 0, 0], origin: [0, 0, 0], uDir: [0, 0, 1], vDir: [0, 1, 0] }, // west  (-X)
];

/** Main-thread collaborators `expandPackedMeshResult` needs (keeps this file THREE-free). */
export interface PackedMeshExpandInfo {
  /** Atlas UV rectangle for a block id + canonical face index. */
  uvFor(blockId: number, faceIndex: number): UvRect;
  /** Render-stream classification for a block id. */
  renderLayerOf(blockId: number): MeshStreamName;
  /** Geometry factory (main thread supplies `geometryFromMeshStream`). */
  buildGeometry(stream: MeshStreamData, name: MeshStreamName): THREE.BufferGeometry | null;
}

/** Expanded per-stream geometries of one packed mesh result (`null` when empty). */
export interface PackedMeshGeometries {
  opaque: THREE.BufferGeometry | null;
  cutout: THREE.BufferGeometry | null;
  translucent: THREE.BufferGeometry | null;
  fluid: THREE.BufferGeometry | null;
}

/**
 * Decode a packed tint class id into normalized RGB (Phase 11.4): the class is a
 * resolved 24-bit biome color (`biomeTintClassId`); 0 means untinted white.
 */
export function packedTintRgb(classId: number): [number, number, number] {
  if (classId === 0) return [1, 1, 1];
  return [((classId >> 16) & 255) / 255, ((classId >> 8) & 255) / 255, (classId & 255) / 255];
}

/**
 * Corner geometry inputs for one packed quad, shared by `expandPackedMeshResult` and parity
 * testing: the four corners in canonical `(minU,minV), (maxU,minV), (minU,maxV), (maxU,maxV)`
 * order plus the outward normal for the quad's canonical face index.
 */
export function packedQuadGeometryInputs(
  quad: OpaqueFaceQuad,
): { corners: [number, number, number][]; normal: [number, number, number]; faceIndex: number } {
  const faceIndex = FACE_INDEX[quad.face];
  const layout = PACKED_FACE_LAYOUTS[faceIndex]!;
  const corners: [number, number, number][] = [];
  for (let c = 0; c < 4; c++) {
    const cu = c === 1 || c === 2 ? quad.width : 0;
    const cv = c >= 2 ? quad.height : 0;
    corners.push([
      quad.x + layout.origin[0] + layout.uDir[0] * cu + layout.vDir[0] * cv,
      quad.y + layout.origin[1] + layout.uDir[1] * cu + layout.vDir[1] * cv,
      quad.z + layout.origin[2] + layout.uDir[2] * cu + layout.vDir[2] * cv,
    ]);
  }
  return { corners, normal: [...layout.normal] as [number, number, number], faceIndex };
}

class TypedExpandStream {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly skyLight: Uint8Array;
  readonly blockLight: Uint8Array;
  readonly ao: Uint8Array;
  readonly tint: Float32Array;
  readonly indices: Uint32Array;
  vIdx = 0;
  iIdx = 0;

  constructor(quadCount: number) {
    this.positions = new Float32Array(quadCount * 12);
    this.normals = new Float32Array(quadCount * 12);
    this.uvs = new Float32Array(quadCount * 8);
    this.skyLight = new Uint8Array(quadCount * 4);
    this.blockLight = new Uint8Array(quadCount * 4);
    this.ao = new Uint8Array(quadCount * 4);
    this.tint = new Float32Array(quadCount * 12);
    this.indices = new Uint32Array(quadCount * 6);
  }

  pushQuad(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    layout: PackedFaceLayout,
    uv: UvRect,
    packedData: Float32Array,
    offset: number,
    tintRgb: [number, number, number],
  ): void {
    const base = this.vIdx / 3;
    const [tr, tg, tb] = tintRgb;
    const nx = layout.normal[0];
    const ny = layout.normal[1];
    const nz = layout.normal[2];

    for (let c = 0; c < 4; c++) {
      const cu = c === 1 || c === 2 ? width : 0;
      const cv = c >= 2 ? height : 0;

      const pIdx = this.vIdx;
      this.positions[pIdx] = x + layout.origin[0] + layout.uDir[0] * cu + layout.vDir[0] * cv;
      this.positions[pIdx + 1] = y + layout.origin[1] + layout.uDir[1] * cu + layout.vDir[1] * cv;
      this.positions[pIdx + 2] = z + layout.origin[2] + layout.uDir[2] * cu + layout.vDir[2] * cv;

      this.normals[pIdx] = nx;
      this.normals[pIdx + 1] = ny;
      this.normals[pIdx + 2] = nz;

      this.tint[pIdx] = tr;
      this.tint[pIdx + 1] = tg;
      this.tint[pIdx + 2] = tb;

      const uvIdx = (base + c) * 2;
      this.uvs[uvIdx] = c === 1 || c === 2 ? uv.u1 : uv.u0;
      this.uvs[uvIdx + 1] = c >= 2 ? uv.v1 : uv.v0;

      const lightBase = offset + 10 + c * 3;
      const cIdx = base + c;
      this.skyLight[cIdx] = packedData[lightBase]!;
      this.blockLight[cIdx] = packedData[lightBase + 1]!;
      this.ao[cIdx] = packedData[lightBase + 2]!;

      this.vIdx += 3;
    }

    const idx = this.iIdx;
    this.indices[idx] = base;
    this.indices[idx + 1] = base + 1;
    this.indices[idx + 2] = base + 2;
    this.indices[idx + 3] = base;
    this.indices[idx + 4] = base + 2;
    this.indices[idx + 5] = base + 3;
    this.iIdx += 6;
  }

  toStream(): MeshStreamData {
    return {
      positions: this.positions,
      normals: this.normals,
      uvs: this.uvs,
      skyLight: this.skyLight,
      blockLight: this.blockLight,
      ao: this.ao,
      tint: this.tint,
      indices: this.indices,
      vertexCount: this.vIdx / 3,
      indexCount: this.iIdx,
    };
  }
}

export function expandPackedMeshResult(packed: PackedMeshResult, info: PackedMeshExpandInfo): PackedMeshGeometries {
  if (packed.quadCount === 0) {
    return { opaque: null, cutout: null, translucent: null, fluid: null };
  }

  // Count quads per stream in a fast first pass
  const quadCounts: Record<MeshStreamName, number> = {
    opaque: 0,
    cutout: 0,
    translucent: 0,
    fluid: 0,
  };
  const streamNames: MeshStreamName[] = new Array(packed.quadCount);

  for (let q = 0; q < packed.quadCount; q++) {
    const o = q * packed.stride;
    const blockId = packed.data[o + 5]!;
    const name = packed.streamNames?.[q] ?? info.renderLayerOf(blockId);
    streamNames[q] = name;
    quadCounts[name]++;
  }

  const streams: Partial<Record<MeshStreamName, TypedExpandStream>> = {};
  if (quadCounts.opaque > 0) streams.opaque = new TypedExpandStream(quadCounts.opaque);
  if (quadCounts.cutout > 0) streams.cutout = new TypedExpandStream(quadCounts.cutout);
  if (quadCounts.translucent > 0) streams.translucent = new TypedExpandStream(quadCounts.translucent);
  if (quadCounts.fluid > 0) streams.fluid = new TypedExpandStream(quadCounts.fluid);

  for (let q = 0; q < packed.quadCount; q++) {
    const o = q * packed.stride;
    const x = packed.data[o]!;
    const y = packed.data[o + 1]!;
    const z = packed.data[o + 2]!;
    const width = packed.data[o + 3]!;
    const height = packed.data[o + 4]!;
    const blockId = packed.data[o + 5]!;
    const faceIndex = Math.min(5, Math.max(0, Math.round(packed.data[o + 6]!)));
    const layout = PACKED_FACE_LAYOUTS[faceIndex]!;
    const streamName = streamNames[q]!;
    const stream = streams[streamName]!;

    const uv = info.uvFor(blockId, faceIndex);
    const tintRgb = packedTintRgb(packed.data[o + 7]!);

    stream.pushQuad(x, y, z, width, height, layout, uv, packed.data, o, tintRgb);
  }

  return {
    opaque: streams.opaque ? info.buildGeometry(streams.opaque.toStream(), 'opaque') : null,
    cutout: streams.cutout ? info.buildGeometry(streams.cutout.toStream(), 'cutout') : null,
    translucent: streams.translucent ? info.buildGeometry(streams.translucent.toStream(), 'translucent') : null,
    fluid: streams.fluid ? info.buildGeometry(streams.fluid.toStream(), 'fluid') : null,
  };
}
