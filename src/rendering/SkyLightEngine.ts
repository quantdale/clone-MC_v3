/**
 * Deterministic skylight computation (067). `computeSkyLight` initializes every column from the world
 * top: sky light starts at 15 and falls off by 1 per air block downward, stopping at the first opaque
 * block (0 below). It then propagates via a FIFO BFS through non-opaque cells: a cell with light `v`
 * raises its six non-opaque neighbors to `v - 1` when darker. Neighbor order is fixed
 * (`-x, +x, -y, +y, -z, +z`), so identical worlds produce identical results.
 */

/** The light world the engine computes over. */
export interface SkyLightWorld {
  isOpaque(x: number, y: number, z: number): boolean;
  getSkyLight(x: number, y: number, z: number): number;
  setSkyLight(x: number, y: number, z: number, value: number): void;
  /** Lowest world Y of the lit volume. */
  minY: number;
  /** Highest world Y + 1 (world top). */
  maxY: number;
}

/** Fixed neighbor expansion order (deterministic). */
const NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

/** Compute skylight over the world volume; returns the number of cells set to a nonzero value. */
export function computeSkyLight(world: SkyLightWorld): number {
  let lit = 0;

  // 1. Per-column initialization from the world top downward.
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      let value = 15;
      for (let y = world.maxY - 1; y >= world.minY; y--) {
        if (world.isOpaque(x, y, z)) {
          world.setSkyLight(x, y, z, 0);
          break; // column stops at the first opaque block
        }
        const clamped = Math.max(0, value);
        world.setSkyLight(x, y, z, clamped);
        if (clamped > 0) lit++;
        value--;
      }
    }
  }

  // 2. BFS propagation through non-opaque cells.
  const queue: Array<[number, number, number]> = [];
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = world.minY; y < world.maxY; y++) {
        if (world.getSkyLight(x, y, z) > 0) {
          queue.push([x, y, z]);
        }
      }
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const [x, y, z] = queue[head]!;
    const value = world.getSkyLight(x, y, z);
    if (value <= 1) continue;
    for (const [dx, dy, dz] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (nx < 0 || nx >= 16 || nz < 0 || nz >= 16 || ny < world.minY || ny >= world.maxY) continue;
      if (world.isOpaque(nx, ny, nz)) continue;
      const target = value - 1;
      if (world.getSkyLight(nx, ny, nz) < target) {
        world.setSkyLight(nx, ny, nz, target);
        queue.push([nx, ny, nz]);
      }
    }
  }

  return lit;
}
