import type * as THREE from 'three';
import type { SectionVersionSnapshot } from './SectionVersionSnapshot';
import type { AOLevel, OpaqueFaceQuad, VertexLight } from '../rendering/GreedyMesher';

/**
 * Canonical typed mesh-stream model shared by every mesher (audit 03 "Meshing",
 * 04 "Meshing strategy"). A chunk build produces exactly four render streams —
 * `opaque`, `cutout`, `translucent`, `fluid` — each as plain typed arrays ready
 * for GPU upload or structured-clone transfer to a worker. Every build is
 * stamped with the caller's `inputVersion` token so integration code can reject
 * stale results instead of flashing old geometry.
 */

/** The four canonical render streams, in pinned submission order. */
export type MeshStreamName = 'opaque' | 'cutout' | 'translucent' | 'fluid';

/** Stream names in pinned render order (opaque first, fluid last). */
export const MESH_STREAM_NAMES: readonly MeshStreamName[] = [
  'opaque',
  'cutout',
  'translucent',
  'fluid',
];

/**
 * One finished render stream. Attribute conventions match the historical
 * ChunkMesher output (`position`/`normal`/`uv`, indexed triangles, CCW
 * winding) plus the 070/071/072 vertex-shading attributes:
 *
 * - `skyLight` / `blockLight`: per-vertex 0-15 light levels (070);
 * - `ao`: per-vertex Minecraft AO level 0-3 (071);
 * - `tint`: per-vertex RGB biome tint, 3 floats per vertex, 1 = white (072).
 */
export interface MeshStreamData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  skyLight: Uint8Array;
  blockLight: Uint8Array;
  ao: Uint8Array;
  tint: Float32Array;
  indices: Uint32Array;
  /** Number of valid vertices (`positions.length === vertexCount * 3`). */
  vertexCount: number;
  /** Number of valid indices (`indices.length === indexCount`). */
  indexCount: number;
}

/** Per-stream counters describing one build. */
export interface MeshStreamBuildMetadata {
  vertexCount: number;
  indexCount: number;
  quadCount: number;
}

/** Full result of one mesh build: all four streams plus build metadata. */
export interface MeshBuildResult {
  /** Caller-supplied version token; integration rejects results whose token is stale. */
  inputVersion: number;
  streams: Readonly<Record<MeshStreamName, MeshStreamData>>;
  metadata: Readonly<Record<MeshStreamName, MeshStreamBuildMetadata>>;
}

// Shared frozen empty buffers: empty streams never allocate per build.
const EMPTY_F32 = new Float32Array(0);
const EMPTY_U8 = new Uint8Array(0);
const EMPTY_U32 = new Uint32Array(0);

/** An empty stream with zero-length (shared) buffers. */
export function emptyMeshStream(): MeshStreamData {
  return {
    positions: EMPTY_F32,
    normals: EMPTY_F32,
    uvs: EMPTY_F32,
    skyLight: EMPTY_U8,
    blockLight: EMPTY_U8,
    ao: EMPTY_U8,
    tint: EMPTY_F32,
    indices: EMPTY_U32,
    vertexCount: 0,
    indexCount: 0,
  };
}

/** An all-empty MeshBuildResult stamped with `inputVersion`. */
export function emptyMeshBuildResult(inputVersion = 0): MeshBuildResult {
  const streams = {} as Record<MeshStreamName, MeshStreamData>;
  const metadata = {} as Record<MeshStreamName, MeshStreamBuildMetadata>;
  for (const name of MESH_STREAM_NAMES) {
    streams[name] = emptyMeshStream();
    metadata[name] = { vertexCount: 0, indexCount: 0, quadCount: 0 };
  }
  return { inputVersion, streams, metadata };
}

const INITIAL_VERTEX_CAPACITY = 4096;
const INITIAL_INDEX_CAPACITY = INITIAL_VERTEX_CAPACITY * 1.5;

/** Grow-only Float32Array scratch (capacity never shrinks between builds). */
class GrowFloat32 {
  private arr: Float32Array = new Float32Array(0);
  private used = 0;

  reset(): void {
    this.used = 0;
  }

  get length(): number {
    return this.used;
  }

  reserve(extra: number): void {
    const needed = this.used + extra;
    if (needed <= this.arr.length) return;
    let capacity = Math.max(this.arr.length, INITIAL_VERTEX_CAPACITY);
    while (capacity < needed) capacity *= 2;
    const next = new Float32Array(capacity);
    next.set(this.arr.subarray(0, this.used));
    this.arr = next;
  }

  push3(a: number, b: number, c: number): void {
    this.reserve(3);
    this.arr[this.used++] = a;
    this.arr[this.used++] = b;
    this.arr[this.used++] = c;
  }

  push2(a: number, b: number): void {
    this.reserve(2);
    this.arr[this.used++] = a;
    this.arr[this.used++] = b;
  }

  snapshot(): Float32Array {
    return this.arr.length === this.used ? this.arr : this.arr.slice(0, this.used);
  }
}

/** Grow-only Uint8Array scratch. */
class GrowUint8 {
  private arr: Uint8Array = new Uint8Array(0);
  private used = 0;

  reset(): void {
    this.used = 0;
  }

  reserve(extra: number): void {
    const needed = this.used + extra;
    if (needed <= this.arr.length) return;
    let capacity = Math.max(this.arr.length, INITIAL_VERTEX_CAPACITY);
    while (capacity < needed) capacity *= 2;
    const next = new Uint8Array(capacity);
    next.set(this.arr.subarray(0, this.used));
    this.arr = next;
  }

  push(value: number): void {
    this.reserve(1);
    this.arr[this.used++] = value;
  }

  snapshot(): Uint8Array {
    return this.arr.length === this.used ? this.arr : this.arr.slice(0, this.used);
  }
}

/** Grow-only Uint32Array scratch for indices. */
class GrowUint32 {
  private arr: Uint32Array = new Uint32Array(0);
  private used = 0;

  reset(): void {
    this.used = 0;
  }

  get length(): number {
    return this.used;
  }

  reserve(extra: number): void {
    const needed = this.used + extra;
    if (needed <= this.arr.length) return;
    let capacity = Math.max(this.arr.length, INITIAL_INDEX_CAPACITY);
    while (capacity < needed) capacity *= 2;
    const next = new Uint32Array(capacity);
    next.set(this.arr.subarray(0, this.used));
    this.arr = next;
  }

  pushQuad(base: number): void {
    this.reserve(6);
    // CCW winding matching the historical ChunkMesher: (0,1,2) and (0,2,3).
    const a = this.arr;
    a[this.used++] = base;
    a[this.used++] = base + 1;
    a[this.used++] = base + 2;
    a[this.used++] = base;
    a[this.used++] = base + 2;
    a[this.used++] = base + 3;
  }

  snapshot(): Uint32Array {
    return this.arr.length === this.used ? this.arr : this.arr.slice(0, this.used);
  }
}

/**
 * Allocation-reusing builder for one render stream. Scratch buffers are
 * grow-only: repeated builds settle at peak capacity with zero steady-state
 * allocation (audit 04: "reuse scratch vectors/arrays within meshing loops").
 */
export class MeshStreamBuilder {
  private positions = new GrowFloat32();
  private normals = new GrowFloat32();
  private uvs = new GrowFloat32();
  private sky = new GrowUint8();
  private block = new GrowUint8();
  private ao = new GrowUint8();
  private tints = new GrowFloat32();
  private indices = new GrowUint32();
  private vertices = 0;
  private quads = 0;

  /** Drop all vertices/indices; capacity is retained for the next build. */
  reset(): void {
    this.positions.reset();
    this.normals.reset();
    this.uvs.reset();
    this.sky.reset();
    this.block.reset();
    this.ao.reset();
    this.tints.reset();
    this.indices.reset();
    this.vertices = 0;
    this.quads = 0;
  }

  get vertexCount(): number {
    return this.vertices;
  }

  get quadCount(): number {
    return this.quads;
  }

  /**
   * Append one vertex; returns its index (usable by custom index emission).
   * `sky`/`block` are 0-15 light levels, `aoLevel` is 0-3, `r/g/b` the biome
   * tint (1 = untinted).
   */
  pushVertex(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    u: number,
    v: number,
    sky: number,
    block: number,
    aoLevel: number,
    r: number,
    g: number,
    b: number,
  ): number {
    this.positions.push3(x, y, z);
    this.normals.push3(nx, ny, nz);
    this.uvs.push2(u, v);
    this.sky.push(sky);
    this.block.push(block);
    this.ao.push(aoLevel);
    this.tints.push3(r, g, b);
    return this.vertices++;
  }

  /** Emit the two CCW triangles for the four vertices ending at `lastIndex`. */
  pushQuadIndices(lastIndex?: number): void {
    const end = lastIndex ?? this.vertices - 1;
    this.indices.pushQuad(end - 3);
    this.quads++;
  }

  /** Freeze the current contents into a typed-array stream snapshot. */
  toStream(): MeshStreamData {
    if (this.vertices === 0) {
      return emptyMeshStream();
    }
    return {
      positions: this.positions.snapshot(),
      normals: this.normals.snapshot(),
      uvs: this.uvs.snapshot(),
      skyLight: this.sky.snapshot(),
      blockLight: this.block.snapshot(),
      ao: this.ao.snapshot(),
      tint: this.tints.snapshot(),
      indices: this.indices.snapshot(),
      vertexCount: this.vertices,
      indexCount: this.indices.length,
    };
  }
}

/**
 * Set of four reusable stream builders plus the assembled `MeshBuildResult`.
 * This is the single entry point every mesher build routes through.
 */
export class MeshBuildResultBuilder {
  private readonly builders: Record<MeshStreamName, MeshStreamBuilder> = {
    opaque: new MeshStreamBuilder(),
    cutout: new MeshStreamBuilder(),
    translucent: new MeshStreamBuilder(),
    fluid: new MeshStreamBuilder(),
  };

  /** The builder for one stream (write target during a build). */
  builder(name: MeshStreamName): MeshStreamBuilder {
    return this.builders[name];
  }

  /** Reset every stream builder (capacities retained). */
  reset(): void {
    for (const name of MESH_STREAM_NAMES) {
      this.builders[name].reset();
    }
  }

  /** Assemble the immutable result, stamped with `inputVersion`. */
  build(inputVersion: number): MeshBuildResult {
    const streams = {} as Record<MeshStreamName, MeshStreamData>;
    const metadata = {} as Record<MeshStreamName, MeshStreamBuildMetadata>;
    for (const name of MESH_STREAM_NAMES) {
      const builder = this.builders[name];
      streams[name] = builder.toStream();
      metadata[name] = {
        vertexCount: builder.vertexCount,
        indexCount: builder.vertexCount > 0 ? builder.vertexCount / 4 * 6 : 0,
        quadCount: builder.quadCount,
      };
    }
    return { inputVersion, streams, metadata };
  }
}

/** Atlas rectangle for one texture tile, in UV units. */
export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Per-corner UV selector matching the historical ChunkMesher convention. */
const VERTEX_U_INDEX = [0, 1, 1, 0];
const VERTEX_V_INDEX = [0, 0, 1, 1];

/**
 * Emit one shaded quad into a stream builder. `corners` are the four vertex
 * positions in the mesher's CCW-from-outside order; `lights`/`aoLevels` use the
 * 070/071 corner order `(minU,minV), (maxU,minV), (minU,maxV), (maxU,maxV)`,
 * which is aligned with the corner list by convention. UVs map
 * c0→(u0,v0), c1→(u1,v0), c2→(u1,v1), c3→(u0,v1).
 */
export function emitQuad(
  builder: MeshStreamBuilder,
  corners: readonly [number, number, number][],
  nx: number,
  ny: number,
  nz: number,
  uv: UvRect,
  lights: readonly VertexLight[],
  aoLevels: readonly AOLevel[],
  tintR: number,
  tintG: number,
  tintB: number,
): void {
  let last = 0;
  for (let c = 0; c < 4; c++) {
    const corner = corners[c]!;
    const light = lights[c] ?? { sky: 15, block: 0 };
    const aoLevel = aoLevels[c] ?? 3;
    last = builder.pushVertex(
      corner[0],
      corner[1],
      corner[2],
      nx,
      ny,
      nz,
      VERTEX_U_INDEX[c] === 1 ? uv.u1 : uv.u0,
      VERTEX_V_INDEX[c] === 1 ? uv.v1 : uv.v0,
      light.sky,
      light.block,
      aoLevel,
      tintR,
      tintG,
      tintB,
    );
  }
  builder.pushQuadIndices(last);
}

/**
 * Convenience wrapper emitting a quad description (as produced by the greedy,
 * template and fluid meshers) with explicit corner positions.
 */
export function emitQuadCorners(
  builder: MeshStreamBuilder,
  quad: OpaqueFaceQuad,
  corners: readonly [number, number, number][],
  nx: number,
  ny: number,
  nz: number,
  uv: UvRect,
  tintR = 1,
  tintG = 1,
  tintB = 1,
): void {
  emitQuad(builder, corners, nx, ny, nz, uv, quad.vertexLights, quad.vertexAO, tintR, tintG, tintB);
}

/**
 * Result of meshing a chunk: up to one geometry per render stream, plus the
 * canonical typed-stream build behind them. `opaque`/`transparent` preserve the
 * historical two-field shape consumed by `World.attach`; `transparent` aliases
 * the translucent stream. Each geometry field is `null` when its stream is
 * empty. Integration must dispose replaced geometries and may reject the whole
 * result when `streams.inputVersion` is stale.
 */
export interface ChunkMeshResult {
  opaque: THREE.BufferGeometry | null;
  transparent: THREE.BufferGeometry | null;
  /** Alpha-tested (cutout) stream geometry. */
  cutout: THREE.BufferGeometry | null;
  /** Blended non-fluid stream geometry. */
  translucent: THREE.BufferGeometry | null;
  /** Fluid surface stream geometry. */
  fluid: THREE.BufferGeometry | null;
  /** The canonical mesh/light versions captured when this build was submitted. */
  versionSnapshot?: SectionVersionSnapshot;
  /** The canonical four-stream typed build the geometries were derived from. */
  streams: MeshBuildResult;
}

/** World diagnostics exposed to the debug overlay. */
export interface WorldStats {
  /** Materialized legacy slab projections retained for render/simulation compatibility. */
  loadedChunks: number;
  /** Authoritative horizontal column residency count. */
  residentColumns: number;
  /** Canonical sections materialized across resident columns. */
  allocatedSections: number;
  /** Canonical columns containing unsaved state. */
  dirtyColumns: number;
  /** Canonical dirty sections across all resident columns. */
  dirtySections: number;
  /** Live scene mesh groups owned by resident slab projections. */
  geometries: number;
  /** Queued, not-yet-applied light invalidations. */
  pendingLight: number;
  /** Persistence jobs are owned by GamePersistence; World exposes zero until such jobs are attached. */
  pendingSave: number;
  pendingGeneration: number;
  pendingMesh: number;
  /** Resident slab projections still awaiting budgeted out-of-radius unload. */
  pendingUnload: number;
  triangles: number;
  voxels: number;
}
