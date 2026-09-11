/**
 * Worker-meshing capability checks and conservative pool sizing (258 task 40,
 * pure core).
 *
 * Production worker meshing may only engage after capability checks pass, with
 * a conservatively sized pool that leaves main-thread and browser capacity,
 * and with the deterministic synchronous fallback preserved (the `World`
 * `workerMeshing` flag stays opt-in; this module only decides whether
 * enabling it is supportable, it never flips production on by itself).
 *
 * Pure and headless-safe. Invalid capability reports fail closed (disabled
 * with a named reason).
 */

/** Host capabilities relevant to worker meshing. */
export interface WorkerMeshCapabilities {
  /** Whether the `Worker` constructor is available in this environment. */
  workerAvailable: boolean;
  /** `navigator.hardwareConcurrency` (logical cores), 0/unknown when absent. */
  hardwareConcurrency: number;
}

/** Supportability decision for production worker meshing. */
export interface WorkerMeshDecision {
  supported: boolean;
  /** Conservative pool size (1 when unsupported, still defined for logging). */
  poolSize: number;
  reason: string;
}

/** Maximum workers ever allocated: meshing must not saturate the host. */
const MAX_POOL_SIZE = 4;

/**
 * Conservative pool size from a core count: half the logical cores rounded
 * down, clamped to [1, MAX_POOL_SIZE], so the main thread and browser keep
 * at least half the host. Unknown core counts (0) yield the minimum pool.
 */
export function recommendedWorkerPoolSize(hardwareConcurrency: number): number {
  if (typeof hardwareConcurrency !== 'number' || !Number.isFinite(hardwareConcurrency) || hardwareConcurrency < 0) {
    throw new Error(`WorkerMeshCapability: hardwareConcurrency must be a non-negative finite number, got ${String(hardwareConcurrency)}`);
  }
  if (hardwareConcurrency < 1) return 1;
  return Math.max(1, Math.min(MAX_POOL_SIZE, Math.floor(hardwareConcurrency / 2)));
}

/**
 * Decide whether production worker meshing is supportable. Disabled unless
 * `Worker` exists; invalid reports fail closed. Never throws.
 */
export function resolveWorkerMeshingSupport(input: unknown): WorkerMeshDecision {
  if (typeof input !== 'object' || input === null) {
    return { supported: false, poolSize: 1, reason: 'capabilities must be an object' };
  }
  const caps = input as Record<string, unknown>;
  if (caps.workerAvailable !== true) {
    return { supported: false, poolSize: 1, reason: 'Worker unavailable: deterministic sync fallback required' };
  }
  const cores = caps.hardwareConcurrency;
  if (typeof cores !== 'number' || !Number.isFinite(cores) || cores < 0) {
    return { supported: false, poolSize: 1, reason: `invalid hardwareConcurrency: ${String(cores)}` };
  }
  const poolSize = recommendedWorkerPoolSize(cores);
  return { supported: true, poolSize, reason: `worker meshing supportable with pool size ${poolSize}` };
}
