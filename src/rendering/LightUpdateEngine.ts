/**
 * Incremental light updates (069). After a block edit, `updateLightAfterEdit` removes the sky/block
 * light that depended on the edited cell (a BFS that zeroes cells strictly darker than the removed
 * path's level and never crosses opaque cells) and then re-propagates from every surviving lit cell
 * plus luminance sources. Both phases use a fixed neighbor order and FIFO queues, so identical edits
 * produce identical results — and the outcome equals a full recompute (067 sky + 068 block) of the
 * edited world (enforced by equivalence tests).
 */

/** The light world the engine updates. */
export interface LightUpdateWorld {
  isOpaque(x: number, y: number, z: number): boolean;
  /** 0 when the cell is not a light source. */
  getLuminance(x: number, y: number, z: number): number;
  getSkyLight(x: number, y: number, z: number): number;
  setSkyLight(x: number, y: number, z: number, value: number): void;
  getBlockLight(x: number, y: number, z: number): number;
  setBlockLight(x: number, y: number, z: number, value: number): void;
  minY: number;
  maxY: number;
}

type LightType = 'sky' | 'block';

/** Fixed neighbor expansion order (deterministic). */
const NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

function inBounds(world: LightUpdateWorld, x: number, y: number, z: number): boolean {
  return x >= 0 && x < 16 && z >= 0 && z < 16 && y >= world.minY && y < world.maxY;
}

function getLight(world: LightUpdateWorld, type: LightType, x: number, y: number, z: number): number {
  return type === 'sky' ? world.getSkyLight(x, y, z) : world.getBlockLight(x, y, z);
}

function setLight(world: LightUpdateWorld, type: LightType, x: number, y: number, z: number, value: number): void {
  if (type === 'sky') world.setSkyLight(x, y, z, value);
  else world.setBlockLight(x, y, z, value);
}

/**
 * Removal phase: BFS from the edited cell zeroing cells whose light depended on the removed path
 * (value strictly below the path level). Opaque cells block the BFS.
 */
function removeLightType(world: LightUpdateWorld, type: LightType, sx: number, sy: number, sz: number): void {
  const start = getLight(world, type, sx, sy, sz);
  if (start <= 0) return;
  setLight(world, type, sx, sy, sz, 0);

  const queue: Array<[number, number, number, number]> = [[sx, sy, sz, start]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y, z, level] = queue[head]!;
    for (const [dx, dy, dz] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inBounds(world, nx, ny, nz) || world.isOpaque(nx, ny, nz)) continue;
      const value = getLight(world, type, nx, ny, nz);
      if (value > 0 && value < level) {
        setLight(world, type, nx, ny, nz, 0);
        queue.push([nx, ny, nz, value]);
      }
    }
  }
}

/**
 * Re-add phase: propagate light with −1 falloff from every surviving lit cell (values only increase,
 * so the BFS terminates). Block sources are seeded with their luminance first.
 */
function propagateType(world: LightUpdateWorld, type: LightType): void {
  const queue: Array<[number, number, number]> = [];
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = world.minY; y < world.maxY; y++) {
        let value = getLight(world, type, x, y, z);
        if (type === 'block') {
          const luminance = world.getLuminance(x, y, z);
          if (luminance > 0) {
            value = Math.min(15, luminance);
            setLight(world, type, x, y, z, value);
          }
        }
        if (value > 0) queue.push([x, y, z]);
      }
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const [x, y, z] = queue[head]!;
    const value = getLight(world, type, x, y, z);
    if (value <= 1) continue;
    for (const [dx, dy, dz] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inBounds(world, nx, ny, nz) || world.isOpaque(nx, ny, nz)) continue;
      const target = value - 1;
      if (getLight(world, type, nx, ny, nz) < target) {
        setLight(world, type, nx, ny, nz, target);
        queue.push([nx, ny, nz]);
      }
    }
  }
}

/**
 * Update sky and block light after the block at `(x, y, z)` changed. Deterministic; equivalent to a
 * full recompute of the edited world.
 */
export function updateLightAfterEdit(world: LightUpdateWorld, x: number, y: number, z: number): void {
  removeLightType(world, 'sky', x, y, z);
  removeLightType(world, 'block', x, y, z);
  propagateType(world, 'block');
  propagateType(world, 'sky');
}
