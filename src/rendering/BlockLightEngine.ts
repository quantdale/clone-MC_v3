/**
 * Deterministic block-light computation (068). `computeBlockLight` seeds every cell whose block emits
 * light (`getLuminance > 0`) with its luminance (clamped to 15) — including opaque sources such as
 * glowstone — then propagates with the same FIFO BFS as 067: a cell with value `v` raises non-opaque
 * neighbors to `v - 1` when darker. Sources are never dimmed, and identical worlds produce identical
 * results (fixed neighbor order).
 */

/** The light world the engine computes over. */
export interface BlockLightWorld {
  /** 0 when the cell is not a light source. */
  getLuminance(x: number, y: number, z: number): number;
  isOpaque(x: number, y: number, z: number): boolean;
  getBlockLight(x: number, y: number, z: number): number;
  setBlockLight(x: number, y: number, z: number, value: number): void;
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

/** Compute block light over the world volume; returns the number of cells set to a nonzero value. */
export function computeBlockLight(world: BlockLightWorld): number {
  let lit = 0;
  const queue: Array<[number, number, number]> = [];

  // 1. Seed sources (deterministic order: columns (x, z), then y ascending).
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = world.minY; y < world.maxY; y++) {
        const luminance = world.getLuminance(x, y, z);
        if (luminance > 0) {
          const value = Math.min(15, luminance);
          world.setBlockLight(x, y, z, value);
          lit++;
          queue.push([x, y, z]);
        }
      }
    }
  }

  // 2. BFS propagation through non-opaque cells.
  for (let head = 0; head < queue.length; head++) {
    const [x, y, z] = queue[head]!;
    const value = world.getBlockLight(x, y, z);
    if (value <= 1) continue;
    for (const [dx, dy, dz] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (nx < 0 || nx >= 16 || nz < 0 || nz >= 16 || ny < world.minY || ny >= world.maxY) continue;
      if (world.isOpaque(nx, ny, nz)) continue;
      const target = value - 1;
      if (world.getBlockLight(nx, ny, nz) < target) {
        world.setBlockLight(nx, ny, nz, target);
        if (target > 0) lit++;
        queue.push([nx, ny, nz]);
      }
    }
  }

  return lit;
}
