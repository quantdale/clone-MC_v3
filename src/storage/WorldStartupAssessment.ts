/**
 * Typed world-startup compatibility assessment (257).
 *
 * One authoritative decision about whether a persisted world may boot into normal
 * playable simulation, replacing ad-hoc baseline checks scattered across UI, Game
 * and World. The classification is computed once per `GamePersistence.open()` from
 * the bulk-loaded records and read outcomes:
 *
 * - `current`            — baseline matches the executable generator; current
 *                          generation MAY populate absent canonical columns.
 * - `preserved`          — non-current (`legacy-unknown` | `unsupported`) baseline
 *                          whose bounded spawn neighborhood has proven canonical
 *                          persisted coverage; playable from that actual terrain.
 * - `recovery-required`  — startup cannot prove a safe playable world without
 *                          risking silent generation-version conversion or data
 *                          loss; gameplay simulation must stay paused until the
 *                          user explicitly recovers (world-scoped reset).
 *
 * The decision is pure and deterministic: identical inputs produce an identical
 * mode/reason/diagnostics triple, and no IO happens here.
 */
import type { WorldGenerationBaseline } from '../world/World';

/** Startup compatibility modes (see module doc). */
export type WorldStartupMode = 'current' | 'preserved' | 'recovery-required';

/**
 * Deterministic reason a world needs recovery. `null` means the world is
 * playable as classified (`current` or `preserved`).
 */
export type WorldStartupRecoveryReason =
  | 'storage-read-uncertain'
  | 'missing-canonical-coverage'
  | 'no-safe-spawn-support';

/**
 * Bounded "sufficient canonical coverage" definition: every chunk within this
 * Chebyshev radius of the startup-anchoring chunk (persisted player position's
 * chunk, or the origin when no player state exists) must have a canonical
 * persisted column. The readiness safety ring in `World.getReadyProgress` uses
 * radius `min(2, renderDistance)`, so coverage radius 2 is the smallest bounded
 * neighborhood that can ever prove the spawn ring playable.
 */
export const WORLD_STARTUP_COVERAGE_RADIUS_CHUNKS = 2;

/** Bounded, user-safe diagnostics for the startup decision (no record payloads). */
export interface WorldStartupDiagnostics {
  /** The classified persisted generation baseline. */
  baseline: WorldGenerationBaseline;
  /** Whether any metadata/column/edit enumeration read failed during open. */
  readUncertain: boolean;
  /** Number of canonical persisted columns loaded for this world. */
  canonicalColumnCount: number;
  /** Coverage radius (chunks) used by the bounded neighborhood check. */
  coverageRadiusChunks: number;
  /** Chunk anchor used for the coverage neighborhood. */
  coverageAnchor: { chunkX: number; chunkZ: number };
  /** Required-but-missing columns, sorted, bounded to the neighborhood. */
  missingCoverageColumns: Array<{ chunkX: number; chunkZ: number }>;
  /** Whether a persisted player snapshot was present. */
  playerStatePresent: boolean;
}

/** The single authoritative startup decision. */
export interface WorldStartupAssessment {
  mode: WorldStartupMode;
  /** `null` unless mode is `recovery-required`. */
  reason: WorldStartupRecoveryReason | null;
  diagnostics: WorldStartupDiagnostics;
}

/** Pure input to {@link assessWorldStartup}. */
export interface WorldStartupAssessmentInput {
  baseline: WorldGenerationBaseline;
  /**
   * True when a metadata/column/edit enumeration failed while opening an
   * existing (non-fatal) world. Read uncertainty MUST NOT classify a world as
   * current merely because a partial read returned empty.
   */
  readUncertain: boolean;
  /** Canonical persisted columns loaded for this world (chunk coords only). */
  canonicalColumns: ReadonlyArray<{ chunkX: number; chunkZ: number }>;
  /** Persisted player state present? */
  playerStatePresent: boolean;
  /** Player chunk from the persisted snapshot, when present. */
  playerChunk: { chunkX: number; chunkZ: number } | null;
}

function chebyshev(ax: number, az: number, bx: number, bz: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

/**
 * Compute the authoritative startup compatibility decision.
 *
 * Rules (in order):
 * 1. Read uncertainty on an existing world → `recovery-required`
 *    (`storage-read-uncertain`); an empty partial read is never proof of a fresh
 *    current world.
 * 2. `current` baseline → `current` (generation may fill absent columns).
 * 3. Non-current baseline → `preserved` only when every chunk in the bounded
 *    coverage neighborhood has a canonical persisted column; otherwise
 *    `recovery-required` (`missing-canonical-coverage`).
 */
export function assessWorldStartup(input: WorldStartupAssessmentInput): WorldStartupAssessment {
  const anchor = input.playerChunk ?? { chunkX: 0, chunkZ: 0 };
  const diagnostics: WorldStartupDiagnostics = {
    baseline: input.baseline,
    readUncertain: input.readUncertain,
    canonicalColumnCount: input.canonicalColumns.length,
    coverageRadiusChunks: WORLD_STARTUP_COVERAGE_RADIUS_CHUNKS,
    coverageAnchor: anchor,
    missingCoverageColumns: [],
    playerStatePresent: input.playerStatePresent,
  };

  if (input.readUncertain) {
    return { mode: 'recovery-required', reason: 'storage-read-uncertain', diagnostics };
  }
  if (input.baseline === 'current') {
    return { mode: 'current', reason: null, diagnostics };
  }

  const present = new Set(input.canonicalColumns.map((c) => `${c.chunkX},${c.chunkZ}`));
  const radius = WORLD_STARTUP_COVERAGE_RADIUS_CHUNKS;
  const missing: Array<{ chunkX: number; chunkZ: number }> = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const cx = anchor.chunkX + dx;
      const cz = anchor.chunkZ + dz;
      if (!present.has(`${cx},${cz}`)) {
        missing.push({ chunkX: cx, chunkZ: cz });
      }
    }
  }
  missing.sort((a, b) => a.chunkX - b.chunkX || a.chunkZ - b.chunkZ);
  diagnostics.missingCoverageColumns = missing;
  if (missing.length > 0) {
    return { mode: 'recovery-required', reason: 'missing-canonical-coverage', diagnostics };
  }
  return { mode: 'preserved', reason: null, diagnostics };
}

/** Whether chunk (cx,cz) lies within the bounded startup coverage neighborhood. */
export function isWithinStartupCoverage(
  cx: number,
  cz: number,
  anchor: { chunkX: number; chunkZ: number },
): boolean {
  return chebyshev(cx, cz, anchor.chunkX, anchor.chunkZ) <= WORLD_STARTUP_COVERAGE_RADIUS_CHUNKS;
}

