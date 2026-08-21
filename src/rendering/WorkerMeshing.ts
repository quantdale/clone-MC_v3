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
  type ResolvedOutcome,
  type WorkerResult,
} from './WorkerJobProtocol';
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

/** A section-meshing job request (plain data; structured-clone-safe). */
export interface MeshSectionRequestPayload {
  sectionX: number;
  sectionY: number;
  sectionZ: number;
  /** 4096 world-cell block ids; `null` = air. Index = x + 16*(y + 16*z). */
  cells: Array<number | null>;
  /** Block ids treated as opaque. */
  opaqueIds: number[];
  /** 4096 per-cell sky light values in [0, 15] (070). */
  skyLight: number[];
  /** 4096 per-cell block light values in [0, 15] (070). */
  blockLight: number[];
}

/** A section-meshing job result (quad form, as produced by `processMeshSectionRequest`). */
export interface MeshSectionResultPayload {
  sectionX: number;
  sectionY: number;
  sectionZ: number;
  quads: OpaqueFaceQuad[];
  /** Version/generation token echoed from the request (present on pooled results). */
  generationToken?: number;
  /**
   * Packed typed-array form of `quads` (worker-entry transport). When present the
   * main thread expands it directly and `quads` is empty.
   */
  packed?: PackedMeshResult;
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
    ...validateResultBody(r),
  };
}

/**
 * Validate the body of a mesh result after envelope identity checks: either the quad form
 * (`quads`) or the packed typed-array form (`data`/`quadCount`/`stride`, produced by the
 * worker entry). Throws on any invalid field.
 */
function validateResultBody(
  r: Record<string, unknown>,
): { quads: OpaqueFaceQuad[] } | { quads: OpaqueFaceQuad[]; packed: PackedMeshResult } {
  if (r.data !== undefined || r.quadCount !== undefined || r.stride !== undefined) {
    if (!(r.data instanceof Float32Array)) {
      throw new Error('MeshSectionResult: packed data must be a Float32Array');
    }
    if (!Number.isInteger(r.quadCount) || (r.quadCount as number) < 0) {
      throw new Error('MeshSectionResult: quadCount must be a non-negative integer');
    }
    if (r.stride !== PACKED_QUAD_STRIDE) {
      throw new Error(`MeshSectionResult: stride must be ${PACKED_QUAD_STRIDE}`);
    }
    if ((r.data as Float32Array).length !== (r.quadCount as number) * PACKED_QUAD_STRIDE) {
      throw new Error('MeshSectionResult: packed data length must equal quadCount * stride');
    }
    return {
      quads: [],
      packed: { data: r.data as Float32Array, quadCount: r.quadCount as number, stride: PACKED_QUAD_STRIDE },
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
    quads.push(raw as OpaqueFaceQuad);
  }
  return quads;
}

/** Validate an untyped worker request payload as a {@link MeshSectionRequestPayload}. */
export function validateMeshSectionRequest(input: unknown): MeshSectionRequestPayload {
  if (typeof input !== 'object' || input === null) {
    throw new Error('MeshSectionRequest: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (!Number.isInteger(r.sectionX) || !Number.isInteger(r.sectionY) || !Number.isInteger(r.sectionZ)) {
    throw new Error('MeshSectionRequest: section coordinates must be integers');
  }
  if (
    !Array.isArray(r.cells) || (r.cells as unknown[]).length !== SECTION * SECTION * SECTION ||
    !(r.cells as unknown[]).every((c) => c === null || (typeof c === 'number' && Number.isInteger(c) && c >= 0))
  ) {
    throw new Error('MeshSectionRequest: cells must be 4096 entries of null or non-negative integers');
  }
  if (!Array.isArray(r.opaqueIds) ||
    !(r.opaqueIds as unknown[]).every((id) => typeof id === 'number' && Number.isInteger(id))) {
    throw new Error('MeshSectionRequest: opaqueIds must be an array of integers');
  }
  assertLightArray('skyLight', r.skyLight);
  assertLightArray('blockLight', r.blockLight);
  return {
    sectionX: r.sectionX as number,
    sectionY: r.sectionY as number,
    sectionZ: r.sectionZ as number,
    cells: r.cells as Array<number | null>,
    opaqueIds: r.opaqueIds as number[],
    skyLight: r.skyLight as number[],
    blockLight: r.blockLight as number[],
  };
}

const SECTION = 16;

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
  return { data, quadCount: quads.length, stride: PACKED_QUAD_STRIDE };
}

function assertLightArray(name: string, values: unknown): asserts values is number[] {
  if (!Array.isArray(values) || values.length !== SECTION * SECTION * SECTION) {
    throw new Error(`MeshSectionRequest: ${name} must be an array of 4096 entries`);
  }
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    if (!Number.isInteger(value) || value < 0 || value > 15) {
      throw new RangeError(`MeshSectionRequest: ${name} values must be integers in [0, 15], got ${value} at index ${i}`);
    }
  }
}

/** Build a section-local light sampler over a validated payload (070). */
export function sectionLightSampler(payload: MeshSectionRequestPayload): LightSampler {
  const opaque = new Set(payload.opaqueIds);

  // The greedy mesher samples with section-LOCAL coordinates (0..15); the payload's
  // sectionX/Y/Z are identity metadata echoed on results, not sampling offsets.
  const localIndex = (x: number, y: number, z: number): number | null => {
    if (x < 0 || x >= SECTION || y < 0 || y >= SECTION || z < 0 || z >= SECTION) return null;
    return x + y * SECTION + z * SECTION * SECTION;
  };

  return {
    inBounds: (x, y, z) => localIndex(x, y, z) !== null,
    isOpaque: (x, y, z) => {
      const index = localIndex(x, y, z);
      if (index === null) return false;
      const id = payload.cells[index];
      return id !== null && id !== undefined && opaque.has(id);
    },
    getSkyLight: (x, y, z) => payload.skyLight[localIndex(x, y, z)!]!,
    getBlockLight: (x, y, z) => payload.blockLight[localIndex(x, y, z)!]!,
  };
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
  if (!Array.isArray(payload.cells) || payload.cells.length !== SECTION * SECTION * SECTION) {
    throw new Error('MeshSectionRequest: cells must be an array of 4096 entries');
  }
  assertLightArray('skyLight', payload.skyLight);
  assertLightArray('blockLight', payload.blockLight);
  const opaque = new Set(payload.opaqueIds);

  // Greedy mesher samples in section-LOCAL coordinates; sectionX/Y/Z are identity only.
  const getCell: FaceCellSampler = (x, y, z) => {
    if (x < 0 || x >= SECTION || y < 0 || y >= SECTION || z < 0 || z >= SECTION) {
      return null;
    }
    return payload.cells[x + y * SECTION + z * SECTION * SECTION] ?? null;
  };
  const isOpaque = (id: number): boolean => opaque.has(id);
  const faceKey = (id: number): string => String(id);

  const quads = greedyMergeOpaqueFaces(getCell, isOpaque, faceKey, sectionLightSampler(payload));
  const result: MeshSectionResultPayload = {
    sectionX: payload.sectionX,
    sectionY: payload.sectionY,
    sectionZ: payload.sectionZ,
    quads,
  };
  if (generationToken !== undefined) result.generationToken = generationToken;
  return result;
}

/**
 * Main-thread dispatcher for section meshing jobs over the unified protocol. Detached mode (no
 * pool) keeps the synchronous harness contract: callers feed validated result messages into
 * `handleMessage` themselves. Pool mode posts real worker requests and routes results back through
 * the same exactly-once resolution path.
 */
export class MeshWorkerClient {
  private readonly jobs = new WorkerJobClient();
  private readonly callbacks = new Map<string, (result: MeshSectionResultPayload) => void>();
  /** Submission-time token per pending job (mirrors `WorkerJobClient` state for cancellation sweeps). */
  private readonly tokens = new Map<string, number>();
  /** Submission payload per pending job (identity matching against result coordinates). */
  private readonly requests = new Map<string, MeshSectionRequestPayload>();
  private pool: WorkerPool | null = null;
  private generationToken = 0;

  constructor(opts: { pool?: WorkerPool; generationToken?: number } = {}) {
    if (opts.pool) this.pool = opts.pool;
    if (opts.generationToken !== undefined) this.generationToken = opts.generationToken;
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

  /** Submit a section meshing job; `onResult` fires exactly once on a valid resolution. */
  requestSection(payload: MeshSectionRequestPayload, onResult: (result: MeshSectionResultPayload) => void): string {
    const token = this.generationToken;
    const jobId = this.jobs.submit('mesh-section', token);
    this.callbacks.set(jobId, onResult);
    this.tokens.set(jobId, token);
    this.requests.set(jobId, payload);
    if (this.pool) {
      try {
        this.pool.submit({
          kind: 'mesh-section',
          generationToken: token,
          payload,
          onResult: (result) => {
            // Pool payloads are untyped transport: validate structure and require section-coordinate
            // identity before anything can resolve the job.
            let validated: MeshSectionResultPayload;
            try {
              validated = validateMeshSectionResult(result);
            } catch {
              this.abandon(jobId); // malformed payload can never satisfy the job
              return;
            }
            if (!this.matchesRequest(jobId, validated)) {
              this.abandon(jobId); // foreign/stale identity must not resolve the job
              return;
            }
            this.complete(jobId, validated, token);
          },
          onFailure: () => {
            // Abandon the job (worker loss/dispose): no result is delivered; late results become stale.
            this.abandon(jobId);
          },
        });
      } catch (err) {
        // Synchronous pool rejection (bounded queue full): keep bookkeeping truthful.
        this.abandon(jobId);
        throw err;
      }
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
    if (outcome === null || !outcome.ok || outcome.payload === undefined) return null;

    let payload: MeshSectionResultPayload;
    try {
      payload = validateMeshSectionResult(outcome.payload);
    } catch {
      return null; // malformed payload: never resolves the job
    }
    if (!this.matchesRequest(outcome.jobId, payload)) return null;
    return this.complete(outcome.jobId, payload, outcome.generationToken);
  }

  /** Cancel a pending job (its late result becomes stale). */
  cancel(jobId: string): boolean {
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
      if (token === generationToken && this.jobs.cancel(jobId)) {
        this.abandon(jobId);
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

  /** Drop all per-job bookkeeping without invoking the callback (failure/stale/invalid paths). */
  private abandon(jobId: string): void {
    this.jobs.cancel(jobId);
    this.callbacks.delete(jobId);
    this.tokens.delete(jobId);
    this.requests.delete(jobId);
  }
}

// ---------------------------------------------------------------------------
// Main-thread packed-result expansion (World.ts worker-meshing integration).
// ---------------------------------------------------------------------------

/** Per-face expansion conventions for the stride-22 packed quad layout. */
interface PackedFaceLayout {
  /** Outward normal. */
  normal: [number, number, number];
  /**
   * Min-corner vertex offset (block units) plus unit U/V edge directions.
   * Corners are emitted in the canonical `(minU,minV), (maxU,minV), (minU,maxV),
   * (maxU,maxV)` order; winding is CCW from outside, matching `ChunkMesher`.
   */
  origin: [number, number, number];
  uDir: [number, number, number];
  vDir: [number, number, number];
}

/** Expansion layouts indexed by `FACE_INDEX` (up, down, north, south, east, west). */
const PACKED_FACE_LAYOUTS: readonly PackedFaceLayout[] = [
  { normal: [0, 1, 0], origin: [0, 1, 0], uDir: [1, 0, 0], vDir: [0, 0, 1] }, // up    (+Y)
  { normal: [0, -1, 0], origin: [0, 0, 0], uDir: [1, 0, 0], vDir: [0, 0, 1] }, // down  (-Y)
  { normal: [0, 0, -1], origin: [0, 0, 0], uDir: [1, 0, 0], vDir: [0, 1, 0] }, // north (-Z)
  { normal: [0, 0, 1], origin: [0, 0, 1], uDir: [1, 0, 0], vDir: [0, 1, 0] }, // south (+Z)
  { normal: [1, 0, 0], origin: [1, 0, 0], uDir: [0, 0, 1], vDir: [0, 1, 0] }, // east  (+X)
  { normal: [-1, 0, 0], origin: [0, 0, 0], uDir: [0, 0, 1], vDir: [0, 1, 0] }, // west  (-X)
];

/** Expanded per-stream scratch used while decoding one packed buffer. */
interface ExpandStream {
  positions: number[];
  normals: number[];
  uvs: number[];
  skyLight: number[];
  blockLight: number[];
  ao: number[];
  tint: number[];
  indices: number[];
  vertices: number;
}

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

function emptyExpandStream(): ExpandStream {
  return {
    positions: [], normals: [], uvs: [],
    skyLight: [], blockLight: [], ao: [], tint: [],
    indices: [], vertices: 0,
  };
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
 * Decode a stride-22 packed quad buffer ({@link packQuadsToTypedArrays} output) into four-stream
 * BufferGeometries. Main-thread only (builds geometry via `info.buildGeometry`); deterministic.
 *
 * Tint classes carry resolved 24-bit biome colors through the packed layout; they are decoded
 * here via {@link packedTintRgb} so worker-path output matches the sync mesher's tints.
 */
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
    const cu = c === 1 || c === 3 ? quad.width : 0;
    const cv = c >= 2 ? quad.height : 0;
    corners.push([
      quad.x + layout.origin[0] + layout.uDir[0] * cu + layout.vDir[0] * cv,
      quad.y + layout.origin[1] + layout.uDir[1] * cu + layout.vDir[1] * cv,
      quad.z + layout.origin[2] + layout.uDir[2] * cu + layout.vDir[2] * cv,
    ]);
  }
  return { corners, normal: [...layout.normal] as [number, number, number], faceIndex };
}

export function expandPackedMeshResult(packed: PackedMeshResult, info: PackedMeshExpandInfo): PackedMeshGeometries {
  const streams: Record<MeshStreamName, ExpandStream> = {
    opaque: emptyExpandStream(),
    cutout: emptyExpandStream(),
    translucent: emptyExpandStream(),
    fluid: emptyExpandStream(),
  };

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
    const stream = streams[info.renderLayerOf(blockId)]!;

    const base = stream.vertices;
    const uv = info.uvFor(blockId, faceIndex);
    const cornerUv: ReadonlyArray<readonly [number, number]> = [
      [uv.u0, uv.v0],
      [uv.u1, uv.v0],
      [uv.u0, uv.v1],
      [uv.u1, uv.v1],
    ];
    for (let c = 0; c < 4; c++) {
      const cu = c === 1 || c === 3 ? width : 0;
      const cv = c >= 2 ? height : 0;
      stream.positions.push(
        x + layout.origin[0] + layout.uDir[0] * cu + layout.vDir[0] * cv,
        y + layout.origin[1] + layout.uDir[1] * cu + layout.vDir[1] * cv,
        z + layout.origin[2] + layout.uDir[2] * cu + layout.vDir[2] * cv,
      );
      stream.normals.push(layout.normal[0], layout.normal[1], layout.normal[2]);
      stream.uvs.push(cornerUv[c]![0], cornerUv[c]![1]);
      const lightBase = o + 10 + c * 3;
      stream.skyLight.push(packed.data[lightBase]!);
      stream.blockLight.push(packed.data[lightBase + 1]!);
      stream.ao.push(packed.data[lightBase + 2]!);
      const [tr, tg, tb] = packedTintRgb(packed.data[o + 7]!);
      stream.tint.push(tr, tg, tb);
      stream.vertices++;
    }
    // CCW winding matching MeshingTypes' pushQuadIndices convention.
    stream.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return {
    opaque: buildExpandedGeometry(streams.opaque, info, 'opaque'),
    cutout: buildExpandedGeometry(streams.cutout, info, 'cutout'),
    translucent: buildExpandedGeometry(streams.translucent, info, 'translucent'),
    fluid: buildExpandedGeometry(streams.fluid, info, 'fluid'),
  };
}

function buildExpandedGeometry(s: ExpandStream, info: PackedMeshExpandInfo, name: MeshStreamName): THREE.BufferGeometry | null {
  if (s.vertices === 0) return null;
  const data: MeshStreamData = {
    positions: new Float32Array(s.positions),
    normals: new Float32Array(s.normals),
    uvs: new Float32Array(s.uvs),
    skyLight: new Uint8Array(s.skyLight),
    blockLight: new Uint8Array(s.blockLight),
    ao: new Uint8Array(s.ao),
    tint: new Float32Array(s.tint),
    indices: new Uint32Array(s.indices),
    vertexCount: s.vertices,
    indexCount: s.indices.length,
  };
  return info.buildGeometry(data, name);
}
