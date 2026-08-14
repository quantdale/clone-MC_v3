import { BlockState, BlockStateId, BlockStateRegistry } from './BlockStateRegistry';
import { BlockTypeRegistry } from './BlockRegistry';
import { ChunkSection } from './ChunkSection';
import { SerializedPalettedContainer } from '../data/PalettedContainer';
import { sectionIndex, localCoord, SECTION_SIZE } from '../math/SectionCoordinate';

/** Horizontal chunk coordinate pair (chunk units). */
export interface ChunkCoord {
  chunkX: number;
  chunkZ: number;
}

/** Serialized form of a {@link ChunkColumn}: per-section paletted data. */
export interface SerializedChunkColumn {
  version: number;
  chunkX: number;
  chunkZ: number;
  sectionCount: number;
  minSectionY: number;
  sections: Record<number, SerializedPalettedContainer>;
}

export const CHUNK_COLUMN_VERSION = 1;

export interface ChunkColumnOptions {
  chunkX: number;
  chunkZ: number;
  /** Number of vertical sections in this column. */
  sectionCount: number;
  /** Lowest section's Y index (in section units); default 0. */
  minSectionY?: number;
  registry: BlockStateRegistry;
  airId?: BlockStateId;
  /** Optional block registry used to resolve solidity for the motion-blocking heightmap. */
  blockRegistry?: BlockTypeRegistry;
}

/**
 * A vertical stack of {@link ChunkSection}s at a fixed (chunkX, chunkZ).
 *
 * Sections are allocated lazily: an untouched section is air and never materialized
 * until written, which keeps empty columns cheap. Block get/set route through the
 * 021 section-coordinate math to the correct in-column section and local Y.
 */
export class ChunkColumn {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly sectionCount: number;
  readonly minSectionY: number;
  private readonly registry: BlockStateRegistry;
  private readonly airId: BlockStateId;
  private readonly blockRegistry?: BlockTypeRegistry;
  private readonly sections = new Map<number, ChunkSection>();
  private readonly dirtySections = new Set<number>();
  /** Lowest world Y covered by this column (`minSectionY * SECTION_SIZE`). */
  readonly minY: number;
  /** Highest world Y covered by this column (`(minSectionY + sectionCount) * SECTION_SIZE - 1`). */
  readonly maxY: number;
  /** Per-column surface heightmap: Y of the topmost non-air block, or `minY - 1` when empty. */
  private readonly surfaceHeight: Int16Array;
  /** Per-column motion-blocking heightmap: Y of the topmost motion-blocking block, or `minY - 1`. */
  private readonly motionBlockingHeight: Int16Array;
  /** When false, the heightmaps are out of date and must be recomputed on the next read. */
  private heightmapsValid: boolean;

  constructor(options: ChunkColumnOptions) {
    this.chunkX = options.chunkX;
    this.chunkZ = options.chunkZ;
    this.sectionCount = options.sectionCount;
    this.minSectionY = options.minSectionY ?? 0;
    this.registry = options.registry;
    this.airId = options.airId ?? options.registry.getDefaultState(0).id;
    this.blockRegistry = options.blockRegistry;
    this.minY = this.minSectionY * SECTION_SIZE;
    this.maxY = (this.minSectionY + this.sectionCount) * SECTION_SIZE - 1;
    const emptyHeight = this.minY - 1;
    this.surfaceHeight = new Int16Array(SECTION_SIZE * SECTION_SIZE).fill(emptyHeight);
    this.motionBlockingHeight = new Int16Array(SECTION_SIZE * SECTION_SIZE).fill(emptyHeight);
    this.heightmapsValid = true;
  }

  private sectionIndexForY(worldY: number): number {
    return sectionIndex(worldY) - this.minSectionY;
  }

  private ensureSection(sy: number): ChunkSection {
    let section = this.sections.get(sy);
    if (section === undefined) {
      section = new ChunkSection(sy, this.registry, this.airId);
      this.sections.set(sy, section);
    }
    return section;
  }

  private checkSection(sy: number): void {
    if (sy < 0 || sy >= this.sectionCount) {
      throw new RangeError(
        `Section Y ${sy} out of range for column [0, ${this.sectionCount}) at (${this.chunkX}, ${this.chunkZ})`,
      );
    }
  }

  /** Materialized section at in-column index, or a fresh air section if untouched. */
  getSection(sy: number): ChunkSection {
    this.checkSection(sy);
    return this.ensureSection(sy);
  }

  /** Resolved block state at local chunk coords (x,z in `[0,16)`) and world Y. */
  getBlockState(localX: number, worldY: number, localZ: number): BlockState {
    const sy = this.sectionIndexForY(worldY);
    this.checkSection(sy);
    const section = this.sections.get(sy);
    if (section === undefined) return this.registry.getState(this.airId);
    return section.getStateAt(localX, localCoord(worldY), localZ);
  }

  /** Set the block state at local chunk coords (x,z in `[0,16)`) and world Y. Marks dirty and updates heightmaps. */
  setBlockState(localX: number, worldY: number, localZ: number, state: BlockState): void {
    const sy = this.sectionIndexForY(worldY);
    this.checkSection(sy);
    const section = this.ensureSection(sy);
    section.setAt(localX, localCoord(worldY), localZ, state);
    this.dirtySections.add(sy);
    this.updateHeightmaps(localX, worldY, localZ, state);
  }

  /** True when any section has been written since the last {@link clearDirty}. */
  get isDirty(): boolean {
    return this.dirtySections.size > 0;
  }

  /** In-column indices of sections written since the last {@link clearDirty}. */
  dirtySectionIndices(): readonly number[] {
    return [...this.dirtySections];
  }

  clearDirty(): void {
    this.dirtySections.clear();
  }

  /**
   * Flag an in-range section as dirty without materializing it. Out-of-range indices are ignored so
   * callers can propagate from a boundary without range-checking the neighbor.
   */
  markSectionDirty(sy: number): void {
    if (sy >= 0 && sy < this.sectionCount) {
      this.dirtySections.add(sy);
    }
  }

  /** Current mesh version of the section at in-column index `sy`; `0` for an untouched section. */
  sectionMeshVersion(sy: number): number {
    return this.sections.get(sy)?.meshVersion ?? 0;
  }

  /** True when the section's current mesh version differs from a version captured at mesh-job queue time. */
  isSectionStale(sy: number, capturedVersion: number): boolean {
    return this.sectionMeshVersion(sy) !== capturedVersion;
  }

  private heightIndex(localX: number, localZ: number): number {
    return localZ * SECTION_SIZE + localX;
  }

  private isAirState(state: BlockState): boolean {
    return state.id === this.airId;
  }

  private isMotionBlockingState(state: BlockState): boolean {
    if (state.id === this.airId) return false;
    if (this.blockRegistry !== undefined) return this.blockRegistry.isSolid(state.blockId);
    return true;
  }

  /** Y of the topmost non-air block in column `(localX, localZ)`, or `minY - 1` when empty. */
  getSurfaceHeight(localX: number, localZ: number): number {
    this.ensureHeightmapsValid();
    return this.surfaceHeight[this.heightIndex(localX, localZ)] ?? this.minY - 1;
  }

  /** Y of the topmost motion-blocking block in column `(localX, localZ)`, or `minY - 1` when none. */
  getMotionBlockingHeight(localX: number, localZ: number): number {
    this.ensureHeightmapsValid();
    return this.motionBlockingHeight[this.heightIndex(localX, localZ)] ?? this.minY - 1;
  }

  /**
   * Rebuild both heightmaps from the current block state. Authoritative reset used after `deserialize`,
   * which does not restore the runtime maps.
   */
  recomputeHeightmaps(): void {
    for (let localZ = 0; localZ < SECTION_SIZE; localZ++) {
      for (let localX = 0; localX < SECTION_SIZE; localX++) {
        const idx = this.heightIndex(localX, localZ);
        this.surfaceHeight[idx] = this.rescanHeight(localX, localZ, this.maxY, false);
        this.motionBlockingHeight[idx] = this.rescanHeight(localX, localZ, this.maxY, true);
      }
    }
    this.heightmapsValid = true;
  }

  /** Mark the heightmaps as out of date; the next read recomputes them. Used after `deserialize`. */
  private invalidateHeightmaps(): void {
    this.heightmapsValid = false;
  }

  private ensureHeightmapsValid(): void {
    if (!this.heightmapsValid) {
      this.recomputeHeightmaps();
    }
  }

  /** Incrementally maintain the heightmaps for one `(localX, localZ)` column after a write. */
  private updateHeightmaps(localX: number, worldY: number, localZ: number, state: BlockState): void {
    if (!this.heightmapsValid) return; // deserialized column: recompute lazily on next read
    const idx = this.heightIndex(localX, localZ);
    const isAir = this.isAirState(state);
    const isMotion = this.isMotionBlockingState(state);

    const surface = this.surfaceHeight[idx] ?? this.minY - 1;
    if (!isAir) {
      if (worldY > surface) this.surfaceHeight[idx] = worldY;
    } else if (worldY === surface) {
      this.surfaceHeight[idx] = this.rescanHeight(localX, localZ, worldY - 1, false);
    }

    const motion = this.motionBlockingHeight[idx] ?? this.minY - 1;
    if (isMotion) {
      if (worldY > motion) this.motionBlockingHeight[idx] = worldY;
    } else if (worldY === motion) {
      this.motionBlockingHeight[idx] = this.rescanHeight(localX, localZ, worldY - 1, true);
    }
  }

  /** Walk downward from `fromY` to `minY`, returning the first Y whose block satisfies the predicate, else `minY - 1`. */
  private rescanHeight(localX: number, localZ: number, fromY: number, wantMotion: boolean): number {
    for (let y = fromY; y >= this.minY; y--) {
      const state = this.getBlockState(localX, y, localZ);
      if (wantMotion ? this.isMotionBlockingState(state) : !this.isAirState(state)) {
        return y;
      }
    }
    return this.minY - 1;
  }

  serialize(): SerializedChunkColumn {
    const sections: Record<number, SerializedPalettedContainer> = {};
    for (const [sy, section] of this.sections) {
      sections[sy] = section.serialize();
    }
    return {
      version: CHUNK_COLUMN_VERSION,
      chunkX: this.chunkX,
      chunkZ: this.chunkZ,
      sectionCount: this.sectionCount,
      minSectionY: this.minSectionY,
      sections,
    };
  }

  static deserialize(
    data: SerializedChunkColumn,
    registry: BlockStateRegistry,
    airId?: BlockStateId,
  ): ChunkColumn {
    if (data.version !== CHUNK_COLUMN_VERSION) {
      throw new Error(`Unsupported chunk column version: ${data.version}`);
    }
    const column = new ChunkColumn({
      chunkX: data.chunkX,
      chunkZ: data.chunkZ,
      sectionCount: data.sectionCount,
      minSectionY: data.minSectionY,
      registry,
      airId,
    });
    for (const key of Object.keys(data.sections)) {
      const sy = Number(key);
      const sectionData = data.sections[sy];
      if (sectionData === undefined) continue;
      column.sections.set(sy, ChunkSection.deserialize(sectionData, sy, registry, airId));
    }
    column.invalidateHeightmaps();
    return column;
  }
}
