/**
 * Wither summon detection (252): localized T-shaped soul sand / soul soil + 3 skull validation.
 *
 * Pattern (ground-aligned):
 *   y layer 0 (base): center (x0,y0,z0) soul, arms x±1 or z±1 soul, stem y-1 below center soul
 *   y layer 1 (top): skulls at (x0,y0+1,z0), (x0+dx, y0+1, z0+dz), (x0-dx,y0+1,z0-dz)
 * where (dx,dz) is (1,0) for X orientation or (0,1) for Z orientation.
 *
 * Detection is localized around the placed block — only reads the 7 candidate positions
 * for each orientation and never scans the world. Valid souls: soul_sand (58) or soul_soil (60).
 * Valid skulls: wither_skull (61) — placed by either wither_skull or wither_skeleton_skull item.
 *
 * Summon consumes all 7 blocks atomically to air and spawns the boss at the T center+1.
 */
import { BlockId } from '../world/BlockRegistry';

export interface BlockCoord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SummonWorld {
  getBlock(x: number, y: number, z: number): number;
  isSoulBlock?(id: number): boolean;
  isSkullBlock?(id: number): boolean;
}

export interface SummonWorldMut extends SummonWorld {
  setBlock(x: number, y: number, z: number, id: number): void;
}

export interface SummonCheck {
  readonly valid: boolean;
  readonly orientation: 'x' | 'z';
  readonly center: BlockCoord;
  readonly spawn: BlockCoord;
  readonly soulPositions: readonly BlockCoord[];
  readonly skullPositions: readonly BlockCoord[];
}

const SOUL_IDS = new Set<number>([BlockId.SoulSand, BlockId.SoulSoil]);
const SKULL_IDS = new Set<number>([BlockId.WitherSkull]);

function isSoul(id: number, world: SummonWorld): boolean {
  if (world.isSoulBlock) return world.isSoulBlock(id);
  return SOUL_IDS.has(id);
}
function isSkull(id: number, world: SummonWorld): boolean {
  if (world.isSkullBlock) return world.isSkullBlock(id);
  return SKULL_IDS.has(id);
}

function checkOrientation(world: SummonWorld, cx: number, cy: number, cz: number, dx: number, dz: number): SummonCheck | null {
  const soulPositions: BlockCoord[] = [
    { x: cx, y: cy, z: cz },
    { x: cx + dx, y: cy, z: cz + dz },
    { x: cx - dx, y: cy, z: cz - dz },
    { x: cx, y: cy - 1, z: cz },
  ];
  const skullPositions: BlockCoord[] = [
    { x: cx, y: cy + 1, z: cz },
    { x: cx + dx, y: cy + 1, z: cz + dz },
    { x: cx - dx, y: cy + 1, z: cz - dz },
  ];
  for (const p of soulPositions) {
    if (!isSoul(world.getBlock(p.x, p.y, p.z), world)) return null;
  }
  for (const p of skullPositions) {
    if (!isSkull(world.getBlock(p.x, p.y, p.z), world)) return null;
  }
  return {
    valid: true,
    orientation: dx !== 0 ? 'x' : 'z',
    center: { x: cx, y: cy, z: cz },
    spawn: { x: cx, y: cy + 1, z: cz },
    soulPositions,
    skullPositions,
  };
}

/**
 * Detect a wither summon localized around `placed`. The wither T center can be at
 * placed itself (if placed was a soul) or one below (if placed was a skull), or
 * adjacent. We test all candidate centers within a 2-block cube around placed.
 * Each center is tested for both orientations. Returns the first valid check or null.
 * Deterministic: centers visited in ascending x,y,z then x-orientation before z.
 */
export function detectWitherSummon(world: SummonWorld, placed: BlockCoord): SummonCheck | null {
  if (!placed || !Number.isInteger(placed.x) || !Number.isInteger(placed.y) || !Number.isInteger(placed.z)) return null;
  // Candidate centers are within Manhattan? Simpler: test 3x3x3 around placed, but
  // filtered to where placed could be either a soul or skull of that structure.
  // Max distance from center to any block is 1 in horizontal, 1 vertical.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = placed.x + dx;
        const cy = placed.y + dy;
        const cz = placed.z + dz;
        // Try X orientation then Z
        const a = checkOrientation(world, cx, cy, cz, 1, 0);
        if (a) return a;
        const b = checkOrientation(world, cx, cy, cz, 0, 1);
        if (b) return b;
      }
    }
  }
  return null;
}

/**
 * Consume the 7 summon blocks to air. Caller must have validated via detectWitherSummon.
 * Idempotent: only clears blocks that are still soul/skull; ignores air/missing.
 */
export function consumeSummonStructure(world: SummonWorldMut, check: SummonCheck): void {
  if (!check || !check.valid) return;
  for (const p of check.soulPositions) {
    const id = world.getBlock(p.x, p.y, p.z);
    if (isSoul(id, world)) world.setBlock(p.x, p.y, p.z, BlockId.Air);
  }
  for (const p of check.skullPositions) {
    const id = world.getBlock(p.x, p.y, p.z);
    if (isSkull(id, world)) world.setBlock(p.x, p.y, p.z, BlockId.Air);
  }
}

/** Whether the given block id is a valid soul base. Exported for loot/world helpers. */
export function isValidSoulBlock(id: number): boolean {
  return SOUL_IDS.has(id);
}

/** Whether the given block id is a valid skull top. */
export function isValidSkullBlock(id: number): boolean {
  return SKULL_IDS.has(id);
}
