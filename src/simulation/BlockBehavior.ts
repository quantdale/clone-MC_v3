/**
 * Registry-selected block behavior dispatch (050). Block logic is expressed as `BlockBehavior`
 * modules (optional lifecycle hooks) registered per block key in a `BlockBehaviorRegistry`; consumers
 * look up `getBehavior(blockKey)` and invoke the relevant hook — no central block switches. Behaviors
 * interact with the world only through the minimal `BlockWorldAccess`, keeping them decoupled and
 * unit-testable. Unregistered blocks resolve to the shared no-op default.
 */
import type { BlockState } from '../world/BlockStateRegistry';

/** Minimal block-world access a behavior may use (satisfied by the world wiring later). */
export interface BlockWorldAccess {
  getBlockId(x: number, y: number, z: number): number;
  setBlockId(x: number, y: number, z: number, id: number): void;
  /**
   * Read the block state at (x, y, z). Optional: behaviors that only need block
   * ids work without it; the world adapter (125) provides it.
   */
  getBlockState?(x: number, y: number, z: number): BlockState;
  /**
   * Write the canonical state for `blockId` with the given property values at
   * (x, y, z). Optional; crop growth uses it to advance a block's state.
   */
  setBlockState?(
    x: number,
    y: number,
    z: number,
    blockId: number,
    properties: Readonly<Record<string, boolean | number | string>>,
  ): void;
}

/** Everything a behavior hook needs: position, game tick, and world access. */
export interface BlockBehaviorContext {
  x: number;
  y: number;
  z: number;
  /** Current game tick. */
  tick: number;
  world: BlockWorldAccess;
}

/** A block behavior module; every hook is optional. */
export interface BlockBehavior {
  /** Called when a scheduled tick fires for this block (047). */
  onScheduledTick?(ctx: BlockBehaviorContext): void;
  /** Called when a random tick selects this block (048). */
  onRandomTick?(ctx: BlockBehaviorContext): void;
  /** Called when a neighbor changed (049). */
  onNeighborChanged?(ctx: BlockBehaviorContext, fromX: number, fromY: number, fromZ: number): void;
  /** Called when the block is placed. */
  onPlaced?(ctx: BlockBehaviorContext): void;
  /** Called when the block is broken. */
  onBroken?(ctx: BlockBehaviorContext): void;
}

/** Shared no-op behavior for unregistered blocks (frozen; one object for all lookups). */
export const DEFAULT_BLOCK_BEHAVIOR: BlockBehavior = Object.freeze({});

/** Maps block keys to behavior modules with default fallback and registration validation. */
export class BlockBehaviorRegistry {
  private readonly behaviors = new Map<string, BlockBehavior>();

  /** Register a behavior module for `blockKey`. Throws on empty keys, non-objects, or duplicates. */
  register(blockKey: string, behavior: BlockBehavior): void {
    if (typeof blockKey !== 'string' || blockKey.length === 0) {
      throw new Error('BlockBehaviorRegistry: blockKey must be a non-empty string');
    }
    if (typeof behavior !== 'object' || behavior === null) {
      throw new Error(`BlockBehaviorRegistry: behavior for '${blockKey}' must be an object`);
    }
    if (this.behaviors.has(blockKey)) {
      throw new Error(`BlockBehaviorRegistry: duplicate behavior for '${blockKey}'`);
    }
    this.behaviors.set(blockKey, behavior);
  }

  /** The behavior module for `blockKey`, or the shared default when unregistered. */
  getBehavior(blockKey: string): BlockBehavior {
    return this.behaviors.get(blockKey) ?? DEFAULT_BLOCK_BEHAVIOR;
  }

  /** Whether a behavior module is registered for `blockKey`. */
  hasBehavior(blockKey: string): boolean {
    return this.behaviors.has(blockKey);
  }

  /** Number of registered behaviors. */
  get size(): number {
    return this.behaviors.size;
  }

  /** Remove all registrations. */
  clear(): void {
    this.behaviors.clear();
  }
}
