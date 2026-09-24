/**
 * Pure live village / settlement detection (287): Chebyshev bed-scan on
 * resident columns only. No Game, DOM, persistence, or POI imports —
 * consumers supply a VillageBlockProbe and the live bed block id.
 */
import type { VillageContext } from './BadOmenRules';
import { sectionIndex } from '../math/SectionCoordinate';

/** Chebyshev horizontal scan radius about the player's floored block. */
export const VILLAGE_SCAN_RADIUS = 12;
/** Vertical half-window (±) about the player's floored block. */
export const VILLAGE_SCAN_Y = 5;
/** Chebyshev horizontal bound for containsPlayer vs floored center. */
export const VILLAGE_BOUND_RADIUS = 12;
/** Minimum qualifying beds required to form a village. */
export const VILLAGE_MIN_BEDS = 1;
/** Hard cap on getBlock calls per detectVillage sample. */
export const VILLAGE_MAX_CELLS = 8192;
/** Fixed-tick interval between live resamples when the player is still. */
export const VILLAGE_RESAMPLE_TICKS = 20;
/** Chebyshev block move that forces an early resample. */
export const VILLAGE_MOVE_RESAMPLE = 4;

/** World probe used by pure detection (loaded-column aware). */
export interface VillageBlockProbe {
  getBlock(x: number, y: number, z: number): number;
  hasColumn(chunkX: number, chunkZ: number): boolean;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function chebyshev2(ax: number, az: number, bx: number, bz: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

/**
 * Detect a village near the player. Total: never throws. Returns null when
 * player coords are non-finite, fewer than VILLAGE_MIN_BEDS beds are found on
 * resident columns inside the scan volume, or the probe yields no beds before
 * the cell cap. Center is the arithmetic mean of qualifying bed coordinates.
 * containsPlayer uses VILLAGE_BOUND_RADIUS / VILLAGE_SCAN_Y against the floored
 * center. Scan order is deterministic: dx outer, then dz, then dy.
 */
export function detectVillage(
  playerX: number,
  playerY: number,
  playerZ: number,
  probe: VillageBlockProbe,
  bedBlockId: number,
): VillageContext | null {
  if (!isFiniteNumber(playerX) || !isFiniteNumber(playerY) || !isFiniteNumber(playerZ)) {
    return null;
  }
  if (!isFiniteNumber(bedBlockId) || !Number.isInteger(bedBlockId)) {
    return null;
  }
  if (probe == null || typeof probe.getBlock !== 'function' || typeof probe.hasColumn !== 'function') {
    return null;
  }

  const px = Math.floor(playerX);
  const py = Math.floor(playerY);
  const pz = Math.floor(playerZ);
  const R = VILLAGE_SCAN_RADIUS;
  const Y = VILLAGE_SCAN_Y;

  const bedsX: number[] = [];
  const bedsY: number[] = [];
  const bedsZ: number[] = [];
  let cells = 0;

  for (let dx = -R; dx <= R; dx += 1) {
    for (let dz = -R; dz <= R; dz += 1) {
      const x = px + dx;
      const z = pz + dz;
      const cx = sectionIndex(x);
      const cz = sectionIndex(z);
      let columnLoaded = false;
      try {
        columnLoaded = probe.hasColumn(cx, cz) === true;
      } catch {
        columnLoaded = false;
      }
      if (!columnLoaded) continue;

      for (let dy = -Y; dy <= Y; dy += 1) {
        if (cells >= VILLAGE_MAX_CELLS) {
          return finalizeBeds(bedsX, bedsY, bedsZ, px, py, pz);
        }
        const y = py + dy;
        cells += 1;
        let id: number;
        try {
          id = probe.getBlock(x, y, z);
        } catch {
          continue;
        }
        if (id === bedBlockId) {
          bedsX.push(x);
          bedsY.push(y);
          bedsZ.push(z);
        }
      }
    }
  }

  return finalizeBeds(bedsX, bedsY, bedsZ, px, py, pz);
}

function finalizeBeds(
  bedsX: number[],
  bedsY: number[],
  bedsZ: number[],
  px: number,
  py: number,
  pz: number,
): VillageContext | null {
  const n = bedsX.length;
  if (n < VILLAGE_MIN_BEDS) return null;

  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let i = 0; i < n; i += 1) {
    sx += bedsX[i]!;
    sy += bedsY[i]!;
    sz += bedsZ[i]!;
  }
  const centerX = sx / n;
  const centerY = sy / n;
  const centerZ = sz / n;
  const floorCx = Math.floor(centerX);
  const floorCy = Math.floor(centerY);
  const floorCz = Math.floor(centerZ);
  const containsPlayer =
    chebyshev2(px, pz, floorCx, floorCz) <= VILLAGE_BOUND_RADIUS &&
    Math.abs(py - floorCy) <= VILLAGE_SCAN_Y;

  return { centerX, centerY, centerZ, containsPlayer };
}

/**
 * Whether the live Game cache should re-run detectVillage. Total: never throws.
 * True when never sampled (negative lastSampleTick), tick delta ≥
 * VILLAGE_RESAMPLE_TICKS, Chebyshev block move ≥ VILLAGE_MOVE_RESAMPLE, or any
 * coordinate/tick input is non-finite (fail open to resample).
 */
export function shouldResampleVillage(
  lastSampleTick: number,
  currentTick: number,
  lastPx: number,
  lastPy: number,
  lastPz: number,
  px: number,
  py: number,
  pz: number,
): boolean {
  if (
    !isFiniteNumber(lastSampleTick) ||
    !isFiniteNumber(currentTick) ||
    !isFiniteNumber(lastPx) ||
    !isFiniteNumber(lastPy) ||
    !isFiniteNumber(lastPz) ||
    !isFiniteNumber(px) ||
    !isFiniteNumber(py) ||
    !isFiniteNumber(pz)
  ) {
    return true;
  }
  if (lastSampleTick < 0) return true;
  if (currentTick - lastSampleTick >= VILLAGE_RESAMPLE_TICKS) return true;
  const floorLastX = Math.floor(lastPx);
  const floorLastY = Math.floor(lastPy);
  const floorLastZ = Math.floor(lastPz);
  const floorX = Math.floor(px);
  const floorY = Math.floor(py);
  const floorZ = Math.floor(pz);
  const horiz = chebyshev2(floorX, floorZ, floorLastX, floorLastZ);
  const vert = Math.abs(floorY - floorLastY);
  if (Math.max(horiz, vert) >= VILLAGE_MOVE_RESAMPLE) return true;
  return false;
}
