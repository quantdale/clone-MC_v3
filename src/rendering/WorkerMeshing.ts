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

/** A section-meshing job result. */
export interface MeshSectionResultPayload {
  sectionX: number;
  sectionY: number;
  sectionZ: number;
  quads: OpaqueFaceQuad[];
  /** Version/generation token echoed from the request (present on pooled results). */
  generationToken?: number;
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
  const baseX = payload.sectionX * SECTION;
  const baseY = payload.sectionY * SECTION;
  const baseZ = payload.sectionZ * SECTION;
  const opaque = new Set(payload.opaqueIds);

  const localIndex = (x: number, y: number, z: number): number | null => {
    const dx = x - baseX;
    const dy = y - baseY;
    const dz = z - baseZ;
    if (dx < 0 || dx >= SECTION || dy < 0 || dy >= SECTION || dz < 0 || dz >= SECTION) return null;
    return dx + dy * SECTION + dz * SECTION * SECTION;
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
  const baseX = payload.sectionX * SECTION;
  const baseY = payload.sectionY * SECTION;
  const baseZ = payload.sectionZ * SECTION;

  const getCell: FaceCellSampler = (x, y, z) => {
    const dx = x - baseX;
    const dy = y - baseY;
    const dz = z - baseZ;
    if (dx < 0 || dx >= SECTION || dy < 0 || dy >= SECTION || dz < 0 || dz >= SECTION) {
      return null;
    }
    return payload.cells[dx + dy * SECTION + dz * SECTION * SECTION] ?? null;
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
    if (this.pool) {
      this.pool.submit({
        kind: 'mesh-section',
        generationToken: token,
        payload,
        onResult: (result) => {
          this.complete(jobId, result as MeshSectionResultPayload, token);
        },
        onFailure: () => {
          // Abandon the job (worker loss/dispose): no result is delivered; late results become stale.
          this.jobs.cancel(jobId);
          this.callbacks.delete(jobId);
          this.tokens.delete(jobId);
        },
      });
    }
    return jobId;
  }

  /**
   * Handle a worker message: validate + resolve via the unified protocol; on success invoke the
   * job's callback once and return the result. Stale/invalid messages return `null` and invoke
   * nothing.
   */
  handleMessage(input: unknown): MeshSectionResultPayload | null {
    const outcome: ResolvedOutcome | null = this.jobs.resolveResult(input);
    if (outcome === null || !outcome.ok) return null;

    const payload = outcome.payload as MeshSectionResultPayload | undefined;
    if (payload === undefined) return null;
    return this.complete(outcome.jobId, payload, outcome.generationToken);
  }

  /** Cancel a pending job (its late result becomes stale). */
  cancel(jobId: string): boolean {
    const removed = this.jobs.cancel(jobId);
    this.callbacks.delete(jobId);
    this.tokens.delete(jobId);
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
        this.callbacks.delete(jobId);
        this.tokens.delete(jobId);
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

  /**
   * Shared exactly-once completion: drop the pending job (stale/unknown ids are ignored), fire its
   * callback once, and return the token-stamped result. Used by both the pooled path and
   * `handleMessage`.
   */
  private complete(jobId: string, payload: MeshSectionResultPayload, token: number): MeshSectionResultPayload | null {
    if (!this.jobs.cancel(jobId)) return null; // stale / cancelled / already resolved
    const callback = this.callbacks.get(jobId);
    this.callbacks.delete(jobId);
    this.tokens.delete(jobId);
    const result: MeshSectionResultPayload =
      token === UNVERSIONED_TOKEN ? payload : { ...payload, generationToken: token };
    const callback = this.callbacks.get(jobId);
    if (callback) callback(result);
    return result;
  }
}
