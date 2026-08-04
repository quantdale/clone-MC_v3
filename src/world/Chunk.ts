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
  /** Marked for unloading. */
  Unloading = 5,
}

/**
 * A single chunk's block storage: a flat Uint8Array indexed
 * `x + z*width + y*width*depth`. 16 KB per chunk for 16×64×16.
 */
export class Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly blocks: Uint8Array;

  state: ChunkState = ChunkState.Pending;

  /** Set when the base terrain has been generated (before edit overlay). */
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

  /** Set a block id at local coordinates (no bounds check). */
  setLocal(lx: number, ly: number, lz: number, id: number): void {
    this.blocks[localIndex(lx, ly, lz)] = id;
  }

  /** Get block id with bounds checking; returns air for out-of-bounds. */
  getLocalSafe(lx: number, ly: number, lz: number): number {
    if (!isLocalInBounds(lx, ly, lz)) {
      return BlockId.Air;
    }
    return this.blocks[localIndex(lx, ly, lz)]!;
  }

  /** Fill the whole chunk with a block id (used to reset to air). */
  fill(id: number): void {
    this.blocks.fill(id);
  }

  /** Mark the chunk dirty, bumping its mesh version. */
  markDirty(): void {
    this.dirty = true;
    this.meshVersion++;
  }
}