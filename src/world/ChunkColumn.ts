import { BlockState, BlockStateId, BlockStateRegistry } from './BlockStateRegistry';
import { ChunkSection } from './ChunkSection';
import { SerializedPalettedContainer } from '../data/PalettedContainer';
import { sectionIndex, localCoord } from '../math/SectionCoordinate';

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
  private readonly sections = new Map<number, ChunkSection>();
  private readonly dirtySections = new Set<number>();

  constructor(options: ChunkColumnOptions) {
    this.chunkX = options.chunkX;
    this.chunkZ = options.chunkZ;
    this.sectionCount = options.sectionCount;
    this.minSectionY = options.minSectionY ?? 0;
    this.registry = options.registry;
    this.airId = options.airId ?? options.registry.getDefaultState(0).id;
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

  /** Set the block state at local chunk coords (x,z in `[0,16)`) and world Y. Marks dirty. */
  setBlockState(localX: number, worldY: number, localZ: number, state: BlockState): void {
    const sy = this.sectionIndexForY(worldY);
    this.checkSection(sy);
    const section = this.ensureSection(sy);
    section.setAt(localX, localCoord(worldY), localZ, state);
    this.dirtySections.add(sy);
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
    return column;
  }
}
