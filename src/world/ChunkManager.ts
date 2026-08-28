import { BlockRegistry } from './BlockRegistry';
import { Chunk } from './Chunk';
import { chunkKey } from './WorldCoordinates';
import {
  CHUNK_PIPELINE_QUEUE_CAPS,
  UNLOAD_HYSTERESIS_CHUNKS,
  ChunkPipeline,
} from './ChunkPipeline';
import { ChunkLifecycleStage, isChunkLifecycleAtLeast } from './ChunkStatus';
import { ChunkTicket } from './ChunkTicket';

/** Read-only horizontal residency projection over the legacy slab projections. */
export interface ChunkColumnResidency {
  readonly chunkX: number;
  readonly chunkZ: number;
  /** Resident vertical slab projections; absent layers are not materialized. */
  readonly slabs: readonly Chunk[];
}

/**
 * Owns the set of loaded chunks, keyed by their chunk-coordinate triple.
 * Residency is horizontal (chunkX, chunkZ) columns with lazy vertical sections:
 * the outer map is keyed by column `${cx},${cz}`, each entry lazily holds the
 * resident 16×64×16 slabs for that column's `cy` layers. No vertical slab is
 * allocated until explicitly created; an absent-air read never materializes a
 * section. This mirrors canonical `VerticalWorldAccess`'s column residency while
 * preserving the existing slab `Chunk` contract for World.ts meshing/generation.
 *
 * Storage delegates lifecycle bookkeeping to the {@link ChunkPipeline}: every chunk created here
 * gets an authoritative lifecycle record (status, tickets, generation token), and removals go
 * through the eviction flow (`Evicting` before release). The string-keyed chunk map remains the
 * source of truth for block data so existing callers (World.ts) compile unchanged.
 */
export class ChunkManager {
  /** Column residency: outer key `${cx},${cz}` → inner map `cy → Chunk` (lazy vertical). */
  private readonly columns = new Map<string, Map<number, Chunk>>();
  /** Authoritative per-chunk lifecycle records (status/tickets/tokens/queues). */
  readonly pipeline = new ChunkPipeline();
  /** Bumped on every chunk-map mutation so callers can guard cheap lookup caches
   *  against staleness without re-hashing string keys. */
  private revisionValue = 0;

  constructor(_registry: BlockRegistry) {
    // Registry is part of the constructor contract but not used by this
    // manager; chunk block data is addressed by the caller.
  }

  private static columnKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  /** Monotonic mutation counter for the chunk map (create/remove/dispose). */
  get revision(): number {
    return this.revisionValue;
  }

  /** Look up a loaded chunk by chunk coordinates. Returns undefined if not loaded. */
  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    return this.columns.get(ChunkManager.columnKey(cx, cz))?.get(cy);
  }

  /** Whether the column at (cx,cz) has any resident slabs. */
  hasColumn(cx: number, cz: number): boolean {
    const col = this.columns.get(ChunkManager.columnKey(cx, cz));
    return col !== undefined && col.size > 0;
  }

  /** All resident slabs for a column (snapshot), or empty if absent. */
  getColumnSlabs(cx: number, cz: number): readonly Chunk[] {
    const col = this.columns.get(ChunkManager.columnKey(cx, cz));
    return col ? [...col.values()] : [];
  }

  /** Read-only horizontal column projection; absent vertical layers stay absent. */
  getColumnResidency(cx: number, cz: number): ChunkColumnResidency | undefined {
    const slabs = this.getColumnSlabs(cx, cz);
    if (slabs.length === 0) return undefined;
    return { chunkX: cx, chunkZ: cz, slabs };
  }

  /** Iterate resident horizontal columns without exposing the mutable residency map. */
  forEachColumn(fn: (column: ChunkColumnResidency) => void): void {
    for (const [key, slabsByY] of this.columns) {
      const slabs = [...slabsByY.values()];
      if (slabs.length === 0) continue;
      const comma = key.indexOf(',');
      fn({
        chunkX: Number(key.slice(0, comma)),
        chunkZ: Number(key.slice(comma + 1)),
        slabs,
      });
    }
  }

  /** Number of resident columns (horizontal residency). */
  get columnCount(): number {
    return this.columns.size;
  }

  /** Create (or return the existing) chunk at the given coordinates, registering its lifecycle record. */
  createChunk(cx: number, cy: number, cz: number): Chunk {
    const colKey = ChunkManager.columnKey(cx, cz);
    let col = this.columns.get(colKey);
    if (!col) {
      col = new Map<number, Chunk>();
      this.columns.set(colKey, col);
    }
    let chunk = col.get(cy);
    if (!chunk) {
      chunk = new Chunk(cx, cy, cz);
      col.set(cy, chunk);
      this.pipeline.register(cx, cy, cz);
      this.revisionValue++;
    }
    return chunk;
  }

  /**
   * Remove a chunk from the map, freeing its block storage. Runs the authoritative eviction flow:
   * outstanding work is cancelled, the record passes through `Evicting`, then the record and the
   * chunk are dropped. The column entry is pruned when its last slab leaves so column residency
   * accurately reflects loaded columns. Canonical `CanonicalWorldStorage` columns are NOT removed
   * here; dirty columns remain visible via `storage.dirtyColumns()` for persistence.
   */
  removeChunk(cx: number, cy: number, cz: number): void {
    const colKey = ChunkManager.columnKey(cx, cz);
    const col = this.columns.get(colKey);
    if (!col || !col.has(cy)) return;
    const key = chunkKey(cx, cy, cz);
    if (this.pipeline.markEvicting(key).ok) {
      this.pipeline.finalizeEviction(key);
    }
    col.delete(cy);
    if (col.size === 0) {
      this.columns.delete(colKey);
    }
    this.revisionValue++;
  }

  /** Remove all slabs for a column (used only by tests/cleanup); runs eviction per slab. */
  removeColumn(cx: number, cz: number): void {
    const colKey = ChunkManager.columnKey(cx, cz);
    const col = this.columns.get(colKey);
    if (!col) return;
    for (const cy of [...col.keys()]) {
      const key = chunkKey(cx, cy, cz);
      if (this.pipeline.markEvicting(key).ok) {
        this.pipeline.finalizeEviction(key);
      }
    }
    this.columns.delete(colKey);
    this.revisionValue++;
  }

  /** Iterate over every loaded chunk. */
  forEachChunk(fn: (chunk: Chunk) => void): void {
    for (const col of this.columns.values()) {
      for (const chunk of col.values()) {
        fn(chunk);
      }
    }
  }

  /** Number of loaded slabs (total across all columns). */
  get size(): number {
    let n = 0;
    for (const col of this.columns.values()) n += col.size;
    return n;
  }
  // ── Lifecycle / ticket queries ─────────────────────────────────────────────

  /** Current lifecycle stage of the chunk (or of nothing when absent). */
  getStatus(cx: number, cy: number, cz: number): ChunkLifecycleStage {
    return this.pipeline.getStatus(cx, cy, cz);
  }

  /** True when the chunk has reached at least `min` in the pipeline order. Absent chunks fail. */
  isStatusAtLeast(cx: number, cy: number, cz: number, min: ChunkLifecycleStage): boolean {
    return isChunkLifecycleAtLeast(this.getStatus(cx, cy, cz), min);
  }

  /** Active (most-important) ticket for the chunk, or null. */
  getActiveTicket(cx: number, cy: number, cz: number): ChunkTicket | null {
    return this.pipeline.getRecordByCoords(cx, cy, cz)?.activeTicket ?? null;
  }

  /** All live tickets for the chunk (snapshot). */
  getTickets(cx: number, cy: number, cz: number): readonly ChunkTicket[] {
    return this.pipeline.getTickets(cx, cy, cz);
  }

  /** Attach a ticket (see {@link ChunkPipeline.acquireTicket}). Returns false when refused. */
  acquireTicket(
    cx: number,
    cy: number,
    cz: number,
    ticket: ChunkTicket,
  ): boolean {
    return this.pipeline.acquireTicket(cx, cy, cz, ticket) !== undefined;
  }

  /** Detach a matching ticket (see {@link ChunkPipeline.releaseTicket}). */
  releaseTicket(cx: number, cy: number, cz: number, ticket: ChunkTicket): boolean {
    return this.pipeline.releaseTicket(cx, cy, cz, ticket);
  }

  /** Queue depths per stage plus oldest-job age, for telemetry. */
  pipelineStats(): ReturnType<ChunkPipeline['stats']> {
    return this.pipeline.stats();
  }

  // Re-exported tuning constants so integrators read them from one place.
  static readonly QUEUE_CAPS = CHUNK_PIPELINE_QUEUE_CAPS;
  static readonly UNLOAD_HYSTERESIS_CHUNKS = UNLOAD_HYSTERESIS_CHUNKS;

  /** Drop all chunks and lifecycle state. */
  dispose(): void {
    this.pipeline.clear();
    this.columns.clear();
    this.revisionValue++;
  }
}
