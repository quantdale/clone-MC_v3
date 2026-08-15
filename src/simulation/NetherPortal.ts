/**
 * Nether portal blocks (177): the first Nether block and the first *frame-validation* logic. A
 * portal is a vertical rectangle of obsidian (1 block thick, corners required — vanilla 1.16+)
 * whose interior is filled with `nether_portal` blocks when lit. This module validates a candidate
 * frame (pure, over a caller-supplied world seam) and derives the portal's shape/axis.
 *
 * `validatePortalFrame(world, x, y, z)` is called with an interior cell (typically where fire sits
 * while lighting). It probes both axes deterministically ('x' first, then 'z') and returns the
 * first valid `PortalShape`; `portalBlockPositions` lists the interior cells a wiring change fills;
 * `portalStateProperties` projects the block state (the `axis` property).
 *
 * Bounds match vanilla: interior width 2..21 and height 3..21 (MAX_PORTAL_SIZE = 21). The interior
 * must be air or fire (the lighting fire lives inside the opening); the entire 1-thick ring around
 * it — bars and columns, corners included — must be obsidian.
 */
export type PortalAxis = 'x' | 'z';

/** Minimum interior width (horizontal, along the axis). */
export const MIN_PORTAL_WIDTH = 2;
/** Minimum interior height (vertical). */
export const MIN_PORTAL_HEIGHT = 3;
/** Maximum interior width or height (vanilla's portal size cap). */
export const MAX_PORTAL_SIZE = 21;

/** A validated portal frame: the interior rectangle's bounds and orientation. */
export interface PortalShape {
  readonly axis: PortalAxis;
  /** Lowest interior X. */
  readonly x0: number;
  /** Lowest interior Y. */
  readonly y0: number;
  /** Lowest interior Z. */
  readonly z0: number;
  /** Interior width (blocks along `axis`). */
  readonly width: number;
  /** Interior height (blocks vertically). */
  readonly height: number;
}

/** The caller-supplied world seam for frame validation. */
export interface PortalFrameWorld {
  isAir(x: number, y: number, z: number): boolean;
  /** Fire inside the opening while lighting (allowed in the interior). */
  isFire(x: number, y: number, z: number): boolean;
  isObsidian(x: number, y: number, z: number): boolean;
}

function tryAxis(
  world: PortalFrameWorld,
  x: number,
  y: number,
  z: number,
  axis: PortalAxis,
): PortalShape | null {
  const dx = axis === 'x' ? 1 : 0;
  const dz = axis === 'x' ? 0 : 1;

  // Horizontal extent along the axis, bounded by the maximum portal size.
  let back = 0;
  while (
    back < MAX_PORTAL_SIZE &&
    world.isAir(x - (back + 1) * dx, y, z - (back + 1) * dz)
  ) {
    back++;
  }
  let forward = 0;
  while (
    forward < MAX_PORTAL_SIZE &&
    world.isAir(x + (forward + 1) * dx, y, z + (forward + 1) * dz)
  ) {
    forward++;
  }
  const x0 = x - back * dx;
  const z0 = z - back * dz;
  const width = back + forward + 1;
  if (width < MIN_PORTAL_WIDTH || width > MAX_PORTAL_SIZE) return null;
  // The far walls of the row must be obsidian (the frame columns).
  if (!world.isObsidian(x - (back + 1) * dx, y, z - (back + 1) * dz)) return null;
  if (!world.isObsidian(x + (forward + 1) * dx, y, z + (forward + 1) * dz)) return null;

  // Vertical extent: walk down from the ignition column to the bottom bar, then measure up.
  let y0 = y;
  while (y0 > y - MAX_PORTAL_SIZE && world.isAir(x, y0 - 1, z)) {
    y0--;
  }
  let height = 1;
  while (height < MAX_PORTAL_SIZE && world.isAir(x, y0 + height, z)) {
    height++;
  }
  if (height < MIN_PORTAL_HEIGHT || height > MAX_PORTAL_SIZE) return null;
  // Bottom and top bars must be obsidian.
  if (!world.isObsidian(x, y0 - 1, z)) return null;
  if (!world.isObsidian(x, y0 + height, z)) return null;

  // The entire interior must be air or fire (the lighting fire lives inside the opening).
  for (let i = 0; i < width; i++) {
    for (let j = 0; j < height; j++) {
      const ix = x0 + i * dx;
      const iz = z0 + i * dz;
      const iy = y0 + j;
      if (!world.isAir(ix, iy, iz) && !world.isFire(ix, iy, iz)) return null;
    }
  }
  // The full 1-thick ring — bars and columns, corners included — must be obsidian.
  for (let i = -1; i <= width; i++) {
    const rx = x0 + i * dx;
    const rz = z0 + i * dz;
    if (!world.isObsidian(rx, y0 - 1, rz)) return null;
    if (!world.isObsidian(rx, y0 + height, rz)) return null;
  }
  for (let j = 0; j < height; j++) {
    if (!world.isObsidian(x0 - dx, y0 + j, z0 - dz)) return null;
    if (!world.isObsidian(x0 + width * dx, y0 + j, z0 + width * dz)) return null;
  }

  return { axis, x0, y0, z0, width, height };
}

/**
 * Validate a portal frame whose interior contains `(x, y, z)`. Probes axis 'x' first, then 'z';
 * returns the first valid shape, or `null` when no valid frame surrounds the cell.
 */
export function validatePortalFrame(
  world: PortalFrameWorld,
  x: number,
  y: number,
  z: number,
): PortalShape | null {
  if (!world.isAir(x, y, z) && !world.isFire(x, y, z)) return null;
  return tryAxis(world, x, y, z, 'x') ?? tryAxis(world, x, y, z, 'z');
}

/** The interior cells of a validated shape (the cells a wiring change fills with portal blocks). */
export function portalBlockPositions(shape: PortalShape): ReadonlyArray<readonly [number, number, number]> {
  const dx = shape.axis === 'x' ? 1 : 0;
  const dz = shape.axis === 'x' ? 0 : 1;
  const cells: Array<readonly [number, number, number]> = [];
  for (let i = 0; i < shape.width; i++) {
    for (let j = 0; j < shape.height; j++) {
      cells.push([shape.x0 + i * dx, shape.y0 + j, shape.z0 + i * dz]);
    }
  }
  return cells;
}

/** Project a portal block's full state into the property record `PORTAL_SCHEMA` enumerates. */
export function portalStateProperties(axis: PortalAxis): Record<string, string> {
  return { axis };
}
