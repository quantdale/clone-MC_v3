import { BlockId } from './BlockRegistry';
import { CHUNK_BLOCK_COUNT, localIndex, isLocalInBounds } from './WorldCoordinates';

/**
 * Chunk lifecycle states.
 */
export const enum ChunkState {
  /** Not yet created / freed. */
  Pending = 0,
  /** Generation is queued or in progress. */
  Generating = 1,
  /** Block data is generated (base terrain), not yet meshed. */
  Generated = 2,
  /** Meshing is queued or in progress. */
  Meshing = 3,
  /** Mesh is built and attached to the scene. */
  Visible = 4,
}

/**
 * A legacy 16×64×16 block-id projection used by compatibility generators and
 * the current slab-shaped renderer. It is not live world authority: World
 * writes canonical `ChunkColumn`/`ChunkSection` state first and refreshes this
 * buffer from that state before a compatibility consumer reads it.
 */
export class Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly blocks: Uint8Array;

  state: ChunkState = ChunkState.Pending;

  /** Set when canonical terrain (or a compatibility generator) has been generated. */
  generated = false;

  /** Increments whenever the chunk is regenerated or its data changes; used to
   *  discard stale async mesh results. */
  meshVersion = 0;

  /** Whether this chunk is dirty and needs re-meshing. */
  dirty = false;

  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_BLOCK_COUNT);
  }

  /** Get a block id at local coordinates (no bounds check — caller must validate). */
  getLocal(lx: number, ly: number, lz: number): number {
    return this.blocks[localIndex(lx, ly, lz)]!;
  }

  /**
   * Set a block id for a compatibility generator/test fixture. Live World
   * mutation must use canonical storage and then refresh the projection.
   */
  setLocal(lx: number, ly: number, lz: number, id: number): void {
    this.blocks[localIndex(lx, ly, lz)] = id;
  }

  /** Update one cell of the read-only-at-runtime compatibility projection. */
  setProjectionLocal(lx: number, ly: number, lz: number, id: number): void {
    this.blocks[localIndex(lx, ly, lz)] = id;
  }

  /** Replace the projection from canonical/read-only block-id data. */
  replaceProjection(source: ArrayLike<number>): void {
    if (source.length !== this.blocks.length) {
      throw new RangeError(`Chunk projection length ${source.length} does not match ${this.blocks.length}`);
    }
    for (let i = 0; i < this.blocks.length; i++) {
      this.blocks[i] = source[i] ?? BlockId.Air;
    }
  }

  /** Get block id with bounds checking; returns air for out-of-bounds. */
  getLocalSafe(lx: number, ly: number, lz: number): number {
    if (!isLocalInBounds(lx, ly, lz)) {
      return BlockId.Air;
    }
    return this.blocks[localIndex(lx, ly, lz)]!;
  }

  /** Fill the compatibility projection (used by legacy generator fixtures). */
  fill(id: number): void {
    this.blocks.fill(id);
  }

  /** Fill the projection while making the authority boundary explicit. */
  fillProjection(id: number): void {
    this.blocks.fill(id);
  }

  /** Clear a projection range without implying a canonical world mutation. */
  clearProjectionRange(from: number, to: number): void {
    this.blocks.fill(BlockId.Air, from, to);
  }

  /** Mark the chunk dirty, bumping its mesh version. */
  markDirty(): void {
    this.dirty = true;
    this.meshVersion++;
  }
}