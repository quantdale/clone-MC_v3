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

/**
 * Owns the set of loaded chunks, keyed by their chunk-coordinate triple.
 *
 * Storage delegates lifecycle bookkeeping to the {@link ChunkPipeline}: every chunk created here
 * gets an authoritative lifecycle record (status, tickets, generation token), and removals go
 * through the eviction flow (`Evicting` before release). The string-keyed chunk map remains the
 * source of truth for block data so existing callers (World.ts) compile unchanged.
 */
export class ChunkManager {
  private readonly chunks = new Map<string, Chunk>();
  /** Authoritative per-chunk lifecycle records (status/tickets/tokens/queues). */
  readonly pipeline = new ChunkPipeline();

  constructor(_registry: BlockRegistry) {
    // Registry is part of the constructor contract but not used by this
    // manager; chunk block data is addressed by the caller.
  }

  /** Look up a loaded chunk by chunk coordinates. Returns undefined if not loaded. */
  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cy, cz));
  }

  /** Create (or return the existing) chunk at the given coordinates, registering its lifecycle record. */
  createChunk(cx: number, cy: number, cz: number): Chunk {
    const key = chunkKey(cx, cy, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cy, cz);
      this.chunks.set(key, chunk);
      this.pipeline.register(cx, cy, cz);
    }
    return chunk;
  }

  /**
   * Remove a chunk from the map, freeing its block storage. Runs the authoritative eviction flow:
   * outstanding work is cancelled, the record passes through `Evicting`, then the record and the
   * chunk are dropped.
   */
  removeChunk(cx: number, cy: number, cz: number): void {
    const key = chunkKey(cx, cy, cz);
    if (!this.chunks.has(key)) return;
    if (this.pipeline.markEvicting(key).ok) {
      this.pipeline.finalizeEviction(key);
    }
    this.chunks.delete(key);
  }

  /** Iterate over every loaded chunk. */
  forEachChunk(fn: (chunk: Chunk) => void): void {
    for (const chunk of this.chunks.values()) {
      fn(chunk);
    }
  }

  /** Number of loaded chunks. */
  get size(): number {
    return this.chunks.size;
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
    this.chunks.clear();
  }
}
