/**
 * Nether portal linking (178): the first teleportation logic, consuming 177's `PortalShape` and
 * frame rules. Pure and deterministic:
 *
 * - **Coordinate scale**: overworld ↔ nether is 1:8 (`NETHER_PORTAL_SCALE`); overworld→nether
 *   floors (`floor(x/8)`), nether→overworld multiplies (`x*8`), matching vanilla.
 * - **Destination search**: `findNearestPortal` scans a bounded box around the scaled position for
 *   an existing portal block, in a deterministic (y-, then x-, then z-major) order; the search
 *   radius is `PORTAL_SEARCH_RADIUS_NETHER` (16) toward the nether and
 *   `PORTAL_SEARCH_RADIUS_OVERWORLD` (128) toward the overworld, per vanilla.
 * - **Creation**: when no portal exists, `portalCreationSite` finds a deterministic build site for a
 *   minimal 4×5 frame (interior 2×3, axis x) — searching downward from the target, then outward —
 *   and `portalFrameCells` lists the obsidian ring and portal interior cells a wiring change places.
 * - **Cooldown**: `PORTAL_TELEPORT_COOLDOWN_TICKS` (300, vanilla); `portalCooldownRemaining` is the
 *   remaining ticks.
 * - **Safe placement**: `portalSpawnPoint` derives the bottom-center interior cell of a shape, and
 *   `portalSpawnIsSafe` verifies two blocks of clearance (the spawn cell and the one above are
 *   non-solid).
 */
import type { PortalShape } from './NetherPortal';

/** Vanilla's overworld↔nether coordinate scale (1 block in the nether = 8 in the overworld). */
export const NETHER_PORTAL_SCALE = 8;
/** Search radius when the destination is the overworld (vanilla: 128). */
export const PORTAL_SEARCH_RADIUS_OVERWORLD = 128;
/** Search radius when the destination is the nether (vanilla: 16). */
export const PORTAL_SEARCH_RADIUS_NETHER = 16;
/** Post-teleport cooldown in ticks (vanilla: 300). */
export const PORTAL_TELEPORT_COOLDOWN_TICKS = 300;

export type PortalTravelDirection = 'overworld-to-nether' | 'nether-to-overworld';

/** The world seam for portal search/creation/safety. */
export interface PortalLinkingWorld {
  isPortalBlock(x: number, y: number, z: number): boolean;
  isAir(x: number, y: number, z: number): boolean;
  isSolid(x: number, y: number, z: number): boolean;
}

/** Scale a horizontal position across the 1:8 boundary (floored toward the nether). */
export function scalePortalPosition(
  x: number,
  z: number,
  direction: PortalTravelDirection,
): readonly [number, number] {
  if (direction === 'overworld-to-nether') {
    return [Math.floor(x / NETHER_PORTAL_SCALE), Math.floor(z / NETHER_PORTAL_SCALE)];
  }
  return [x * NETHER_PORTAL_SCALE, z * NETHER_PORTAL_SCALE];
}

/** The search radius for a destination direction (vanilla: 16 nether / 128 overworld). */
export function portalSearchRadius(direction: PortalTravelDirection): number {
  return direction === 'overworld-to-nether' ? PORTAL_SEARCH_RADIUS_NETHER : PORTAL_SEARCH_RADIUS_OVERWORLD;
}

/**
 * Find an existing portal block inside the box centered on `(cx, cy, cz)` with the given radius.
 * Deterministic scan order: y ascending, then x, then z (each ± radius). Returns the first portal
 * block position, or `null`.
 */
export function findNearestPortal(
  world: PortalLinkingWorld,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): readonly [number, number, number] | null {
  for (let dy = 0; dy <= radius; dy++) {
    for (const sy of dy === 0 ? [0] : [-dy, dy]) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (world.isPortalBlock(cx + dx, cy + sy, cz + dz)) {
            return [cx + dx, cy + sy, cz + dz];
          }
        }
      }
    }
  }
  return null;
}

/** The spawn point of a portal: the bottom-center interior cell (centered along the axis). */
export function portalSpawnPoint(shape: PortalShape): readonly [number, number, number] {
  const along = Math.floor((shape.width - 1) / 2);
  const cx = shape.axis === 'x' ? shape.x0 + along : shape.x0;
  const cz = shape.axis === 'x' ? shape.z0 : shape.z0 + along;
  return [cx, shape.y0, cz];
}

/** Safe placement: the spawn cell and the cell above it must both be non-solid. */
export function portalSpawnIsSafe(world: PortalLinkingWorld, x: number, y: number, z: number): boolean {
  return !world.isSolid(x, y, z) && !world.isSolid(x, y + 1, z);
}

/** Remaining teleport cooldown at `nowTick` after a teleport at `lastTeleportTick` (clamped at 0). */
export function portalCooldownRemaining(lastTeleportTick: number, nowTick: number): number {
  if (!Number.isFinite(lastTeleportTick) || !Number.isFinite(nowTick)) return PORTAL_TELEPORT_COOLDOWN_TICKS;
  const remaining = lastTeleportTick + PORTAL_TELEPORT_COOLDOWN_TICKS - nowTick;
  return remaining > 0 ? remaining : 0;
}

/**
 * Find a deterministic build site for a minimal 4×5 frame (interior 2×3, axis x) near `(x, y, z)`:
 * search downward from `y` (up to 64), then outward (±8), for the first position where the four
 * cells below the bottom bar are solid and every ring + interior cell is air. Returns the shape of
 * the frame to build, or `null` when no site exists in the searched region.
 */
export function portalCreationSite(
  world: PortalLinkingWorld,
  x: number,
  y: number,
  z: number,
): PortalShape | null {
  for (let dy = 0; dy <= 64; dy++) {
    const by = y - dy; // bottom-bar row
    for (let dx = -8; dx <= 8; dx++) {
      for (let dz = -8; dz <= 8; dz++) {
        const x0 = x + dx;
        const z0 = z + dz;
        // Support: the four cells below the bottom bar must be solid.
        let supported = true;
        for (let i = -1; i <= 2; i++) {
          if (!world.isSolid(x0 + i, by - 1, z0)) {
            supported = false;
            break;
          }
        }
        if (!supported) continue;
        // Ring + interior must be clear so the frame can be built.
        const shape: PortalShape = { axis: 'x', x0, y0: by + 1, z0, width: 2, height: 3 };
        let clear = true;
        for (const [fx, fy, fz] of portalFrameCells(shape).frame) {
          if (!world.isAir(fx, fy, fz)) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        for (const [ix, iy, iz] of portalFrameCells(shape).interior) {
          if (!world.isAir(ix, iy, iz)) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        return shape;
      }
    }
  }
  return null;
}

/** The obsidian ring and portal interior cells of a shape (for a wiring change to place). */
export function portalFrameCells(shape: PortalShape): {
  readonly frame: ReadonlyArray<readonly [number, number, number]>;
  readonly interior: ReadonlyArray<readonly [number, number, number]>;
} {
  const dx = shape.axis === 'x' ? 1 : 0;
  const dz = shape.axis === 'x' ? 0 : 1;
  const frame: Array<readonly [number, number, number]> = [];
  for (let i = -1; i <= shape.width; i++) {
    frame.push([shape.x0 + i * dx, shape.y0 - 1, shape.z0 + i * dz]);
    frame.push([shape.x0 + i * dx, shape.y0 + shape.height, shape.z0 + i * dz]);
  }
  for (let j = 0; j < shape.height; j++) {
    frame.push([shape.x0 - dx, shape.y0 + j, shape.z0 - dz]);
    frame.push([shape.x0 + shape.width * dx, shape.y0 + j, shape.z0 + shape.width * dz]);
  }
  const interior: Array<readonly [number, number, number]> = [];
  for (let i = 0; i < shape.width; i++) {
    for (let j = 0; j < shape.height; j++) {
      interior.push([shape.x0 + i * dx, shape.y0 + j, shape.z0 + i * dz]);
    }
  }
  return { frame, interior };
}
