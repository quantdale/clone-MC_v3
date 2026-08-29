import { BlockId, type BlockTypeRegistry } from './BlockRegistry';
import { BlockState, BlockStateId, BlockStateRegistry } from './BlockStateRegistry';
import { ChunkColumn, SerializedChunkColumn } from './ChunkColumn';
import { DimensionType } from '../data/DimensionType';
import { sectionIndex, localCoord, SECTION_SIZE } from '../math/SectionCoordinate';

/** Serialized form of a full {@link VerticalWorldAccess} column set. */
export interface SerializedChunkColumns {
  version: number;
  minSectionY: number;
  sectionCount: number;
  columns: SerializedChunkColumn[];
}

const CHUNK_COLUMNS_VERSION = 1;

export interface VerticalWorldAccessOptions {
  dimension: DimensionType;
  registry: BlockStateRegistry;
  /** Block registry used by canonical motion-blocking heightmaps. */
  blockRegistry?: BlockTypeRegistry;
  airId?: BlockStateId;
}

/**
 * Dimension-aware full-world block access over a map of {@link ChunkColumn}s.
 *
 * Routes a flat `(x, y, z)` coordinate to the correct column and section using the active
 * `DimensionType`'s vertical layout (025) and the 021 section math. The accessible Y span is the
 * dimension's `[minY, maxY]` — there is no 0–63 slab clamp. Columns are created lazily on the first
 * in-range write; reads never allocate. Gameplay-free: no generation, meshing, or lighting.
 */
export class VerticalWorldAccess {
  readonly dimension: DimensionType;
  readonly registry: BlockStateRegistry;
  private readonly airId: BlockStateId;
  private readonly airState: BlockState;
  private readonly blockRegistry?: BlockTypeRegistry;
  private readonly minSectionY: number;
  private readonly sectionCount: number;
  private readonly columnMap = new Map<string, ChunkColumn>();

  constructor(opts: VerticalWorldAccessOptions) {
    this.dimension = opts.dimension;
    this.registry = opts.registry;
    this.airId = opts.airId ?? opts.registry.getDefaultState(BlockId.Air).id;
    this.airState = this.registry.getState(this.airId);
    this.blockRegistry = opts.blockRegistry;
    this.minSectionY = opts.dimension.minSectionY;
    this.sectionCount = opts.dimension.sectionCount;
  }

  private static columnKey(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }

  /** Whether a column exists at the given chunk coordinates. */
  hasColumn(chunkX: number, chunkZ: number): boolean {
    return this.columnMap.has(VerticalWorldAccess.columnKey(chunkX, chunkZ));
  }

  /** Existing column at the chunk coordinates, or undefined. */
  getColumn(chunkX: number, chunkZ: number): ChunkColumn | undefined {
    return this.columnMap.get(VerticalWorldAccess.columnKey(chunkX, chunkZ));
  }

  /** Existing column, or a freshly allocated empty one (stored). */
  ensureColumn(chunkX: number, chunkZ: number): ChunkColumn {
    const key = VerticalWorldAccess.columnKey(chunkX, chunkZ);
    let column = this.columnMap.get(key);
    if (column === undefined) {
      column = new ChunkColumn({
        chunkX,
        chunkZ,
        sectionCount: this.sectionCount,
        minSectionY: this.minSectionY,
        registry: this.registry,
        blockRegistry: this.blockRegistry,
        airId: this.airId,
      });
      this.columnMap.set(key, column);
    }
    return column;
  }

  /** Remove a column. Returns true when one was present. */
  removeColumn(chunkX: number, chunkZ: number): boolean {
    return this.columnMap.delete(VerticalWorldAccess.columnKey(chunkX, chunkZ));
  }

  /** Number of materialized columns. */
  get size(): number {
    return this.columnMap.size;
  }

  /** Iterate the materialized columns. */
  columns(): IterableIterator<ChunkColumn> {
    return this.columnMap.values();
  }

  /** Resolved block state at a world coordinate. Air for empty coordinates or out-of-range Y. */
  getBlockState(x: number, y: number, z: number): BlockState {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      return this.airState;
    }
    if (!this.dimension.containsY(y)) {
      return this.airState;
    }
    const column = this.getColumn(sectionIndex(x), sectionIndex(z));
    if (column === undefined) {
      return this.airState;
    }
    return column.getBlockState(localCoord(x), y, localCoord(z));
  }

  /** Set the block state at a world coordinate. No-op for non-integer coords, out-of-range Y, or invalid state. */
  setBlockState(x: number, y: number, z: number, state: BlockState): void {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      return;
    }
    if (!this.dimension.containsY(y)) {
      return;
    }
    if (!(state instanceof BlockState)) {
      return;
    }
    const chunkX = sectionIndex(x);
    const chunkZ = sectionIndex(z);
    const localX = localCoord(x);
    const localZ = localCoord(z);
    const column = this.ensureColumn(chunkX, chunkZ);
    column.setBlockState(localX, y, localZ, state);
    this.markNeighborSectionsDirty(chunkX, chunkZ, localX, localZ, y);
  }

  /**
   * Flag the neighbor sections sharing a face with the just-written block. Horizontal neighbors are the
   * adjacent chunk's section at the same in-column `sy`; vertical neighbors are this column's `sy ± 1`.
   * Only existing neighbor columns are touched (absent ones have no mesh to update).
   */
  private markNeighborSectionsDirty(
    chunkX: number,
    chunkZ: number,
    localX: number,
    localZ: number,
    worldY: number,
  ): void {
    const sy = sectionIndex(worldY) - this.minSectionY;
    const localY = localCoord(worldY);
    if (localX === 0) this.markNeighborDirty(chunkX - 1, chunkZ, sy);
    if (localX === SECTION_SIZE - 1) this.markNeighborDirty(chunkX + 1, chunkZ, sy);
    if (localZ === 0) this.markNeighborDirty(chunkX, chunkZ - 1, sy);
    if (localZ === SECTION_SIZE - 1) this.markNeighborDirty(chunkX, chunkZ + 1, sy);
    if (localY === 0) this.markNeighborDirty(chunkX, chunkZ, sy - 1);
    if (localY === SECTION_SIZE - 1) this.markNeighborDirty(chunkX, chunkZ, sy + 1);
  }

  private markNeighborDirty(nx: number, nz: number, nsy: number): void {
    if (nsy < 0 || nsy >= this.sectionCount) {
      return; // No neighbor section exists (e.g. top/bottom of the dimension).
    }
    const neighbor = this.getColumn(nx, nz);
    if (neighbor === undefined) {
      return; // Absent column has no mesh to update; do not materialize it.
    }
    neighbor.markSectionDirty(nsy);
  }

  /** True when any column has unsaved changes. */
  get isDirty(): boolean {
    for (const column of this.columnMap.values()) {
      if (column.isDirty) {
        return true;
      }
    }
    return false;
  }

  /** Columns with unsaved changes, in insertion order. */
  dirtyColumns(): ChunkColumn[] {
    const dirty: ChunkColumn[] = [];
    for (const column of this.columnMap.values()) {
      if (column.isDirty) {
        dirty.push(column);
      }
    }
    return dirty;
  }

  /** Clear the dirty flag on every column. */
  clearDirty(): void {
    for (const column of this.columnMap.values()) {
      column.clearDirty();
    }
  }

  /** Serialize every materialized column. */
  serialize(): SerializedChunkColumns {
    const columns: SerializedChunkColumn[] = [];
    for (const column of this.columnMap.values()) {
      columns.push(column.serialize());
    }
    return {
      version: CHUNK_COLUMNS_VERSION,
      minSectionY: this.minSectionY,
      sectionCount: this.sectionCount,
      columns,
    };
  }

  /**
   * Rebuild a world from serialized columns. The stored `minSectionY`/`sectionCount` MUST match
   * `dimension`; a mismatch means the data was written for a different vertical layout and is rejected.
   */
  static deserialize(
    data: SerializedChunkColumns,
    registry: BlockStateRegistry,
    dimension: DimensionType,
    airId?: BlockStateId,
    blockRegistry?: BlockTypeRegistry,
  ): VerticalWorldAccess {
    const world = new VerticalWorldAccess({ dimension, registry, blockRegistry, airId });
    if (data.minSectionY !== dimension.minSectionY || data.sectionCount !== dimension.sectionCount) {
      throw new Error(
        `VerticalWorldAccess layout mismatch: stored minSectionY=${data.minSectionY}/sectionCount=${data.sectionCount}, ` +
          `dimension expects minSectionY=${dimension.minSectionY}/sectionCount=${dimension.sectionCount}`,
      );
    }
    for (const serialized of data.columns) {
      const column = ChunkColumn.deserialize(serialized, registry, airId, blockRegistry);
      world.columnMap.set(VerticalWorldAccess.columnKey(column.chunkX, column.chunkZ), column);
    }
    return world;
  }
}
