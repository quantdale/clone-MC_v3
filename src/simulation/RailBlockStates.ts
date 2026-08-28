/**
 * Rail block states (171): the first transport block, and the first multi-shape block whose shape
 * depends on its *neighbors*. A rail's `shape` property is one of 10 vanilla values: two flat
 * straights (north_south, east_west), four ascents (ascending_east/west/north/south — formed when a
 * connecting rail sits one block higher), and four corners (corner_north_east etc. — formed when two
 * perpendicular same-level rails meet).
 *
 * `resolveRailShape` is a pure, deterministic connection rule with a documented precedence:
 *   1. north+south present -> straight (ascending toward whichever side is elevated);
 *   2. east+west present -> straight (same);
 *   3. two perpendicular same-level neighbors -> corner;
 *   4. a single neighbor -> ascending if it is elevated, otherwise the flat straight for its axis;
 *   5. no neighbors -> north_south (vanilla's default, and the default block state).
 * Corners require same-level rails; an elevated neighbor never forms a corner (it ascends instead).
 *
 * `railNeighborInfo` samples the caller's world for a rail at the same height (level 0) or one block
 * higher (level 1) in a horizontal direction; `railHasSupport` implements the placement rule (a
 * solid block below); `railShapeConnections` and `railStateProperties` make shapes inspectable.
 */
import { DIRECTION_OFFSETS } from './RedstoneSignal';

/** The ten vanilla rail shapes. */
export type RailShape =
  | 'north_south'
  | 'east_west'
  | 'ascending_east'
  | 'ascending_west'
  | 'ascending_north'
  | 'ascending_south'
  | 'corner_north_east'
  | 'corner_north_west'
  | 'corner_south_east'
  | 'corner_south_west';

/** All rail shapes in a stable order (also the `shape` property's legal values). */
export const RAIL_SHAPES: readonly RailShape[] = [
  'north_south',
  'east_west',
  'ascending_east',
  'ascending_west',
  'ascending_north',
  'ascending_south',
  'corner_north_east',
  'corner_north_west',
  'corner_south_east',
  'corner_south_west',
];

export type HorizontalDirection = 'north' | 'south' | 'east' | 'west';

/** How a neighbor rail connects: 0 = same height, 1 = one block higher (ascending). */
export type RailLevel = 0 | 1;

export interface RailNeighbor {
  readonly present: boolean;
  readonly level: RailLevel;
}

/** The world seam for neighbor sampling. */
export interface RailNeighborWorld<S> {
  getBlockState(x: number, y: number, z: number): S;
  isRail(state: S): boolean;
}

/** The world seam for placement support checks. */
export interface RailSupportWorld<S> {
  getBlockState(x: number, y: number, z: number): S;
  isSolidSupport(state: S): boolean;
}

/** Whether `direction` connects a rail at `(x, y, z)` to a neighbor rail (same height or +1). */
export function railNeighborInfo<S>(
  world: RailNeighborWorld<S>,
  x: number,
  y: number,
  z: number,
  direction: HorizontalDirection,
): RailNeighbor {
  const [dx, dy, dz] = DIRECTION_OFFSETS[direction];
  if (world.isRail(world.getBlockState(x + dx, y + dy, z + dz))) {
    return { present: true, level: 0 };
  }
  if (world.isRail(world.getBlockState(x + dx, y + dy + 1, z + dz))) {
    return { present: true, level: 1 };
  }
  return { present: false, level: 0 };
}

/**
 * Resolve the rail shape from neighbor presence/levels. `undefined` = no rail in that direction;
 * `0` = same-level rail, `1` = rail one block higher. Deterministic precedence (see module doc).
 */
export function resolveRailShape(neighbors: {
  readonly north?: RailLevel;
  readonly south?: RailLevel;
  readonly east?: RailLevel;
  readonly west?: RailLevel;
}): RailShape {
  const { north, south, east, west } = neighbors;

  if (north !== undefined && south !== undefined) {
    if (north === 1) return 'ascending_north';
    if (south === 1) return 'ascending_south';
    return 'north_south';
  }
  if (east !== undefined && west !== undefined) {
    if (east === 1) return 'ascending_east';
    if (west === 1) return 'ascending_west';
    return 'east_west';
  }
  if (north === 0 && east === 0) return 'corner_north_east';
  if (north === 0 && west === 0) return 'corner_north_west';
  if (south === 0 && east === 0) return 'corner_south_east';
  if (south === 0 && west === 0) return 'corner_south_west';
  if (north === 1) return 'ascending_north';
  if (south === 1) return 'ascending_south';
  if (east === 1) return 'ascending_east';
  if (west === 1) return 'ascending_west';
  if (north === 0) return 'north_south';
  if (south === 0) return 'north_south';
  if (east === 0) return 'east_west';
  if (west === 0) return 'east_west';
  return 'north_south';
}

/** The horizontal directions a rail shape connects toward (in a stable order). */
export function railShapeConnections(shape: RailShape): readonly HorizontalDirection[] {
  switch (shape) {
    case 'north_south':
      return ['north', 'south'];
    case 'east_west':
      return ['east', 'west'];
    case 'ascending_east':
      return ['east'];
    case 'ascending_west':
      return ['west'];
    case 'ascending_north':
      return ['north'];
    case 'ascending_south':
      return ['south'];
    case 'corner_north_east':
      return ['north', 'east'];
    case 'corner_north_west':
      return ['north', 'west'];
    case 'corner_south_east':
      return ['south', 'east'];
    case 'corner_south_west':
      return ['south', 'west'];
  }
}

/** The placement rule: a rail needs a solid-supporting block directly below it. */
export function railHasSupport<S>(world: RailSupportWorld<S>, x: number, y: number, z: number): boolean {
  return world.isSolidSupport(world.getBlockState(x, y - 1, z));
}

/** Project a rail's full state into the property record `RAIL_SCHEMA` enumerates. */
export function railStateProperties(shape: RailShape): Record<string, string> {
  return { shape };
}
