/**
 * Navigation grid query (134): per-cell walkability classification and
 * movement cost for a generic ground-walker entity profile, combining 056
 * `VoxelShape` collision with block-id-based hazard/fluid detection (water,
 * fire, lava). No pathfinding/search (135's scope), no per-mob movement
 * profiles, and no `Game`/`World` wiring — see
 * `openspec/changes/134-navigation-grid-query/design.md`.
 */
import { BlockId } from '../world/BlockRegistry';
import type { VoxelShape } from '../world/VoxelShape';

/** The minimal world access this module needs. */
export interface NavigationWorld {
  getCollisionShape(x: number, y: number, z: number): VoxelShape;
  getBlockId(x: number, y: number, z: number): number;
}

/** Classification of one cell for walkability/cost purposes. */
export const enum PathNodeType {
  Blocked = 0,
  Open = 1,
  Water = 2,
  DamageFire = 3,
  Lava = 4,
}

/** Fixed movement-cost weight per path node type. Ordering is load-bearing for a future pathfinder. */
const NODE_COST: Record<PathNodeType, number> = {
  [PathNodeType.Open]: 0,
  [PathNodeType.Water]: 8,
  [PathNodeType.DamageFire]: 16,
  [PathNodeType.Blocked]: Infinity,
  [PathNodeType.Lava]: Infinity,
};

/** The movement-cost weight for `type`. */
export function nodeCost(type: PathNodeType): number {
  return NODE_COST[type];
}

/** Whether an entity may occupy a cell classified `type`. */
export function isPassable(type: PathNodeType): boolean {
  return type === PathNodeType.Open || type === PathNodeType.Water || type === PathNodeType.DamageFire;
}

/**
 * Classify the cell at `(x, y, z)`. A non-empty collision shape always wins
 * (`Blocked`), regardless of block id; otherwise the block id determines
 * `Lava`/`DamageFire`/`Water`/`Open`.
 */
export function classifyNode(world: NavigationWorld, x: number, y: number, z: number): PathNodeType {
  if (!world.getCollisionShape(x, y, z).isEmpty) {
    return PathNodeType.Blocked;
  }
  const id = world.getBlockId(x, y, z);
  if (id === BlockId.Lava) return PathNodeType.Lava;
  if (id === BlockId.Fire) return PathNodeType.DamageFire;
  if (id === BlockId.Water) return PathNodeType.Water;
  return PathNodeType.Open;
}

/**
 * Whether an entity `height` cells tall can occupy the vertical column at
 * `(x, y..y+height-1, z)`: every occupied cell must be passable, and there
 * must be support — solid ground at `(x, y-1, z)`, or the feet cell itself is
 * `Water` (floats/swims without ground).
 */
export function canStandAt(
  world: NavigationWorld,
  x: number,
  y: number,
  z: number,
  height: number,
): boolean {
  for (let dy = 0; dy < height; dy++) {
    if (!isPassable(classifyNode(world, x, y + dy, z))) {
      return false;
    }
  }
  const hasGround = !world.getCollisionShape(x, y - 1, z).isEmpty;
  const inWater = classifyNode(world, x, y, z) === PathNodeType.Water;
  return hasGround || inWater;
}

/**
 * The movement cost of occupying `(x, y, z)` with an entity `height` cells
 * tall: `Infinity` when `canStandAt` is `false`, otherwise the feet cell's
 * `nodeCost`.
 */
export function movementCost(
  world: NavigationWorld,
  x: number,
  y: number,
  z: number,
  height: number,
): number {
  if (!canStandAt(world, x, y, z, height)) {
    return Infinity;
  }
  return nodeCost(classifyNode(world, x, y, z));
}
