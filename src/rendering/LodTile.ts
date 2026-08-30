import { resourceIdToString, tryParseResourceId, type ResourceId } from '../data/ResourceId';
import type { DimensionType } from '../data/DimensionType';
import { CONFIG } from '../config';
import { BlockId } from '../world/BlockRegistry';
import type { TerrainGenerator } from '../world/TerrainGenerator';

/** Version of the disposable, presentation-only LOD tile data contract. */
export const LOD_TILE_PROTOCOL_VERSION = 1;
/** Each tile has a fixed 16×16 horizontal sample lattice at every far tier. */
export const LOD_TILE_SAMPLE_COUNT = 16;
/** Block span represented by one sample at each hierarchical tier. */
export const LOD_TILE_SAMPLE_STRIDES = {
  1: 2,
  2: 4,
  3: 8,
} as const;

export type LodLevel = 1 | 2 | 3;

export interface LodTileIdentity {
  readonly dimensionId: ResourceId;
  /** Canonical unsigned seed, matching TerrainGenerator's seed normalization. */
  readonly seed: number;
  /** World-generation contract version supplied by the sampler. */
  readonly generationVersion: string;
  readonly lod: LodLevel;
  /** Horizontal tile coordinates in tiles at this LOD, not chunk coordinates. */
  readonly tileX: number;
  readonly tileZ: number;
}

export interface LodTileIdentityInput {
  dimensionId: ResourceId;
  seed: number;
  generationVersion: string;
  lod: number;
  tileX: number;
  tileZ: number;
}

export interface LodColumnSample {
  /** Surface Y in the source dimension. */
  readonly height: number;
  /** Stable block/material id used by the presentation tier. */
  readonly material: number;
  /** Stable dense biome id used by the presentation tier. */
  readonly biome: number;
}

/** A deterministic source bound to one seed and one world-generation version. */
export interface LodSamplingSource {
  readonly seed: number;
  readonly generationVersion: string;
  sampleColumn(worldX: number, worldZ: number): LodColumnSample;
}

/**
 * Bind the production terrain sampler without exposing canonical columns to LOD.
 * The returned source contains only deterministic surface summaries; LOD never
 * becomes a block-read, collision, persistence, or simulation source.
 */
export function createTerrainLodSamplingSource(
  generator: Pick<TerrainGenerator, 'getHeightAt' | 'getBiomeAt'>,
  seed: number,
  generationVersion: string,
): LodSamplingSource {
  const normalizedSeed = canonicalSeed(seed);
  const biomeIds = { plains: 0, forest: 1, desert: 2, taiga: 3 } as const;
  return Object.freeze({
    seed: normalizedSeed,
    generationVersion: validateGenerationVersion(generationVersion),
    sampleColumn(worldX: number, worldZ: number): LodColumnSample {
      const height = generator.getHeightAt(worldX, worldZ);
      const biome = generator.getBiomeAt(worldX, worldZ);
      let material = BlockId.Grass;
      if (height <= CONFIG.seaLevel) material = BlockId.Water;
      else if (biome === 'desert') material = BlockId.Sand;
      else if (biome === 'taiga') material = BlockId.Snow;
      return { height, material, biome: biomeIds[biome] };
    },
  });
}

interface LodTileHeader {
  readonly protocolVersion: 1;
  readonly identity: LodTileIdentity;
  readonly originX: number;
  readonly originZ: number;
  readonly sampleCount: 16;
  readonly sampleStride: 2 | 4 | 8;
  /** Sum of owned typed-array byte lengths; metadata is excluded. */
  readonly byteLength: number;
}

export interface Lod1TileData extends LodTileHeader {
  readonly lod: 1;
  /** Whether the sampled column contains terrain above the dimension floor. */
  readonly occupancy: Uint8Array;
  readonly heights: Int32Array;
  readonly materials: Uint16Array;
}

export interface Lod2TileData extends LodTileHeader {
  readonly lod: 2;
  readonly heights: Int32Array;
  readonly materials: Uint16Array;
  readonly biomes: Uint8Array;
}

export interface Lod3TileData extends LodTileHeader {
  readonly lod: 3;
  readonly heights: Int32Array;
  readonly materials: Uint16Array;
  readonly biomes: Uint8Array;
}

export type LodTileData = Lod1TileData | Lod2TileData | Lod3TileData;

export class LodTileValidationError extends Error {
  constructor(message: string) {
    super(`LodTile: ${message}`);
    this.name = 'LodTileValidationError';
  }
}

function assertRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LodTileValidationError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new LodTileValidationError(`${name} must be a safe integer`);
  }
  return value as number;
}

function canonicalSeed(seed: number): number {
  if (!Number.isSafeInteger(seed)) {
    throw new LodTileValidationError('seed must be a safe integer');
  }
  return seed >>> 0;
}

function validateGenerationVersion(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(value)) {
    throw new LodTileValidationError('generationVersion must be 1-64 ASCII version characters');
  }
  return value;
}

function validateDimensionId(value: unknown): ResourceId {
  const record = assertRecord(value, 'dimensionId');
  if (typeof record.namespace !== 'string' || typeof record.path !== 'string') {
    throw new LodTileValidationError('dimensionId must be a valid namespaced resource id');
  }
  const parsed = tryParseResourceId(`${record.namespace}:${record.path}`);
  if (parsed === null) {
    throw new LodTileValidationError('dimensionId must be a valid namespaced resource id');
  }
  return parsed;
}

function validateTileCoordinate(value: unknown, name: string, lod: LodLevel): number {
  const coordinate = assertInteger(value, name);
  const span = lodTileBlockSpan(lod);
  const maximum = Math.floor((Number.MAX_SAFE_INTEGER - (span - 1)) / span);
  if (Math.abs(coordinate) > maximum) {
    throw new LodTileValidationError(`${name} is outside the safe world-coordinate range for LOD${lod}`);
  }
  return coordinate;
}

function validateLod(value: unknown): LodLevel {
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new LodTileValidationError('lod must be 1, 2, or 3');
  }
  return value;
}

/** Validate and canonicalize the identity used by every disposable LOD tile. */
export function validateLodTileIdentity(input: unknown): LodTileIdentity {
  const record = assertRecord(input, 'identity');
  const lod = validateLod(record.lod);
  const identity = Object.freeze({
    dimensionId: validateDimensionId(record.dimensionId),
    seed: canonicalSeed(assertInteger(record.seed, 'seed')),
    generationVersion: validateGenerationVersion(record.generationVersion),
    lod,
    tileX: validateTileCoordinate(record.tileX, 'tileX', lod),
    tileZ: validateTileCoordinate(record.tileZ, 'tileZ', lod),
  });
  return identity;
}

/** Build a stable cache/ownership key. It contains no locale-sensitive formatting. */
export function lodTileKey(identityInput: LodTileIdentityInput | LodTileIdentity): string {
  const identity = validateLodTileIdentity(identityInput);
  return [
    resourceIdToString(identity.dimensionId),
    identity.seed,
    identity.generationVersion,
    identity.lod,
    identity.tileX,
    identity.tileZ,
  ].join('|');
}

/** Number of world blocks covered by one tile edge at `lod`. */
export function lodTileBlockSpan(lod: LodLevel): number {
  return LOD_TILE_SAMPLE_COUNT * LOD_TILE_SAMPLE_STRIDES[lod];
}

function sampleOffset(tileCoordinate: number, lod: LodLevel, sample: number): number {
  const stride = LOD_TILE_SAMPLE_STRIDES[lod];
  return tileCoordinate * lodTileBlockSpan(lod) + sample * stride + Math.floor(stride / 2);
}

function validateColumnSample(sample: LodColumnSample, dimension: DimensionType): LodColumnSample {
  const record = assertRecord(sample, 'column sample');
  const height = assertInteger(record.height, 'column sample height');
  const material = assertInteger(record.material, 'column sample material');
  const biome = assertInteger(record.biome, 'column sample biome');
  if (!dimension.containsY(height)) {
    throw new LodTileValidationError(`column sample height ${height} is outside dimension bounds`);
  }
  if (material < 0 || material > 0xffff) {
    throw new LodTileValidationError('column sample material must fit Uint16');
  }
  if (biome < 0 || biome > 0xff) {
    throw new LodTileValidationError('column sample biome must fit Uint8');
  }
  return { height, material, biome };
}

function validateSource(identity: LodTileIdentity, source: LodSamplingSource): void {
  if (source === null || typeof source !== 'object' || typeof source.sampleColumn !== 'function') {
    throw new LodTileValidationError('sampling source must provide sampleColumn');
  }
  if (canonicalSeed(source.seed) !== identity.seed) {
    throw new LodTileValidationError('sampling source seed does not match tile identity');
  }
  if (source.generationVersion !== identity.generationVersion) {
    throw new LodTileValidationError('sampling source generationVersion does not match tile identity');
  }
}

function createHeader(identity: LodTileIdentity, dimension: DimensionType): Omit<LodTileHeader, 'byteLength'> {
  if (identity.dimensionId.namespace !== dimension.id.namespace || identity.dimensionId.path !== dimension.id.path) {
    throw new LodTileValidationError('tile dimensionId does not match sampling dimension');
  }
  const stride = LOD_TILE_SAMPLE_STRIDES[identity.lod];
  return {
    protocolVersion: LOD_TILE_PROTOCOL_VERSION,
    identity,
    originX: identity.tileX * lodTileBlockSpan(identity.lod),
    originZ: identity.tileZ * lodTileBlockSpan(identity.lod),
    sampleCount: LOD_TILE_SAMPLE_COUNT,
    sampleStride: stride,
  };
}

/** Deterministically sample one LOD tile from a seed/version-bound source. */
export function sampleLodTile(
  identityInput: LodTileIdentityInput | LodTileIdentity,
  dimension: DimensionType,
  source: LodSamplingSource,
): LodTileData {
  const identity = validateLodTileIdentity(identityInput);
  validateSource(identity, source);
  const header = createHeader(identity, dimension);
  const cellCount = LOD_TILE_SAMPLE_COUNT * LOD_TILE_SAMPLE_COUNT;
  const heights = new Int32Array(cellCount);
  const materials = new Uint16Array(cellCount);
  const biomes = new Uint8Array(cellCount);

  for (let z = 0; z < LOD_TILE_SAMPLE_COUNT; z++) {
    const worldZ = sampleOffset(identity.tileZ, identity.lod, z);
    for (let x = 0; x < LOD_TILE_SAMPLE_COUNT; x++) {
      const worldX = sampleOffset(identity.tileX, identity.lod, x);
      const sample = validateColumnSample(source.sampleColumn(worldX, worldZ), dimension);
      const index = x + z * LOD_TILE_SAMPLE_COUNT;
      heights[index] = sample.height;
      materials[index] = sample.material;
      biomes[index] = sample.biome;
    }
  }

  if (identity.lod === 1) {
    const occupancy = new Uint8Array(cellCount);
    for (let i = 0; i < cellCount; i++) occupancy[i] = heights[i]! >= dimension.minY ? 1 : 0;
    return {
      ...header,
      lod: 1,
      occupancy,
      heights,
      materials,
      byteLength: occupancy.byteLength + heights.byteLength + materials.byteLength,
    };
  }
  if (identity.lod === 2) {
    return {
      ...header,
      lod: 2,
      heights,
      materials,
      biomes,
      byteLength: heights.byteLength + materials.byteLength + biomes.byteLength,
    };
  }
  return {
    ...header,
    lod: 3,
    heights,
    materials,
    biomes,
    byteLength: heights.byteLength + materials.byteLength + biomes.byteLength,
  };
}

function assertTypedArray(
  value: unknown,
  ctor: Uint8ArrayConstructor | Uint16ArrayConstructor | Int32ArrayConstructor,
  length: number,
  name: string,
): void {
  if (!(value instanceof ctor) || (value as Uint8Array).length !== length) {
    throw new LodTileValidationError(`${name} must be ${ctor.name} with length ${length}`);
  }
}

/** Validate an untrusted tile record before it enters any future cache or renderer. */
export function validateLodTileData(input: unknown): LodTileData {
  const record = assertRecord(input, 'tile data');
  const identity = validateLodTileIdentity(record.identity);
  const lod = validateLod(record.lod);
  if (identity.lod !== lod) {
    throw new LodTileValidationError('tile lod does not match identity.lod');
  }
  if (record.protocolVersion !== LOD_TILE_PROTOCOL_VERSION) {
    throw new LodTileValidationError(`unsupported protocolVersion ${String(record.protocolVersion)}`);
  }
  const stride = LOD_TILE_SAMPLE_STRIDES[lod];
  if (
    record.originX !== identity.tileX * lodTileBlockSpan(lod) ||
    record.originZ !== identity.tileZ * lodTileBlockSpan(lod) ||
    record.sampleCount !== LOD_TILE_SAMPLE_COUNT ||
    record.sampleStride !== stride
  ) {
    throw new LodTileValidationError('tile geometry metadata does not match identity');
  }
  const cellCount = LOD_TILE_SAMPLE_COUNT * LOD_TILE_SAMPLE_COUNT;
  assertTypedArray(record.heights, Int32Array, cellCount, 'heights');
  assertTypedArray(record.materials, Uint16Array, cellCount, 'materials');
  if (lod === 1) {
    assertTypedArray(record.occupancy, Uint8Array, cellCount, 'occupancy');
    for (const value of record.occupancy as Uint8Array) {
      if (value !== 0 && value !== 1) {
        throw new LodTileValidationError('occupancy values must be binary');
      }
    }
  }
  const byteLength =
    (record.heights as Int32Array).byteLength +
    (record.materials as Uint16Array).byteLength +
    (lod === 1 ? (record.occupancy as Uint8Array).byteLength : (record.biomes as Uint8Array).byteLength);
  if (record.byteLength !== byteLength) {
    throw new LodTileValidationError(`byteLength ${String(record.byteLength)} does not match owned arrays (${byteLength})`);
  }
  return input as LodTileData;
}
