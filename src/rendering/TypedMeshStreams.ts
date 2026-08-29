import type {
  MeshStreamData,
  MeshStreamName,
} from '../world/MeshingTypes';
import { MESH_STREAM_NAMES } from '../world/MeshingTypes';

/** Hard aggregate cap for one validated GPU-ready section result. */
export const DEFAULT_MAX_MESH_RESULT_BYTES = 8 * 1024 * 1024;
/** Hard aggregate quad cap for one section result. */
export const DEFAULT_MAX_MESH_RESULT_QUADS = 65_536;
/** Hard aggregate vertex cap for one section result. */
export const DEFAULT_MAX_MESH_RESULT_VERTICES = 262_144;

export interface TypedMeshLayerStream extends MeshStreamData {
  /** Number of source quads represented by this stream. */
  quadCount: number;
  /** Sum of all owned typed-array byte lengths in this stream. */
  byteLength: number;
}

export type TypedMeshLayerStreams = Readonly<Record<MeshStreamName, TypedMeshLayerStream>>;

export interface MeshResultCaps {
  maxBytes?: number;
  maxQuads?: number;
  maxVertices?: number;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`TypedMeshLayerStreams: ${name} must be a positive integer`);
  }
}

function capsOf(caps: MeshResultCaps): Required<MeshResultCaps> {
  const result = {
    maxBytes: caps.maxBytes ?? DEFAULT_MAX_MESH_RESULT_BYTES,
    maxQuads: caps.maxQuads ?? DEFAULT_MAX_MESH_RESULT_QUADS,
    maxVertices: caps.maxVertices ?? DEFAULT_MAX_MESH_RESULT_VERTICES,
  };
  assertPositiveInteger(result.maxBytes, 'maxBytes');
  assertPositiveInteger(result.maxQuads, 'maxQuads');
  assertPositiveInteger(result.maxVertices, 'maxVertices');
  return result;
}

function isIntegerAtLeastZero(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function streamBuffers(stream: MeshStreamData): ArrayBuffer[] {
  return [
    stream.positions.buffer as ArrayBuffer,
    stream.normals.buffer as ArrayBuffer,
    stream.uvs.buffer as ArrayBuffer,
    stream.skyLight.buffer as ArrayBuffer,
    stream.blockLight.buffer as ArrayBuffer,
    stream.ao.buffer as ArrayBuffer,
    stream.tint.buffer as ArrayBuffer,
    stream.indices.buffer as ArrayBuffer,
  ];
}

function calculatedByteLength(stream: MeshStreamData): number {
  return streamBuffers(stream).reduce((total, buffer) => total + buffer.byteLength, 0);
}

function validateStream(
  name: MeshStreamName,
  input: unknown,
  caps: Required<MeshResultCaps>,
  buffers: Set<ArrayBuffer>,
): TypedMeshLayerStream {
  if (typeof input !== 'object' || input === null) {
    throw new Error(`TypedMeshLayerStreams: ${name} must be an object`);
  }
  const raw = input as Record<string, unknown>;
  if (!(raw.positions instanceof Float32Array) ||
      !(raw.normals instanceof Float32Array) ||
      !(raw.uvs instanceof Float32Array) ||
      !(raw.skyLight instanceof Uint8Array) ||
      !(raw.blockLight instanceof Uint8Array) ||
      !(raw.ao instanceof Uint8Array) ||
      !(raw.tint instanceof Float32Array) ||
      !(raw.indices instanceof Uint32Array)) {
    throw new TypeError(`TypedMeshLayerStreams: ${name} has an unexpected typed-array constructor`);
  }
  if (!isIntegerAtLeastZero(raw.vertexCount) || !isIntegerAtLeastZero(raw.indexCount) ||
      !isIntegerAtLeastZero(raw.quadCount) || !isIntegerAtLeastZero(raw.byteLength)) {
    throw new RangeError(`TypedMeshLayerStreams: ${name} counts and byteLength must be non-negative integers`);
  }
  const stream = raw as unknown as TypedMeshLayerStream;
  if (stream.vertexCount > caps.maxVertices || stream.quadCount > caps.maxQuads) {
    throw new RangeError(`TypedMeshLayerStreams: ${name} exceeds vertex or quad cap`);
  }
  if (stream.vertexCount !== stream.quadCount * 4 || stream.indexCount !== stream.quadCount * 6) {
    throw new Error(`TypedMeshLayerStreams: ${name} counts do not describe complete quads`);
  }
  if (stream.positions.length !== stream.vertexCount * 3 ||
      stream.normals.length !== stream.vertexCount * 3 ||
      stream.uvs.length !== stream.vertexCount * 2 ||
      stream.skyLight.length !== stream.vertexCount ||
      stream.blockLight.length !== stream.vertexCount ||
      stream.ao.length !== stream.vertexCount ||
      stream.tint.length !== stream.vertexCount * 3 ||
      stream.indices.length !== stream.indexCount) {
    throw new Error(`TypedMeshLayerStreams: ${name} array lengths do not match counts`);
  }
  for (let i = 0; i < stream.indices.length; i++) {
    if (stream.indices[i]! >= stream.vertexCount) {
      throw new RangeError(`TypedMeshLayerStreams: ${name} index ${i} is outside vertex bounds`);
    }
  }
  const actualBytes = calculatedByteLength(stream);
  if (stream.byteLength !== actualBytes) {
    throw new Error(`TypedMeshLayerStreams: ${name} byteLength does not match owned buffers`);
  }
  for (const buffer of streamBuffers(stream)) {
    if (buffer.byteLength > 0 && buffers.has(buffer)) {
      throw new Error(`TypedMeshLayerStreams: duplicate buffer ownership in ${name}`);
    }
    buffers.add(buffer);
  }
  return stream;
}

/** Validate worker-owned GPU-ready streams before any geometry allocation or attachment. */
export function validateTypedMeshLayerStreams(
  input: unknown,
  caps: MeshResultCaps = {},
): TypedMeshLayerStreams {
  if (typeof input !== 'object' || input === null) {
    throw new Error('TypedMeshLayerStreams: expected an object');
  }
  const limits = capsOf(caps);
  const raw = input as Record<string, unknown>;
  const buffers = new Set<ArrayBuffer>();
  const streams = {} as Record<MeshStreamName, TypedMeshLayerStream>;
  let totalBytes = 0;
  let totalQuads = 0;
  let totalVertices = 0;
  for (const name of MESH_STREAM_NAMES) {
    const stream = validateStream(name, raw[name], limits, buffers);
    streams[name] = stream;
    totalBytes += stream.byteLength;
    totalQuads += stream.quadCount;
    totalVertices += stream.vertexCount;
  }
  if (totalBytes > limits.maxBytes) throw new RangeError(`TypedMeshLayerStreams: total bytes exceed cap ${limits.maxBytes}`);
  if (totalQuads > limits.maxQuads) throw new RangeError(`TypedMeshLayerStreams: total quads exceed cap ${limits.maxQuads}`);
  if (totalVertices > limits.maxVertices) throw new RangeError(`TypedMeshLayerStreams: total vertices exceed cap ${limits.maxVertices}`);
  return streams;
}

/** Return each non-empty owned stream buffer exactly once for postMessage transfer. */
export function collectTypedMeshLayerTransferables(
  streams: TypedMeshLayerStreams,
): ArrayBuffer[] {
  validateTypedMeshLayerStreams(streams);
  const buffers = new Set<ArrayBuffer>();
  for (const name of MESH_STREAM_NAMES) {
    for (const buffer of streamBuffers(streams[name])) {
      if (buffer.byteLength > 0) buffers.add(buffer);
    }
  }
  return [...buffers];
}

/** Compute the byte count represented by one stream's owned typed arrays. */
export function typedMeshStreamByteLength(stream: MeshStreamData): number {
  return calculatedByteLength(stream);
}

/** Compute the byte count represented by a validated result. */
export function typedMeshLayerStreamsByteLength(streams: TypedMeshLayerStreams): number {
  return MESH_STREAM_NAMES.reduce((total, name) => total + streams[name].byteLength, 0);
}
