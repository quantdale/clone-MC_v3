/**
 * Bounded, ordered, de-duplicated dirty-save queue (038). It collects dirty world-save units by a
 * unique key and drains them in FIFO order through an injected {@link SaveSink}, performing at most
 * `limit` writes per `drain`. Successfully written units leave the pending set; units whose write
 * fails are re-queued at the end so they are retried on a later drain (no silent loss). The queue is
 * in-memory and storage-framework-agnostic: it knows nothing about IndexedDB or the specific
 * repositories, which are supplied via the sink (see `RepositorySaveSink`).
 */

/** The kind of world data a save unit carries; one per 034-037 persistence boundary. */
export type SaveUnitKind = 'world-metadata' | 'chunk-sections' | 'block-entities' | 'entities';

/** A single dirty unit to persist. The unique `key` de-duplicates repeated marks. */
export interface SaveUnit {
  /** Unique unit key, e.g. `chunk-sections|a|1|2`. */
  key: string;
  /** Which persistence boundary owns this unit. */
  kind: SaveUnitKind;
  /** Owning world identifier. */
  worldId: string;
  /** Chunk X (0 for world-metadata). */
  chunkX: number;
  /** Chunk Z (0 for world-metadata). */
  chunkZ: number;
  /** Kind-specific data (WorldMetadata | SerializedChunkColumn | SerializedBlockEntity[] | SerializedEntity[]). */
  payload: unknown;
}

/** A persistence target for drained units; injected so the queue stays generic. */
export interface SaveSink {
  write(unit: SaveUnit): Promise<void>;
}

/**
 * Ordered, de-duplicated, bounded dirty-save queue. Units are keyed uniquely; re-marking an existing
 * key updates the stored unit but keeps its original FIFO position.
 */
export class DirtySaveQueue {
  private readonly pending = new Map<string, SaveUnit>();

  /** Mark a unit dirty (or refresh an already-pending one). Insertion order is retained on re-mark. */
  markDirty(unit: SaveUnit): void {
    this.pending.set(unit.key, unit);
  }

  /**
   * Drain up to `limit` pending units in FIFO order through `sink`. Each unit is removed from the
   * pending set before its write starts; a rejected write re-queues the unit at the end so it retries
   * next drain. Returns the number of units successfully written.
   */
  async drain(sink: SaveSink, limit: number): Promise<number> {
    if (!Number.isFinite(limit) || limit <= 0) return 0;

    const batch = [...this.pending.entries()].slice(0, limit);
    let written = 0;

    for (const [key, unit] of batch) {
      // Remove up front so a re-entrant drain cannot process the same unit twice.
      this.pending.delete(key);
      try {
        await sink.write(unit);
        written++;
      } catch {
        // Re-queue at the end for retry; preserves no-loss semantics.
        this.pending.set(key, unit);
      }
    }

    return written;
  }

  /** Number of pending (not-yet-drained) units. */
  get size(): number {
    return this.pending.size;
  }

  /** Whether a unit with `key` is currently pending. */
  has(key: string): boolean {
    return this.pending.has(key);
  }

  /** The pending unit keys in FIFO order. */
  keys(): string[] {
    return [...this.pending.keys()];
  }

  /** Remove all pending units. */
  clear(): void {
    this.pending.clear();
  }
}
