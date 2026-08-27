import { BlockRegistry, createDefaultBlockRegistry } from './BlockRegistry';
import {
  BlockState,
  BlockStateId,
  BlockStateRegistry,
  createDefaultBlockStateRegistry,
} from './BlockStateRegistry';
import { DimensionType } from '../data/DimensionType';
import { VerticalWorldAccess, SerializedChunkColumns } from './VerticalWorldAccess';
import { ChunkColumn } from './ChunkColumn';
import type { WorldAccess } from './WorldAccess';

export interface CanonicalWorldStorageOptions {
  dimension: DimensionType;
  /** Block-id registry used for id validity + solidity projection. */
  blockRegistry?: BlockRegistry;
  /** Canonical block-state registry used to resolve default/property-bearing states. */
  stateRegistry?: BlockStateRegistry;
  airId?: BlockStateId;
}

/**
 * Single canonical live block-state authority for Change 253.
 *
 * Wraps the verified dimension-aware `VerticalWorldAccess` / `ChunkColumn` /
 * `ChunkSection` storage so the rest of the engine has exactly one writable
 * world truth. It is NOT a third backing store: it delegates every read/write to
 * the canonical `VerticalWorldAccess`. Compatibility `getBlock`/`setBlock` are
 * projections over canonical `BlockState.blockId`; property-bearing writes go
 * straight to canonical `setBlockState`. No separate writable `stateOverlay` or
 * `editOverlay` exists here — edits are canonical mutations tracked by column dirtiness.
 */
export class CanonicalWorldStorage implements WorldAccess {
  readonly dimension: DimensionType;
  readonly vwa: VerticalWorldAccess;
  private readonly blockRegistry: BlockRegistry;
  private readonly stateRegistry: BlockStateRegistry;

  constructor(opts: CanonicalWorldStorageOptions) {
    this.dimension = opts.dimension;
    this.blockRegistry = opts.blockRegistry ?? createDefaultBlockRegistry();
    this.stateRegistry = opts.stateRegistry ?? createDefaultBlockStateRegistry();
    this.vwa = new VerticalWorldAccess({
      dimension: opts.dimension,
      registry: this.stateRegistry,
      airId: opts.airId,
    });
  }

  /** Read the canonical block id at a world coordinate (projection of canonical state). */
  getBlock(x: number, y: number, z: number): number {
    return this.vwa.getBlockState(x, y, z).blockId;
  }

  /** Write the registered default `BlockState` for `id` canonically. No-op for out-of-range/invalid. */
  setBlock(x: number, y: number, z: number, id: number): void {
    if (!Number.isInteger(id) || !this.blockRegistry.has(id)) return;
    if (!this.dimension.containsY(y)) return;
    const state = this.stateRegistry.getDefaultState(id);
    this.vwa.setBlockState(x, y, z, state);
  }

  isSolid(x: number, y: number, z: number): boolean {
    return this.blockRegistry.isSolid(this.getBlock(x, y, z));
  }

  /** Read the canonical block state (default state when unset). */
  getBlockState(x: number, y: number, z: number): BlockState {
    return this.vwa.getBlockState(x, y, z);
  }

  /** Write a canonical state for `blockId` with the given property values. */
  setBlockState(
    x: number,
    y: number,
    z: number,
    blockId: number,
    properties: Readonly<Record<string, boolean | number | string>>,
  ): void {
    if (!Number.isInteger(blockId) || !this.blockRegistry.has(blockId)) return;
    if (!this.dimension.containsY(y)) return;
    const state = this.stateRegistry.lookup(blockId, { ...properties });
    this.vwa.setBlockState(x, y, z, state);
  }

  // ── Column residency delegation (horizontal (chunkX,chunkZ) columns + lazy sections) ──

  hasColumn(chunkX: number, chunkZ: number): boolean {
    return this.vwa.hasColumn(chunkX, chunkZ);
  }

  getColumn(chunkX: number, chunkZ: number): ChunkColumn | undefined {
    return this.vwa.getColumn(chunkX, chunkZ);
  }

  ensureColumn(chunkX: number, chunkZ: number): ChunkColumn {
    return this.vwa.ensureColumn(chunkX, chunkZ);
  }

  removeColumn(chunkX: number, chunkZ: number): boolean {
    return this.vwa.removeColumn(chunkX, chunkZ);
  }

  /** Replace or insert a column directly (bulk import, idempotent by chunkX/chunkZ). */
  importColumn(column: ChunkColumn): void {
    // VWA has no public setter; use its columnMap via the same pattern
    // `CanonicalWorldStorage.deserialize` already uses — centralized here so
    // callers do not repeat the private cast.
    this.vwa.removeColumn(column.chunkX, column.chunkZ);
    (this.vwa as unknown as { columnMap: Map<string, ChunkColumn> }).columnMap.set(
      `${column.chunkX},${column.chunkZ}`,
      column,
    );
  }

  get size(): number {
    return this.vwa.size;
  }

  columns(): IterableIterator<ChunkColumn> {
    return this.vwa.columns();
  }

  // ── Dirty / persistence delegation ──

  get isDirty(): boolean {
    return this.vwa.isDirty;
  }

  dirtyColumns(): ChunkColumn[] {
    return this.vwa.dirtyColumns();
  }

  clearDirty(): void {
    this.vwa.clearDirty();
  }

  serialize(): SerializedChunkColumns {
    return this.vwa.serialize();
  }

  /** Restore canonical state from serialized columns; layout must match the active dimension. */
  static deserialize(
    data: SerializedChunkColumns,
    dimension: DimensionType,
    blockRegistry: BlockRegistry = createDefaultBlockRegistry(),
    stateRegistry: BlockStateRegistry = createDefaultBlockStateRegistry(),
    airId?: BlockStateId,
  ): CanonicalWorldStorage {
    const storage = new CanonicalWorldStorage({ dimension, blockRegistry, stateRegistry, airId });
    const restored = VerticalWorldAccess.deserialize(data, stateRegistry, dimension, airId);
    for (const column of restored.columns()) {
      storage.vwa.removeColumn(column.chunkX, column.chunkZ);
      (storage.vwa as unknown as { columnMap: Map<string, ChunkColumn> }).columnMap.set(
        `${column.chunkX},${column.chunkZ}`,
        column,
      );
    }
    return storage;
  }
}
