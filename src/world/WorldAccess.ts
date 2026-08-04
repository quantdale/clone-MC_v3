/**
 * World access interface.
 *
 * Implemented by the chunk world and consumed by the player, physics, and
 * interaction systems. This decouples gameplay from world storage details.
 */
export interface WorldAccess {
  /** Read the block id at world coordinates. */
  getBlock(x: number, y: number, z: number): number;

  /** Write a block id at world coordinates (records edits, marks dirty). */
  setBlock(x: number, y: number, z: number, id: number): void;

  /** Whether the block at world coordinates is solid (collidable). */
  isSolid(x: number, y: number, z: number): boolean;
}