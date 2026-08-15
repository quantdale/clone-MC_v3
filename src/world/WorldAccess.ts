/**
 * World access interface.
 *
 * Implemented by the chunk world and consumed by the player, physics, and
 * interaction systems. This decouples gameplay from world storage details.
 */
import type { BlockState } from './BlockStateRegistry';

export interface WorldAccess {
  /** Read the block id at world coordinates. */
  getBlock(x: number, y: number, z: number): number;

  /** Write a block id at world coordinates (records edits, marks dirty). */
  setBlock(x: number, y: number, z: number, id: number): void;

  /** Whether the block at world coordinates is solid (collidable). */
  isSolid(x: number, y: number, z: number): boolean;

  /** Read the block state at world coordinates (default state when unset). */
  getBlockState?(x: number, y: number, z: number): BlockState;

  /** Write the canonical state for `blockId` with the given property values. */
  setBlockState?(
    x: number,
    y: number,
    z: number,
    blockId: number,
    properties: Readonly<Record<string, boolean | number | string>>,
  ): void;
}