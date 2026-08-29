import { BlockId } from './BlockRegistry';
import { BlockState, BlockStateId, BlockStateRegistry } from './BlockStateRegistry';
import { PalettedContainer, SerializedPalettedContainer } from '../data/PalettedContainer';
import { SECTION_VOLUME, localIndex } from '../math/SectionCoordinate';

/**
 * One 16×16×16 vertical slice of a chunk column, storing block states in a
 * paletted container keyed by {@link BlockStateId}.
 *
 * An empty section uses a single-entry palette (all air), which the
 * {@link PalettedContainer} already encodes as a 4-bit, all-zero pack — the
 * compact empty representation. `isEmpty()` detects this without scanning.
 */
export class ChunkSection {
  readonly index: number;
  private readonly registry: BlockStateRegistry;
  private readonly airId: BlockStateId;
  private storage: PalettedContainer<BlockStateId>;
  /** Monotonic version bumped on every mutation; used to drop stale mesh jobs. */
  private meshVersionInternal = 0;

  constructor(index: number, registry: BlockStateRegistry, airId?: BlockStateId) {
    this.index = index;
    this.registry = registry;
    this.airId = airId ?? registry.getDefaultState(BlockId.Air).id;
    this.storage = new PalettedContainer<BlockStateId>({
      capacity: SECTION_VOLUME,
      defaultValue: this.airId,
    });
  }

  /** Runtime block-state id at local slot `localIndex` in `[0, SECTION_VOLUME)`. */
  getStateId(localIndex: number): BlockStateId {
    return this.storage.get(localIndex);
  }

  /** Resolved block state at local slot `localIndex`. */
  getState(localIndex: number): BlockState {
    return this.registry.getState(this.storage.get(localIndex));
  }

  /** Runtime block-state id at in-section local coordinates (each in `[0,16)`). */
  getStateIdAt(localX: number, localY: number, localZ: number): BlockStateId {
    return this.getStateId(localIndex(localX, localY, localZ));
  }

  /** Resolved block state at in-section local coordinates (each in `[0,16)`). */
  getStateAt(localX: number, localY: number, localZ: number): BlockState {
    return this.getState(localIndex(localX, localY, localZ));
  }

  set(localIndex: number, state: BlockState): void {
    this.storage.set(localIndex, state.id);
    this.meshVersionInternal++;
  }

  /** Mark this section's mesh as stale without changing block contents. */
  invalidateMesh(): void {
    this.meshVersionInternal++;
  }

  /** Monotonic version; increments on every mutation so stale mesh jobs can be discarded. */
  get meshVersion(): number {
    return this.meshVersionInternal;
  }

  setStateId(localIndex: number, id: BlockStateId): void {
    this.storage.set(localIndex, id);
    this.meshVersionInternal++;
  }

  setAt(localX: number, localY: number, localZ: number, state: BlockState): void {
    this.set(localIndex(localX, localY, localZ), state);
  }

  /** Replace every slot with `state`. Counts as a single logical mutation. */
  fill(state: BlockState): void {
    for (let i = 0; i < SECTION_VOLUME; i++) {
      this.storage.set(i, state.id);
    }
    this.meshVersionInternal++;
  }

  /** True when every slot is air (single-entry palette). */
  isEmpty(): boolean {
    return this.storage.paletteSize === 1;
  }

  /** Count of slots whose block state is not air. */
  nonAirCount(): number {
    if (this.isEmpty()) return 0;
    let count = 0;
    for (let i = 0; i < SECTION_VOLUME; i++) {
      if (this.storage.get(i) !== this.airId) count++;
    }
    return count;
  }

  /** Deterministic serialization of the backing paletted container. */
  serialize(): SerializedPalettedContainer {
    return this.storage.serialize();
  }

  /**
   * Reconstruct a section from serialized paletted data. `airId` MUST match the
   * value used at serialization time, or slots round-trip to the wrong state.
   */
  static deserialize(
    data: SerializedPalettedContainer,
    index: number,
    registry: BlockStateRegistry,
    airId?: BlockStateId,
  ): ChunkSection {
    const section = new ChunkSection(index, registry, airId);
    section.storage = PalettedContainer.deserialize(data, {
      capacity: SECTION_VOLUME,
      defaultValue: section.airId,
    });
    return section;
  }
}
