/**
 * Adapter exposing a {@link World} through the {@link BlockWorldAccess} surface
 * used by block behaviors. Maps the behavior-facing id/state calls onto the
 * world's block and block-state accessors.
 */
import type { BlockState } from '../world/BlockStateRegistry';
import type { World } from '../world/World';
import type { BlockWorldAccess } from './BlockBehavior';

/** BlockWorldAccess implementation backed by a chunk world. */
export class WorldBlockAccess implements BlockWorldAccess {
  constructor(private readonly world: World) {}

  getBlockId(x: number, y: number, z: number): number {
    return this.world.getBlock(x, y, z);
  }

  setBlockId(x: number, y: number, z: number, id: number): void {
    this.world.setBlock(x, y, z, id);
  }

  getBlockState(x: number, y: number, z: number): BlockState {
    return this.world.getBlockState(x, y, z);
  }

  setBlockState(
    x: number,
    y: number,
    z: number,
    blockId: number,
    properties: Readonly<Record<string, boolean | number | string>>,
  ): void {
    this.world.setBlockState(x, y, z, blockId, properties);
  }
}
