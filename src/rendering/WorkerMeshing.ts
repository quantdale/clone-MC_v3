/**
 * Worker section meshing (065). `processMeshSectionRequest` is a pure, structured-clone-safe job the
 * worker executes: it turns a section's plain cells/opacity data into merged `OpaqueFaceQuad`s via
 * 062. `MeshWorkerClient` is the main-thread side: it submits jobs over the 064 protocol, resolves
 * results exactly once (stale results rejected), and dispatches outcomes to per-job callbacks.
 */
import { WORKER_PROTOCOL_VERSION, WorkerJobClient, type ResolvedOutcome } from './WorkerJobProtocol';
import {
  greedyMergeOpaqueFaces,
  type FaceCellSampler,
  type OpaqueFaceQuad,
} from './GreedyMesher';

/** A section-meshing job request (plain data; structured-clone-safe). */
export interface MeshSectionRequestPayload {
  sectionX: number;
  sectionY: number;
  sectionZ: number;
  /** 4096 world-cell block ids; `null` = air. Index = x + 16*(y + 16*z). */
  cells: Array<number | null>;
  /** Block ids treated as opaque. */
  opaqueIds: number[];
}

/** A section-meshing job result. */
export interface MeshSectionResultPayload {
  sectionX: number;
  sectionY: number;
  sectionZ: number;
  quads: OpaqueFaceQuad[];
}

const SECTION = 16;

/**
 * Execute a section meshing job (what the worker runs). Pure and deterministic; delegates to 062
 * with a sampler built from the plain payload and the merge key = block id.
 */
export function processMeshSectionRequest(payload: MeshSectionRequestPayload): MeshSectionResultPayload {
  if (!Array.isArray(payload.cells) || payload.cells.length !== SECTION * SECTION * SECTION) {
    throw new Error('MeshSectionRequest: cells must be an array of 4096 entries');
  }
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

  const quads = greedyMergeOpaqueFaces(getCell, isOpaque, faceKey);
  return { sectionX: payload.sectionX, sectionY: payload.sectionY, sectionZ: payload.sectionZ, quads };
}

/** Main-thread dispatcher for section meshing jobs over the 064 protocol. */
export class MeshWorkerClient {
  private readonly jobs = new WorkerJobClient();
  private readonly callbacks = new Map<string, (result: MeshSectionResultPayload) => void>();

  /** Submit a section meshing job; `onResult` fires exactly once on a valid resolution. */
  requestSection(
    payload: MeshSectionRequestPayload,
    onResult: (result: MeshSectionResultPayload) => void,
  ): string {
    const jobId = this.jobs.submit('mesh-section', payload);
    this.callbacks.set(jobId, onResult);
    return jobId;
  }

  /**
   * Handle a worker message: validate + resolve via 064; on success invoke the job's callback once
   * and return the result. Stale/invalid messages return `null` and invoke nothing.
   */
  handleMessage(input: unknown): MeshSectionResultPayload | null {
    const outcome: ResolvedOutcome | null = this.jobs.resolveResult(input);
    if (outcome === null || !outcome.ok) return null;

    const payload = outcome.payload as MeshSectionResultPayload | undefined;
    if (payload === undefined) return null;

    const callback = this.callbacks.get(outcome.jobId);
    this.callbacks.delete(outcome.jobId);
    if (callback) callback(payload);
    return payload;
  }

  /** Cancel a pending job (its late result becomes stale). */
  cancel(jobId: string): boolean {
    const removed = this.jobs.cancel(jobId);
    this.callbacks.delete(jobId);
    return removed;
  }

  /** Number of pending (unresolved) jobs. */
  get pendingCount(): number {
    return this.jobs.pendingCount;
  }

  /** Build a 064 result message for `jobId` (helper for worker-side wiring). */
  static resultMessage(jobId: string, payload: MeshSectionResultPayload): unknown {
    return { protocolVersion: WORKER_PROTOCOL_VERSION, jobId, ok: true, payload };
  }
}
