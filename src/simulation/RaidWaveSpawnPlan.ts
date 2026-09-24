/**
 * Pure wave spawn plan (284): deterministic flattened ring placement for a
 * `RaidWaveEntry[]` roster. Zero imports so it stays headless-safe and
 * independent of Game/EntityManager, matching 152's RaidStateMachine purity.
 *
 * Fail-closed contract: a non-finite center, unknown `typeKey`, or invalid
 * count yields `ok: false` with empty `placements` (all-or-nothing) and never
 * throws. Zero-count roster entries are omitted without failing the plan.
 */

import type { RaidWaveEntry } from './RaidStateMachine';

/** One planned placement for a wave entity. */
export interface RaidSpawnPlacement {
  readonly typeKey: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/** Why a roster entry was skipped when planning failed. */
export interface RaidPlanSkip {
  readonly typeKey: string;
  readonly count: number;
  readonly reason: 'UNKNOWN_TYPE' | 'INVALID_COUNT';
}

/** Result of planning one wave's spawns. Pure and immutable. */
export interface RaidWaveSpawnPlan {
  readonly waveIndex: number;
  readonly placements: readonly RaidSpawnPlacement[];
  readonly skipped: readonly RaidPlanSkip[];
  readonly ok: boolean;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Deterministic ring placement around `center`. Entry `i` in flattened
 * roster order sits at angle `2π * i / total`, radius `2 + waveIndex`
 * (default), `y = center.y`, yaw facing the center. Pure: same inputs ⇒
 * same ordered placements; no RNG, no wall clock, no input mutation.
 */
export function planRaidWaveSpawn(
  center: { x: number; y: number; z: number },
  waveIndex: number,
  roster: readonly RaidWaveEntry[],
  resolveType: (typeKey: string) => boolean,
  opts?: { ringRadius?: number; yJitter?: number },
): RaidWaveSpawnPlan {
  const wave = Number.isFinite(waveIndex) && waveIndex >= 0 ? Math.floor(waveIndex) : 0;
  const skipped: RaidPlanSkip[] = [];

  if (!isFiniteNumber(center.x) || !isFiniteNumber(center.y) || !isFiniteNumber(center.z)) {
    return { waveIndex: wave, placements: [], skipped, ok: false };
  }

  const flattened: { typeKey: string; count: number }[] = [];
  for (const entry of roster) {
    const typeKey = entry.typeKey;
    const count = entry.count;
    if (typeof typeKey !== 'string' || typeKey.length === 0) {
      skipped.push({ typeKey: String(typeKey), count: Number.isFinite(count) ? count : 0, reason: 'UNKNOWN_TYPE' });
      continue;
    }
    if (count === 0) continue;
    if (!Number.isFinite(count) || count < 0) {
      skipped.push({ typeKey, count: Number.isFinite(count) ? count : 0, reason: 'INVALID_COUNT' });
      continue;
    }
    if (!resolveType(typeKey)) {
      skipped.push({ typeKey, count: Math.floor(count), reason: 'UNKNOWN_TYPE' });
      continue;
    }
    const whole = Math.floor(count);
    for (let i = 0; i < whole; i++) {
      flattened.push({ typeKey, count: 1 });
    }
  }

  if (skipped.length > 0) {
    return { waveIndex: wave, placements: [], skipped, ok: false };
  }
  if (flattened.length === 0) {
    return { waveIndex: wave, placements: [], skipped: [], ok: true };
  }

  const total = flattened.length;
  const ringRadius = opts?.ringRadius !== undefined && isFiniteNumber(opts.ringRadius) && opts.ringRadius > 0
    ? opts.ringRadius
    : 2 + wave;

  const placements: RaidSpawnPlacement[] = [];
  for (let i = 0; i < total; i++) {
    const entry = flattened[i];
    if (!entry) continue;
    const angle = (2 * Math.PI * i) / total;
    const x = center.x + ringRadius * Math.cos(angle);
    const z = center.z + ringRadius * Math.sin(angle);
    const yaw = Math.atan2(center.x - x, center.z - z);
    placements.push({
      typeKey: entry.typeKey,
      x,
      y: center.y,
      z,
      yaw: Number.isFinite(yaw) ? yaw : 0,
    });
  }

  return { waveIndex: wave, placements, skipped: [], ok: true };
}
