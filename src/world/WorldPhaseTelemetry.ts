/**
 * World-internal phase telemetry (258 tasks 17-23).
 *
 * Pure shape definitions for the work `World.update` attributes into the
 * whole-frame stream: which sub-phases exist, and which per-frame work
 * counters accompany them. The timing itself lives in `World` behind a
 * disabled-by-default `PhaseTimer` (zero clock reads while disabled); the
 * canonical ring/percentile machinery stays in
 * `rendering/WholeFrameMetrics.ts`.
 *
 * Pure and headless-safe: no DOM, no clock, no allocation after construction.
 */

/** World-internal phases, a subset of `WHOLE_FRAME_PHASES` (normative order). */
export const WORLD_TIMED_PHASES = [
  'generation',
  'meshingMain',
  'workerDispatch',
  'lighting',
  'upload',
  'unload',
] as const;

/** One attributable slice of `World.update`. */
export type WorldTimedPhase = (typeof WORLD_TIMED_PHASES)[number];

/**
 * Per-frame work counts accompanying the phase timers. Snapshot at the end
 * of `World.update`; reset at the start of the next update. Counts (not
 * timings) so harness artifacts can report queue progress even when phase
 * timing is disabled.
 */
export interface WorldFrameWorkCounts {
  /** Chunks whose generation stage completed this frame (task 18). */
  generatedChunks: number;
  /** Mesh jobs built on the synchronous main-thread path (task 19). */
  syncMeshedJobs: number;
  /** Mesh jobs submitted to the worker path (task 19). */
  workerDispatchedJobs: number;
  /** Worker batches that passed stale checks and attached (task 19/23). */
  workerCompletedJobs: number;
  /** Light-propagation operations drained this frame (task 20). */
  lightOpsUsed: number;
  /** Scene-attach calls completed this frame (task 21). */
  uploadedMeshes: number;
  /** Chunks evicted this frame. */
  unloadedChunks: number;
}

/** Zeroed per-frame work counts. */
export function zeroWorldFrameWorkCounts(): WorldFrameWorkCounts {
  return {
    generatedChunks: 0,
    syncMeshedJobs: 0,
    workerDispatchedJobs: 0,
    workerCompletedJobs: 0,
    lightOpsUsed: 0,
    uploadedMeshes: 0,
    unloadedChunks: 0,
  };
}

function assertCount(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`WorldPhaseTelemetry: ${name} must be a non-negative integer, got ${String(value)}`);
  }
  return value;
}

/**
 * Validate an unknown value as `WorldFrameWorkCounts`. Returns a defensive
 * copy; throws `WorldPhaseTelemetry: <detail>` naming the first defect.
 */
export function validateWorldFrameWorkCounts(input: unknown): WorldFrameWorkCounts {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WorldPhaseTelemetry: counts must be an object');
  }
  const r = input as Record<string, unknown>;
  return {
    generatedChunks: assertCount(r.generatedChunks, 'generatedChunks'),
    syncMeshedJobs: assertCount(r.syncMeshedJobs, 'syncMeshedJobs'),
    workerDispatchedJobs: assertCount(r.workerDispatchedJobs, 'workerDispatchedJobs'),
    workerCompletedJobs: assertCount(r.workerCompletedJobs, 'workerCompletedJobs'),
    lightOpsUsed: assertCount(r.lightOpsUsed, 'lightOpsUsed'),
    uploadedMeshes: assertCount(r.uploadedMeshes, 'uploadedMeshes'),
    unloadedChunks: assertCount(r.unloadedChunks, 'unloadedChunks'),
  };
}
