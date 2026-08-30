import {
  lodTileBlockSpan,
  lodTileKey,
  validateLodTileData,
  validateLodTileIdentity,
  type LodLevel,
  type LodTileData,
  type LodTileIdentity,
  type LodTileIdentityInput,
} from './LodTile';

export const LOD_RENDER_GRID_SIZE = 16;
export const LOD_RENDER_TOP_VERTEX_COUNT = (LOD_RENDER_GRID_SIZE + 1) ** 2;
export const LOD_RENDER_SKIRT_SEGMENT_COUNT = LOD_RENDER_GRID_SIZE * 4;
export const LOD_RENDER_SKIRT_VERTEX_COUNT = LOD_RENDER_SKIRT_SEGMENT_COUNT * 2;
export const LOD_RENDER_VERTEX_COUNT = LOD_RENDER_TOP_VERTEX_COUNT + LOD_RENDER_SKIRT_VERTEX_COUNT;
export const LOD_RENDER_TOP_INDEX_COUNT = LOD_RENDER_GRID_SIZE * LOD_RENDER_GRID_SIZE * 6;
export const LOD_RENDER_SKIRT_INDEX_COUNT = LOD_RENDER_SKIRT_SEGMENT_COUNT * 6;
export const LOD_RENDER_INDEX_COUNT = LOD_RENDER_TOP_INDEX_COUNT + LOD_RENDER_SKIRT_INDEX_COUNT;

export type LodSeamEdge = 'north' | 'east' | 'south' | 'west';
export const LOD_SEAM_EDGES: readonly LodSeamEdge[] = ['north', 'east', 'south', 'west'];

export interface LodTileBounds {
  readonly minX: number;
  readonly minZ: number;
  /** Exclusive maximum, so adjacent tiles share a boundary without a gap. */
  readonly maxX: number;
  readonly maxZ: number;
}

export interface LodTileRenderData {
  readonly key: string;
  readonly lod: LodLevel;
  readonly originX: number;
  readonly originZ: number;
  readonly worldSpan: number;
  readonly seamSafe: true;
  /** Horizontal skirt extension on every edge, in world blocks. */
  readonly seamOverlap: number;
  /** Vertical skirt depth, in world blocks. */
  readonly skirtDepth: number;
  readonly seamEdges: readonly LodSeamEdge[];
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly materials: Uint16Array;
  readonly biomes?: Uint8Array;
  /** Sum of owned typed-array bytes; metadata is excluded. */
  readonly byteLength: number;
}

export interface LodTileRenderOptions {
  /** Defaults to half a sample stride, which overlaps adjacent tier edges. */
  readonly seamOverlap?: number;
  /** Defaults to one sample stride, enough to hide height discontinuities. */
  readonly skirtDepth?: number;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`LodTileRender: ${name} must be finite`);
  }
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`LodTileRender: ${name} must be a finite non-negative number`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`LodTileRender: ${name} must be a positive integer`);
  }
}

export function lodTileBounds(identityInput: LodTileIdentityInput | LodTileIdentity): LodTileBounds {
  const identity = validateLodTileIdentity(identityInput);
  const span = lodTileBlockSpan(identity.lod);
  return {
    minX: identity.tileX * span,
    minZ: identity.tileZ * span,
    maxX: identity.tileX * span + span,
    maxZ: identity.tileZ * span + span,
  };
}

function sampleHeight(tile: LodTileData, x: number, z: number): number {
  const sampleX = Math.min(LOD_RENDER_GRID_SIZE - 1, x);
  const sampleZ = Math.min(LOD_RENDER_GRID_SIZE - 1, z);
  return tile.heights[sampleX + sampleZ * LOD_RENDER_GRID_SIZE]!;
}

function topVertexIndex(x: number, z: number): number {
  return x + z * (LOD_RENDER_GRID_SIZE + 1);
}

interface EdgeSegment {
  readonly edge: LodSeamEdge;
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly outwardX: number;
  readonly outwardZ: number;
  readonly materialIndex: number;
}

function edgeSegments(): readonly EdgeSegment[] {
  const segments: EdgeSegment[] = [];
  for (let i = 0; i < LOD_RENDER_GRID_SIZE; i++) {
    segments.push({
      edge: 'north',
      x0: i,
      z0: 0,
      x1: i + 1,
      z1: 0,
      outwardX: 0,
      outwardZ: -1,
      materialIndex: i,
    });
  }
  for (let i = 0; i < LOD_RENDER_GRID_SIZE; i++) {
    segments.push({
      edge: 'east',
      x0: LOD_RENDER_GRID_SIZE,
      z0: i,
      x1: LOD_RENDER_GRID_SIZE,
      z1: i + 1,
      outwardX: 1,
      outwardZ: 0,
      materialIndex: (LOD_RENDER_GRID_SIZE - 1) + i * LOD_RENDER_GRID_SIZE,
    });
  }
  for (let i = LOD_RENDER_GRID_SIZE - 1; i >= 0; i--) {
    segments.push({
      edge: 'south',
      x0: i + 1,
      z0: LOD_RENDER_GRID_SIZE,
      x1: i,
      z1: LOD_RENDER_GRID_SIZE,
      outwardX: 0,
      outwardZ: 1,
      materialIndex: i + (LOD_RENDER_GRID_SIZE - 1) * LOD_RENDER_GRID_SIZE,
    });
  }
  for (let i = LOD_RENDER_GRID_SIZE - 1; i >= 0; i--) {
    segments.push({
      edge: 'west',
      x0: 0,
      z0: i + 1,
      x1: 0,
      z1: i,
      outwardX: -1,
      outwardZ: 0,
      materialIndex: i * LOD_RENDER_GRID_SIZE,
    });
  }
  return segments;
}

const EDGE_SEGMENTS = edgeSegments();

function writeVertex(
  positions: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
): void {
  const offset = index * 3;
  positions[offset] = x;
  positions[offset + 1] = y;
  positions[offset + 2] = z;
}

/**
 * Build a deterministic render-only surface with a skirt on every tile edge.
 * The skirt intentionally overlaps the edge by half a sample stride; this is
 * a visual seam guard and never participates in canonical collision/storage.
 */
export function buildLodTileRenderData(
  tileInput: LodTileData,
  options: LodTileRenderOptions = {},
): LodTileRenderData {
  const tile = validateLodTileData(tileInput);
  const stride = tile.sampleStride;
  const seamOverlap = options.seamOverlap ?? stride / 2;
  const skirtDepth = options.skirtDepth ?? stride;
  assertFiniteNonNegative(seamOverlap, 'seamOverlap');
  assertFiniteNonNegative(skirtDepth, 'skirtDepth');
  if (seamOverlap === 0 || skirtDepth === 0) {
    throw new RangeError('LodTileRender: seamOverlap and skirtDepth must be positive');
  }

  const positions = new Float32Array(LOD_RENDER_VERTEX_COUNT * 3);
  const indices = new Uint32Array(LOD_RENDER_INDEX_COUNT);
  const materials = new Uint16Array(LOD_RENDER_GRID_SIZE * LOD_RENDER_GRID_SIZE);
  materials.set(tile.materials);
  const biomes = tile.lod === 1 ? undefined : new Uint8Array(tile.biomes);
  const originX = tile.originX;
  const originZ = tile.originZ;

  for (let z = 0; z <= LOD_RENDER_GRID_SIZE; z++) {
    for (let x = 0; x <= LOD_RENDER_GRID_SIZE; x++) {
      const index = topVertexIndex(x, z);
      writeVertex(
        positions,
        index,
        originX + x * stride,
        sampleHeight(tile, x, z),
        originZ + z * stride,
      );
    }
  }

  let indexOffset = 0;
  for (let z = 0; z < LOD_RENDER_GRID_SIZE; z++) {
    for (let x = 0; x < LOD_RENDER_GRID_SIZE; x++) {
      const topLeft = topVertexIndex(x, z);
      const topRight = topVertexIndex(x + 1, z);
      const bottomLeft = topVertexIndex(x, z + 1);
      const bottomRight = topVertexIndex(x + 1, z + 1);
      indices[indexOffset++] = topLeft;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = topRight;
      indices[indexOffset++] = topRight;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = bottomRight;
    }
  }

  let skirtVertex = LOD_RENDER_TOP_VERTEX_COUNT;
  for (const segment of EDGE_SEGMENTS) {
    const topA = topVertexIndex(segment.x0, segment.z0);
    const topB = topVertexIndex(segment.x1, segment.z1);
    const topAY = positions[topA * 3 + 1]!;
    const topBY = positions[topB * 3 + 1]!;
    const lowerA = skirtVertex++;
    const lowerB = skirtVertex++;
    writeVertex(
      positions,
      lowerA,
      positions[topA * 3]! + segment.outwardX * seamOverlap,
      Math.min(topAY, topBY) - skirtDepth,
      positions[topA * 3 + 2]! + segment.outwardZ * seamOverlap,
    );
    writeVertex(
      positions,
      lowerB,
      positions[topB * 3]! + segment.outwardX * seamOverlap,
      Math.min(topAY, topBY) - skirtDepth,
      positions[topB * 3 + 2]! + segment.outwardZ * seamOverlap,
    );
    indices[indexOffset++] = topA;
    indices[indexOffset++] = lowerA;
    indices[indexOffset++] = topB;
    indices[indexOffset++] = topB;
    indices[indexOffset++] = lowerA;
    indices[indexOffset++] = lowerB;
  }

  if (indexOffset !== indices.length || skirtVertex !== LOD_RENDER_VERTEX_COUNT) {
    throw new Error('LodTileRender: internal seam geometry count mismatch');
  }

  return {
    key: lodTileKey(tile.identity),
    lod: tile.lod,
    originX,
    originZ,
    worldSpan: lodTileBlockSpan(tile.lod),
    seamSafe: true,
    seamOverlap,
    skirtDepth,
    seamEdges: LOD_SEAM_EDGES,
    positions,
    indices,
    materials,
    ...(biomes === undefined ? {} : { biomes }),
    byteLength: positions.byteLength + indices.byteLength + materials.byteLength + (biomes?.byteLength ?? 0),
  };
}

export interface LodTileRenderResource {
  readonly key: string;
  readonly data: LodTileRenderData;
  readonly byteLength: number;
  readonly disposed: boolean;
  dispose(): void;
}

/** Wrap render data in an idempotently disposable cache-owned resource. */
export function createLodTileRenderResource(
  data: LodTileRenderData,
  onDispose?: () => void,
): LodTileRenderResource {
  let disposed = false;
  return {
    key: data.key,
    data,
    byteLength: data.byteLength,
    get disposed(): boolean {
      return disposed;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      onDispose?.();
    },
  };
}

export interface LodTileCacheConfig {
  readonly maxEntries: number;
  readonly maxBytes: number;
}

export interface LodTileCacheStats {
  readonly entries: number;
  readonly bytes: number;
  readonly evictions: number;
  readonly disposals: number;
}

function validateCacheConfig(config: LodTileCacheConfig): LodTileCacheConfig {
  assertPositiveInteger(config.maxEntries, 'maxEntries');
  assertPositiveInteger(config.maxBytes, 'maxBytes');
  return config;
}

/**
 * Owns disposable far-tile render resources with deterministic LRU eviction.
 * `set` transfers ownership to the cache; an over-sized resource is disposed
 * immediately and rejected, never partially admitted.
 */
export class LodTileRenderCache {
  readonly maxEntries: number;
  readonly maxBytes: number;
  private readonly entries = new Map<string, LodTileRenderResource>();
  private totalBytes = 0;
  private evictionCount = 0;
  private disposalCount = 0;

  constructor(config: LodTileCacheConfig) {
    validateCacheConfig(config);
    this.maxEntries = config.maxEntries;
    this.maxBytes = config.maxBytes;
  }

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  get(key: string): LodTileRenderResource | undefined {
    const resource = this.entries.get(key);
    if (resource === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, resource);
    return resource;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  keys(): readonly string[] {
    return [...this.entries.keys()];
  }

  set(resource: LodTileRenderResource): boolean {
    if (!resource || typeof resource.key !== 'string' || !Number.isInteger(resource.byteLength) || resource.byteLength < 0) {
      throw new TypeError('LodTileRenderCache: resource must have a valid key and non-negative integer byteLength');
    }
    if (resource.disposed) {
      throw new TypeError('LodTileRenderCache: disposed resources cannot be admitted');
    }
    const existing = this.entries.get(resource.key);
    if (existing === resource) {
      this.touch(resource.key, resource);
      return true;
    }
    if (resource.byteLength > this.maxBytes) {
      this.disposeOwned(resource);
      return false;
    }
    if (existing !== undefined) {
      this.removeOwned(resource.key, existing);
    }
    this.entries.set(resource.key, resource);
    this.totalBytes += resource.byteLength;
    this.evictToBounds();
    return this.entries.has(resource.key);
  }

  delete(key: string): boolean {
    const resource = this.entries.get(key);
    if (resource === undefined) return false;
    this.removeOwned(key, resource);
    return true;
  }

  clear(): void {
    for (const [key, resource] of this.entries) this.removeOwned(key, resource);
  }

  stats(): LodTileCacheStats {
    return {
      entries: this.entries.size,
      bytes: this.totalBytes,
      evictions: this.evictionCount,
      disposals: this.disposalCount,
    };
  }

  private touch(key: string, resource: LodTileRenderResource): void {
    this.entries.delete(key);
    this.entries.set(key, resource);
  }

  private evictToBounds(): void {
    while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      const oldest = this.entries.entries().next().value as [string, LodTileRenderResource] | undefined;
      if (oldest === undefined) break;
      this.evictionCount++;
      this.removeOwned(oldest[0], oldest[1]);
    }
  }

  private removeOwned(key: string, resource: LodTileRenderResource): void {
    if (!this.entries.delete(key)) return;
    this.totalBytes -= resource.byteLength;
    this.disposeOwned(resource);
  }

  private disposeOwned(resource: LodTileRenderResource): void {
    const wasDisposed = resource.disposed;
    resource.dispose();
    if (!wasDisposed && resource.disposed) this.disposalCount++;
  }
}

export interface LodTileSelectionView {
  readonly cameraX: number;
  readonly cameraZ: number;
  readonly frustum?: (bounds: LodTileBounds) => boolean;
}

export interface LodTileSelectionConfig {
  /** Near-tier transition threshold. */
  readonly lod1EnterDistance: number;
  /** Near tier remains active until this farther threshold. */
  readonly lod1ExitDistance: number;
  /** Mid-tier transition threshold. */
  readonly lod2EnterDistance: number;
  /** Mid tier remains active until this farther threshold. */
  readonly lod2ExitDistance: number;
  /** Maximum distance at which any far tile is selected. */
  readonly maxDistance: number;
  readonly maxTiles: number;
}

export interface LodTileSelectionCandidate {
  readonly identity: LodTileIdentityInput | LodTileIdentity;
}

export interface LodTileSelectionResult {
  readonly selected: readonly LodTileIdentity[];
  readonly selectedKeys: readonly string[];
  readonly rejected: readonly { key: string; reason: 'frustum' | 'distance' | 'capacity' }[];
  readonly distances: ReadonlyMap<string, number>;
}

function validateSelectionConfig(config: LodTileSelectionConfig): LodTileSelectionConfig {
  assertPositiveInteger(config.maxTiles, 'maxTiles');
  for (const [name, value] of Object.entries(config)) {
    if (name === 'maxTiles') continue;
    assertFiniteNonNegative(value as number, name);
  }
  if (config.lod1ExitDistance < config.lod1EnterDistance) {
    throw new RangeError('LodTileRender: lod1ExitDistance must be >= lod1EnterDistance');
  }
  if (config.lod2EnterDistance <= config.lod1EnterDistance) {
    throw new RangeError('LodTileRender: lod2EnterDistance must be > lod1EnterDistance');
  }
  if (config.lod2ExitDistance < config.lod2EnterDistance) {
    throw new RangeError('LodTileRender: lod2ExitDistance must be >= lod2EnterDistance');
  }
  if (config.maxDistance < config.lod2ExitDistance) {
    throw new RangeError('LodTileRender: maxDistance must be >= lod2ExitDistance');
  }
  return config;
}

function assertView(view: LodTileSelectionView): void {
  assertFinite(view.cameraX, 'cameraX');
  assertFinite(view.cameraZ, 'cameraZ');
}

function distanceToBounds(view: LodTileSelectionView, bounds: LodTileBounds): number {
  const dx = view.cameraX < bounds.minX ? bounds.minX - view.cameraX : view.cameraX > bounds.maxX ? view.cameraX - bounds.maxX : 0;
  const dz = view.cameraZ < bounds.minZ ? bounds.minZ - view.cameraZ : view.cameraZ > bounds.maxZ ? view.cameraZ - bounds.maxZ : 0;
  return Math.hypot(dx, dz);
}

function selectionKey(identity: LodTileIdentity): string {
  const bounds = lodTileBounds(identity);
  return `${identity.dimensionId.namespace}:${identity.dimensionId.path}|${identity.seed}|${identity.generationVersion}|${bounds.minX}|${bounds.minZ}`;
}

export function lodTileSelectionKey(identityInput: LodTileIdentityInput | LodTileIdentity): string {
  return selectionKey(validateLodTileIdentity(identityInput));
}

function chooseLod(distance: number, previous: LodLevel | undefined, config: LodTileSelectionConfig): LodLevel {
  if (previous === 1) {
    if (distance <= config.lod1ExitDistance) return 1;
    return distance <= config.lod2ExitDistance ? 2 : 3;
  }
  if (previous === 2) {
    if (distance <= config.lod1EnterDistance) return 1;
    return distance <= config.lod2ExitDistance ? 2 : 3;
  }
  if (previous === 3) {
    if (distance <= config.lod2EnterDistance) return 2;
    return 3;
  }
  if (distance <= config.lod1EnterDistance) return 1;
  return distance <= config.lod2EnterDistance ? 2 : 3;
}

/**
 * Select visible tile identities from deterministic source candidates. The
 * candidates describe world coverage; the selected identity is normalized to
 * the chosen tier, so a transition never exposes two tier choices for one
 * coverage key. `previousLodByKey` is runtime-only hysteresis state.
 */
export function selectLodTiles(
  candidates: readonly LodTileSelectionCandidate[],
  view: LodTileSelectionView,
  config: LodTileSelectionConfig,
  previousLodByKey: ReadonlyMap<string, LodLevel> = new Map(),
): LodTileSelectionResult {
  validateSelectionConfig(config);
  assertView(view);
  const unique = new Map<string, LodTileIdentity>();
  for (const candidate of candidates) {
    const identity = validateLodTileIdentity(candidate.identity);
    const key = selectionKey(identity);
    const existing = unique.get(key);
    if (existing === undefined || lodTileKey(identity) < lodTileKey(existing)) unique.set(key, identity);
  }

  const distances = new Map<string, number>();
  const eligible: Array<{ identity: LodTileIdentity; key: string; distance: number }> = [];
  const rejected: Array<{ key: string; reason: 'frustum' | 'distance' | 'capacity' }> = [];
  for (const identity of unique.values()) {
    const sourceBounds = lodTileBounds(identity);
    const sourceKey = selectionKey(identity);
    const distance = distanceToBounds(view, sourceBounds);
    distances.set(sourceKey, distance);
    if (distance > config.maxDistance) {
      rejected.push({ key: sourceKey, reason: 'distance' });
      continue;
    }
    const selectedLod = chooseLod(distance, previousLodByKey.get(sourceKey), config);
    const selectedSpan = lodTileBlockSpan(selectedLod);
    const selectedIdentity = validateLodTileIdentity({
      ...identity,
      lod: selectedLod,
      tileX: Math.floor(sourceBounds.minX / selectedSpan),
      tileZ: Math.floor(sourceBounds.minZ / selectedSpan),
    });
    const selectedKey = lodTileKey(selectedIdentity);
    if (view.frustum && !view.frustum(lodTileBounds(selectedIdentity))) {
      rejected.push({ key: sourceKey, reason: 'frustum' });
      continue;
    }
    eligible.push({ identity: selectedIdentity, key: selectedKey, distance });
  }

  eligible.sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key));
  const selectedByKey = new Map<string, { identity: LodTileIdentity; key: string; distance: number }>();
  for (const candidate of eligible) {
    const existing = selectedByKey.get(candidate.key);
    if (existing === undefined || candidate.distance < existing.distance) selectedByKey.set(candidate.key, candidate);
  }
  const uniqueEligible = [...selectedByKey.values()].sort(
    (a, b) => a.distance - b.distance || a.key.localeCompare(b.key),
  );
  const selected = uniqueEligible.slice(0, config.maxTiles);
  for (const candidate of uniqueEligible.slice(config.maxTiles)) {
    rejected.push({ key: candidate.key, reason: 'capacity' });
  }
  return {
    selected: selected.map((candidate) => candidate.identity),
    selectedKeys: selected.map((candidate) => candidate.key),
    rejected,
    distances,
  };
}
